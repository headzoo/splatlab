import assert from "node:assert/strict";
import { register } from "node:module";
import path from "node:path";
import test, { afterEach, beforeEach } from "node:test";
import { pathToFileURL } from "node:url";

register(pathToFileURL(path.join(import.meta.dirname, "server-only-hook.mjs")).href, import.meta.url);

const {
  ModelConfigurationError,
  ModelOutputError,
  ModelProviderError,
} = await import("./model-client");
const { OpenAIResponsesModelClient } = await import("./openai-model-client");

const TEST_ENV = {
  OPENAI_API_KEY: "test-key",
  OPENAI_MODEL: "gpt-test",
} as unknown as NodeJS.ProcessEnv;

type FetchCall = {
  url: string;
  init?: RequestInit;
};

function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function messageOutput(text: string, extraOutputItems: unknown[] = []) {
  return {
    output: [
      ...extraOutputItems,
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text }],
      },
    ],
  };
}

let fetchCalls: FetchCall[] = [];
let fetchImpl: typeof fetch;
let nextResponse: Response = mockResponse(200, messageOutput("Hello"));

beforeEach(() => {
  fetchCalls = [];
  nextResponse = mockResponse(200, messageOutput("Hello"));
  fetchImpl = globalThis.fetch;
  globalThis.fetch = (async (url, init) => {
    fetchCalls.push({ url: String(url), init });
    return nextResponse;
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = fetchImpl;
});

test("OpenAIResponsesModelClient requires server-only credentials", () => {
  assert.throws(
    () => new OpenAIResponsesModelClient({} as NodeJS.ProcessEnv),
    (error: unknown) => error instanceof ModelConfigurationError,
  );
});

test("completeText extracts output_text blocks from the raw output array", async () => {
  nextResponse = mockResponse(200, messageOutput("Coordinator summary."));
  const client = new OpenAIResponsesModelClient(TEST_ENV);

  const text = await client.completeText({
    messages: [{ role: "user", content: "Build a maze" }],
  });

  assert.equal(text, "Coordinator summary.");
});

test("completeText combines multiple output_text blocks across message items", async () => {
  nextResponse = mockResponse(200, {
    output: [
      { type: "reasoning", content: [] },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Part one. " }],
      },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Part two." }],
      },
    ],
  });
  const client = new OpenAIResponsesModelClient(TEST_ENV);

  const text = await client.completeText({
    messages: [{ role: "user", content: "Build a maze" }],
  });

  assert.equal(text, "Part one. Part two.");
});

test("completeText rejects responses with no output_text content", async () => {
  nextResponse = mockResponse(200, {
    output: [{ type: "reasoning", content: [] }],
  });
  const client = new OpenAIResponsesModelClient(TEST_ENV);

  await assert.rejects(
    () => client.completeText({ messages: [{ role: "user", content: "Hi" }] }),
    (error: unknown) => error instanceof ModelOutputError,
  );
});

test("completeText ignores SDK-only output_text convenience field", async () => {
  nextResponse = mockResponse(200, {
    output_text: "Should not be used",
  });
  const client = new OpenAIResponsesModelClient(TEST_ENV);

  await assert.rejects(
    () => client.completeText({ messages: [{ role: "user", content: "Hi" }] }),
    (error: unknown) => error instanceof ModelOutputError,
  );
});

test("completeText sends store:false in the request body", async () => {
  const client = new OpenAIResponsesModelClient(TEST_ENV);
  await client.completeText({ messages: [{ role: "user", content: "Hi" }] });

  const body = JSON.parse(String(fetchCalls[0]?.init?.body));
  assert.equal(body.store, false);
  assert.equal(body.model, "gpt-test");
});

test("completeText maps provider HTTP failures", async () => {
  nextResponse = mockResponse(503, { error: "unavailable" });
  const client = new OpenAIResponsesModelClient(TEST_ENV);

  await assert.rejects(
    () => client.completeText({ messages: [{ role: "user", content: "Hi" }] }),
    (error: unknown) => error instanceof ModelProviderError,
  );
});

test("selectScenario parses scenario JSON from extracted output text", async () => {
  nextResponse = mockResponse(200, messageOutput('{"scenario":"Ready"}'));
  const client = new OpenAIResponsesModelClient(TEST_ENV);

  const scenario = await client.selectScenario({
    instructions: "Pick a branch",
    input: "Done.",
    scenarios: ["Ready", "Needs work"],
  });

  assert.equal(scenario, "Ready");
});

test("selectScenario rejects malformed scenario JSON", async () => {
  nextResponse = mockResponse(200, messageOutput("not json"));
  const client = new OpenAIResponsesModelClient(TEST_ENV);

  await assert.rejects(
    () =>
      client.selectScenario({
        instructions: "Pick a branch",
        input: "Done.",
        scenarios: ["Ready", "Needs work"],
      }),
    (error: unknown) => error instanceof ModelOutputError,
  );
});
