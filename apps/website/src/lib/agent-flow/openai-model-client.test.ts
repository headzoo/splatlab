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

const NO_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {},
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

test("completeTurn extracts output_text blocks from the raw output array", async () => {
  nextResponse = mockResponse(200, messageOutput("Coordinator summary."));
  const client = new OpenAIResponsesModelClient(TEST_ENV);

  const turn = await client.completeTurn({
    messages: [{ role: "user", content: "Build a maze" }],
  });

  assert.equal(turn.text, "Coordinator summary.");
  assert.deepEqual(turn.toolCalls, []);
});

test("completeTurn combines multiple output_text blocks across message items", async () => {
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

  const turn = await client.completeTurn({
    messages: [{ role: "user", content: "Build a maze" }],
  });

  assert.equal(turn.text, "Part one. Part two.");
});

test("completeTurn reports empty text rather than throwing when the model wrote none", async () => {
  nextResponse = mockResponse(200, {
    output: [{ type: "reasoning", content: [] }],
  });
  const client = new OpenAIResponsesModelClient(TEST_ENV);

  const turn = await client.completeTurn({ messages: [{ role: "user", content: "Hi" }] });

  assert.equal(turn.text, "");
  assert.deepEqual(turn.toolCalls, []);
  assert.deepEqual(turn.items, []);
});

test("completeTurn ignores SDK-only output_text convenience field", async () => {
  nextResponse = mockResponse(200, {
    output_text: "Should not be used",
  });
  const client = new OpenAIResponsesModelClient(TEST_ENV);

  await assert.rejects(
    () => client.completeTurn({ messages: [{ role: "user", content: "Hi" }] }),
    (error: unknown) => error instanceof ModelOutputError,
  );
});

test("completeTurn sends store:false in the request body", async () => {
  const client = new OpenAIResponsesModelClient(TEST_ENV);
  await client.completeTurn({ messages: [{ role: "user", content: "Hi" }] });

  const body = JSON.parse(String(fetchCalls[0]?.init?.body));
  assert.equal(body.store, false);
  assert.equal(body.model, "gpt-test");
});

test("completeTurn maps provider HTTP failures", async () => {
  nextResponse = mockResponse(503, { error: "unavailable" });
  const client = new OpenAIResponsesModelClient(TEST_ENV);

  await assert.rejects(
    () => client.completeTurn({ messages: [{ role: "user", content: "Hi" }] }),
    (error: unknown) => error instanceof ModelProviderError,
  );
});

test("completeTurn omits tools entirely when the node configures none", async () => {
  const client = new OpenAIResponsesModelClient(TEST_ENV);
  await client.completeTurn({ messages: [{ role: "user", content: "Hi" }], tools: [] });

  const body = JSON.parse(String(fetchCalls[0]?.init?.body));
  assert.equal("tools" in body, false);
  assert.equal("tool_choice" in body, false);
  // 300 for the reply plus the reasoning allowance every budget reserves.
  assert.equal(body.max_output_tokens, 2_300);
});

test("completeTurn serializes tools in the flat Responses shape with strict schemas", async () => {
  const client = new OpenAIResponsesModelClient(TEST_ENV);
  await client.completeTurn({
    messages: [{ role: "user", content: "Make me jump higher" }],
    tools: [{
      name: "read_game_physics",
      description: "Read the current settings.",
      parameters: { type: "object", additionalProperties: false, required: [], properties: {} },
    }],
  });

  const body = JSON.parse(String(fetchCalls[0]?.init?.body));
  assert.deepEqual(body.tools, [{
    type: "function",
    name: "read_game_physics",
    description: "Read the current settings.",
    parameters: { type: "object", additionalProperties: false, required: [], properties: {} },
    strict: true,
  }]);
  assert.equal(body.tool_choice, "auto");
  // 700 for a call plus the closing reply, on top of the reasoning allowance.
  assert.equal(body.max_output_tokens, 2_700);
});

