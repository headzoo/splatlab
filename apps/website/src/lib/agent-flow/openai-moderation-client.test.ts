import assert from "node:assert/strict";
import { register } from "node:module";
import path from "node:path";
import test, { afterEach, beforeEach } from "node:test";
import { pathToFileURL } from "node:url";

register(pathToFileURL(path.join(import.meta.dirname, "server-only-hook.mjs")).href, import.meta.url);

const {
  OpenAIContentModerator,
  createContentModerator,
} = await import("./openai-moderation-client");

const TEST_ENV = {
  OPENAI_API_KEY: "test-key",
  OPENAI_MODERATION_MODEL: "moderation-test",
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

let fetchCalls: FetchCall[] = [];
let originalFetch: typeof fetch;
let nextResponse: Response;

beforeEach(() => {
  fetchCalls = [];
  nextResponse = mockResponse(200, {
    results: [{ flagged: false, categories: {} }],
  });
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url, init) => {
    fetchCalls.push({ url: String(url), init });
    return nextResponse;
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("OpenAIContentModerator sends the configured model and returns a clean verdict", async () => {
  const moderator = new OpenAIContentModerator(TEST_ENV);

  assert.deepEqual(await moderator.screen("Build a friendly maze"), {
    flagged: false,
    categories: [],
  });
  assert.equal(fetchCalls[0]?.url, "https://api.openai.com/v1/moderations");
  assert.deepEqual(JSON.parse(String(fetchCalls[0]?.init?.body)), {
    model: "moderation-test",
    input: "Build a friendly maze",
  });
  assert.equal(
    (fetchCalls[0]?.init?.headers as Record<string, string>)?.Authorization,
    "Bearer test-key",
  );
});

test("OpenAIContentModerator returns only the categories the provider flagged", async () => {
  nextResponse = mockResponse(200, {
    results: [{
      flagged: true,
      categories: { violence: true, harassment: false, "self-harm": true },
    }],
  });
  const moderator = new OpenAIContentModerator(TEST_ENV);

  assert.deepEqual(await moderator.screen("provider-flagged text"), {
    flagged: true,
    categories: ["violence", "self-harm"],
  });
});

test("provider HTTP failures fail closed", async () => {
  nextResponse = mockResponse(503, { error: "unavailable" });
  const moderator = new OpenAIContentModerator(TEST_ENV);

  assert.deepEqual(await moderator.screen("please add coins"), {
    flagged: true,
    categories: [],
    unavailable: true,
  });
});

test("malformed provider payloads fail closed", async () => {
  nextResponse = mockResponse(200, { results: [] });
  const moderator = new OpenAIContentModerator(TEST_ENV);

  assert.deepEqual(await moderator.screen("please add coins"), {
    flagged: true,
    categories: [],
    unavailable: true,
  });

  nextResponse = mockResponse(200, { results: [{ flagged: false }] });
  assert.deepEqual(await moderator.screen("please add a platform"), {
    flagged: true,
    categories: [],
    unavailable: true,
  });
});

test("provider exceptions fail closed", async () => {
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  const moderator = new OpenAIContentModerator(TEST_ENV);

  assert.deepEqual(await moderator.screen("please add coins"), {
    flagged: true,
    categories: [],
    unavailable: true,
  });
});

test("a missing API key creates an unavailable moderator", async () => {
  const moderator = createContentModerator({} as NodeJS.ProcessEnv);

  assert.deepEqual(await moderator.screen("please add coins"), {
    flagged: true,
    categories: [],
    unavailable: true,
  });
  assert.equal(fetchCalls.length, 0);
});

test("an exported client constructed without a key also fails closed", async () => {
  const moderator = new OpenAIContentModerator({} as NodeJS.ProcessEnv);

  assert.deepEqual(await moderator.screen("please add coins"), {
    flagged: true,
    categories: [],
    unavailable: true,
  });
  assert.equal(fetchCalls.length, 0);
});