test("completeTurn reports a truncated response as a provider failure", async () => {
  // A reasoning model that spends the whole budget thinking returns no text and
  // no tool call, which must not reach the executor as malformed output.
  nextResponse = mockResponse(200, {
    status: "incomplete",
    incomplete_details: { reason: "max_output_tokens" },
    output: [{ type: "reasoning", content: [] }],
  });
  const client = new OpenAIResponsesModelClient(TEST_ENV);

  await assert.rejects(
    () => client.completeTurn({ messages: [{ role: "user", content: "Reduce the gravity" }] }),
    (error: unknown) => error instanceof ModelProviderError && /cut off \(max_output_tokens\)/.test(error.message),
  );
});

test("selectScenario reports a truncated response as a provider failure", async () => {
  nextResponse = mockResponse(200, {
    status: "incomplete",
    incomplete_details: { reason: "max_output_tokens" },
    output: [],
  });
  const client = new OpenAIResponsesModelClient(TEST_ENV);

  await assert.rejects(
    () => client.selectScenario({ instructions: "Pick one", input: "text", scenarios: ["Ready"] }),
    (error: unknown) => error instanceof ModelProviderError,
  );
});

test("completeTurn parses function_call output items and keeps them for the next round", async () => {
  nextResponse = mockResponse(200, {
    output: [
      { type: "reasoning", content: [] },
      { type: "function_call", call_id: "call_1", name: "patch_game_physics", arguments: '{"baseRevision":1}' },
    ],
  });
  const client = new OpenAIResponsesModelClient(TEST_ENV);

  const turn = await client.completeTurn({ messages: [{ role: "user", content: "Higher" }] });

  assert.equal(turn.text, "");
  assert.deepEqual(turn.toolCalls, [
    { callId: "call_1", name: "patch_game_physics", argumentsJson: '{"baseRevision":1}' },
  ]);
  // The reasoning item is dropped; only replayable items are carried forward.
  assert.deepEqual(turn.items, [
    { type: "function_call", call_id: "call_1", name: "patch_game_physics", arguments: '{"baseRevision":1}' },
  ]);
});

test("completeTurn rejects a function call with no call identifier", async () => {
  nextResponse = mockResponse(200, {
    output: [{ type: "function_call", name: "patch_game_physics", arguments: "{}" }],
  });
  const client = new OpenAIResponsesModelClient(TEST_ENV);

  await assert.rejects(
    () => client.completeTurn({ messages: [{ role: "user", content: "Higher" }] }),
    (error: unknown) => error instanceof ModelOutputError,
  );
});

test("completeTurn echoes prior items plus function_call_output on the next round", async () => {
  const priorCall = { type: "function_call", call_id: "call_1", name: "read_game_physics", arguments: "{}" };
  const client = new OpenAIResponsesModelClient(TEST_ENV);

  const turn = await client.completeTurn({
    messages: [{ role: "user", content: "Higher" }],
    tools: [{ name: "read_game_physics", description: "Read.", parameters: NO_PARAMETERS }],
    history: [priorCall],
    toolOutputs: [{ callId: "call_1", output: '{"ok":true}' }],
  });

  const body = JSON.parse(String(fetchCalls[0]?.init?.body));
  assert.deepEqual(body.input, [
    { role: "user", content: "Higher" },
    priorCall,
    { type: "function_call_output", call_id: "call_1", output: '{"ok":true}' },
  ]);
  assert.deepEqual(turn.items, [
    priorCall,
    { type: "function_call_output", call_id: "call_1", output: '{"ok":true}' },
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "Hello" }] },
  ]);
});

test("selectScenario never sends tools", async () => {
  nextResponse = mockResponse(200, messageOutput('{"scenario":"Ready"}'));
  const client = new OpenAIResponsesModelClient(TEST_ENV);
  await client.selectScenario({ instructions: "Pick", input: "Done.", scenarios: ["Ready", "Needs work"] });

  const body = JSON.parse(String(fetchCalls[0]?.init?.body));
  assert.equal("tools" in body, false);
  assert.equal(body.text.format.type, "json_schema");
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
