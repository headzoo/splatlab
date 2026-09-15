import assert from "node:assert/strict";
import test from "node:test";

import gateFlow from "./review-gate-flow.fixture.json";

import { DEFAULT_GAME_DOCUMENT, gameDocumentSchema } from "../game-contract";
import { createGame, getGame } from "../games";
import { processBuildTurn } from "./build-turn-service";
import { compileFlow, FLOW_ID } from "./contract";
import { type ModelClient } from "./model-client";
import {
  ALLOW_ALL_MODERATOR,
  COOPER_INBOUND_REDIRECT,
  COOPER_MODERATION_UNAVAILABLE_REDIRECT,
  COOPER_OUTBOUND_REDIRECT,
  deterministicScreen,
  safeScreen,
  type ContentModerator,
  type ModerationVerdict,
} from "./moderation";
import { AgentflowRateLimiter } from "./rate-limit";
import { flowHashFor, type RegisteredFlow } from "./registry";
import { AgentFlowRunStore } from "./run-store";

const COOPER_REPLY = "Your chicken runs faster now.";

/** Only a graph with Human Input can produce a paused run to reword feedback on. */
const compiledGate = compileFlow(gateFlow);
const GATE_FLOW: RegisteredFlow = Object.freeze({
  id: FLOW_ID,
  flow: compiledGate,
  flowHash: flowHashFor(compiledGate),
});

class ScriptedModelClient implements ModelClient {
  calls = 0;

  constructor(private readonly text: string = COOPER_REPLY) {}

  async completeTurn() {
    this.calls += 1;
    return { text: this.text, toolCalls: [], items: [] };
  }

  async selectScenario() {
    return "Ready";
  }
}

/** Flags any text containing `trigger`, so a test can aim it inbound or outbound. */
function moderatorFlagging(trigger: string): ContentModerator {
  return {
    async screen(text: string): Promise<ModerationVerdict> {
      return text.includes(trigger)
        ? { flagged: true, categories: ["violence"] }
        : { flagged: false, categories: [] };
    },
  };
}

function resetMemory() {
  globalThis.splatLabGamesMemory = [];
  globalThis.splatLabAgentFlowRunsMemory = [];
  globalThis.splatLabAgentflowRateLimitMemory = [];
}

async function newGame() {
  return createGame("owner-a", { title: "Test game", spec: DEFAULT_GAME_DOCUMENT });
}

function dependencies(modelClient: ModelClient, moderator: ContentModerator) {
  return {
    modelClient,
    moderator,
    runStore: new AgentFlowRunStore({ forceMemory: true }),
    rateLimiter: new AgentflowRateLimiter({ forceMemory: true }),
  };
}

async function chatHistory(gameId: string) {
  const game = await getGame("owner-a", gameId);
  assert.ok(game);
  return gameDocumentSchema.parse(game.spec).builderChatHistory;
}

test("a flagged message is redirected in Cooper's voice without reaching the model", async () => {
  resetMemory();
  const game = await newGame();
  const model = new ScriptedModelClient();

  const result = await processBuildTurn(
    { ownerId: "owner-a", gameId: game.id, input: { message: "something nasty" } },
    dependencies(model, moderatorFlagging("nasty")),
  );

  assert.equal(result.kind, "success");
  if (result.kind !== "success") return;
  assert.equal(result.body.cooperMessage, COOPER_INBOUND_REDIRECT);
  assert.equal(result.body.status, "replied");
  assert.equal(model.calls, 0, "a flagged message must not reach the model");
  assert.equal(result.gameRevision, game.revision, "a declined turn must not change the game");
});

test("a flagged message never enters the transcript", async () => {
  resetMemory();
  const game = await newGame();

  await processBuildTurn(
    { ownerId: "owner-a", gameId: game.id, input: { message: "something nasty" } },
    dependencies(new ScriptedModelClient(), moderatorFlagging("nasty")),
  );

  const history = await chatHistory(game.id);
  assert.equal(
    history.some((turn) => turn.message.includes("nasty")),
    false,
    "flagged text would otherwise replay into the next turn's context",
  );
});

test("a clean message runs the flow as normal", async () => {
  resetMemory();
  const game = await newGame();
  const model = new ScriptedModelClient();

  const result = await processBuildTurn(
    { ownerId: "owner-a", gameId: game.id, input: { message: "make my chicken faster" } },
    dependencies(model, moderatorFlagging("nasty")),
  );

  assert.equal(result.kind, "success");
  if (result.kind !== "success") return;
  assert.equal(result.body.cooperMessage, COOPER_REPLY);
  assert.equal(model.calls, 1);
});

test("a flagged Cooper reply is swapped before it is persisted", async () => {
  resetMemory();
  const game = await newGame();

  const result = await processBuildTurn(
    { ownerId: "owner-a", gameId: game.id, input: { message: "make my chicken faster" } },
    dependencies(new ScriptedModelClient("a reply with gore in it"), moderatorFlagging("gore")),
  );

  assert.equal(result.kind, "success");
  if (result.kind !== "success") return;
  assert.equal(result.body.cooperMessage, COOPER_OUTBOUND_REDIRECT);

  const history = await chatHistory(game.id);
  assert.equal(
    history.some((turn) => turn.message.includes("gore")),
    false,
    "a flagged reply must not reach the transcript",
  );
  assert.equal(history.at(-1)?.message, COOPER_OUTBOUND_REDIRECT);
});

test("an unavailable outbound check replaces the draft before persistence", async () => {
  resetMemory();
  const game = await newGame();
  let calls = 0;
  const moderator: ContentModerator = {
    async screen() {
      calls += 1;
      if (calls === 1) return { flagged: false, categories: [] };
      throw new Error("moderation provider went down");
    },
  };

  const result = await processBuildTurn(
    { ownerId: "owner-a", gameId: game.id, input: { message: "make my chicken faster" } },
    dependencies(new ScriptedModelClient(), moderator),
  );

  assert.equal(result.kind, "success");
  if (result.kind !== "success") return;
  assert.equal(result.body.cooperMessage, COOPER_MODERATION_UNAVAILABLE_REDIRECT);
  const history = await chatHistory(game.id);
  assert.equal(history.some((turn) => turn.message === COOPER_REPLY), false);
  assert.equal(history.at(-1)?.message, COOPER_MODERATION_UNAVAILABLE_REDIRECT);
});

test("screening failures fail closed with a polite retry response", async () => {
  resetMemory();
  const game = await newGame();
  const model = new ScriptedModelClient();
  const throwing: ContentModerator = {
    async screen() {
      throw new Error("moderation provider is down");
    },
  };

  const result = await processBuildTurn(
    { ownerId: "owner-a", gameId: game.id, input: { message: "make my chicken faster" } },
    dependencies(model, throwing),
  );

  assert.equal(result.kind, "success");
  if (result.kind !== "success") return;
  assert.equal(result.body.cooperMessage, COOPER_MODERATION_UNAVAILABLE_REDIRECT);
  assert.equal(model.calls, 0, "unverified text must not reach the model");
  assert.equal(result.gameRevision, game.revision, "an unavailable check must not change the game");
  assert.deepEqual(await chatHistory(game.id), []);
});

test("an omitted service moderator also fails closed", async () => {
  resetMemory();
  const game = await newGame();
  const model = new ScriptedModelClient();

  const result = await processBuildTurn(
    { ownerId: "owner-a", gameId: game.id, input: { message: "make my chicken faster" } },
    {
      modelClient: model,
      runStore: new AgentFlowRunStore({ forceMemory: true }),
      rateLimiter: new AgentflowRateLimiter({ forceMemory: true }),
    },
  );

  assert.equal(result.kind, "success");
  if (result.kind !== "success") return;
  assert.equal(result.body.cooperMessage, COOPER_MODERATION_UNAVAILABLE_REDIRECT);
  assert.equal(model.calls, 0);
});

test("safeScreen reports unavailable when a moderator throws", async () => {
  const verdict = await safeScreen("anything", {
    async screen() {
      throw new Error("boom");
    },
  });

  assert.deepEqual(verdict, { flagged: true, categories: [], unavailable: true });
});

test("the explicit test moderator allows clean text", async () => {
  const verdict = await ALLOW_ALL_MODERATOR.screen("anything at all");
  assert.equal(verdict.flagged, false);
});

test("the deterministic filter catches common obfuscations before the provider", async () => {
  let providerCalls = 0;
  const verdict = await safeScreen("f.u.c.k and sh1t", {
    async screen() {
      providerCalls += 1;
      return { flagged: false, categories: [] };
    },
  });

  assert.equal(verdict.flagged, true);
  assert.deepEqual(verdict.categories, ["local/profanity"]);
  assert.equal(providerCalls, 0, "known bad words should be rejected locally");
});

test("the deterministic filter catches spaced words and self-harm phrases", () => {
  assert.equal(deterministicScreen("f u c k").flagged, true);
  assert.equal(deterministicScreen("fuuuuck").flagged, true);
  assert.equal(deterministicScreen("fúck").flagged, true);
  assert.deepEqual(deterministicScreen("I want to hurt myself").categories, ["local/self-harm"]);
});

test("the deterministic filter matches whole normalized words", () => {
  assert.deepEqual(deterministicScreen("Classic grass platforms"), {
    flagged: false,
    categories: [],
  });
});

test("malformed moderator verdicts fail closed", async () => {
  const malformed = {
    async screen() {
      return { flagged: false };
    },
  } as unknown as ContentModerator;

  assert.deepEqual(await safeScreen("a clean message", malformed), {
    flagged: true,
    categories: [],
    unavailable: true,
  });
});

test("flagged feedback is redirected and leaves the paused run claimable", async () => {
  resetMemory();
  const game = await newGame();
  const pausing = new class implements ModelClient {
    async completeTurn() { return { text: "I need you to choose.", toolCalls: [], items: [] }; }
    async selectScenario() { return "Needs work"; }
  }();
  const store = new AgentFlowRunStore({ forceMemory: true });
  const rateLimiter = new AgentflowRateLimiter({ forceMemory: true });

  await processBuildTurn(
    { ownerId: "owner-a", gameId: game.id, input: { message: "make my chicken faster" } },
    { modelClient: pausing, moderator: ALLOW_ALL_MODERATOR, runStore: store, rateLimiter, flow: GATE_FLOW },
  );
  assert.equal((await store.loadActive("owner-a", game.id))?.status, "paused");

  const result = await processBuildTurn(
    { ownerId: "owner-a", gameId: game.id, input: { action: "proceed", feedback: "something nasty" } },
    { modelClient: pausing, moderator: moderatorFlagging("nasty"), runStore: store, rateLimiter, flow: GATE_FLOW },
  );

  assert.equal(result.kind, "success");
  if (result.kind !== "success") return;
  assert.equal(result.body.cooperMessage, COOPER_INBOUND_REDIRECT);
  assert.equal(
    (await store.loadActive("owner-a", game.id))?.status,
    "paused",
    "the kid must be able to reword and act on the same paused run",
  );
});

test("unavailable feedback moderation is polite and leaves the paused run claimable", async () => {
  resetMemory();
  const game = await newGame();
  const pausing = new class implements ModelClient {
    async completeTurn() { return { text: "I need you to choose.", toolCalls: [], items: [] }; }
    async selectScenario() { return "Needs work"; }
  }();
  const store = new AgentFlowRunStore({ forceMemory: true });
  const rateLimiter = new AgentflowRateLimiter({ forceMemory: true });

  await processBuildTurn(
    { ownerId: "owner-a", gameId: game.id, input: { message: "make my chicken faster" } },
    { modelClient: pausing, moderator: ALLOW_ALL_MODERATOR, runStore: store, rateLimiter, flow: GATE_FLOW },
  );

  const result = await processBuildTurn(
    { ownerId: "owner-a", gameId: game.id, input: { action: "proceed", feedback: "add coins" } },
    {
      modelClient: pausing,
      moderator: { async screen() { throw new Error("provider down"); } },
      runStore: store,
      rateLimiter,
      flow: GATE_FLOW,
    },
  );

  assert.equal(result.kind, "success");
  if (result.kind !== "success") return;
  assert.equal(result.body.cooperMessage, COOPER_MODERATION_UNAVAILABLE_REDIRECT);
  assert.equal((await store.loadActive("owner-a", game.id))?.status, "paused");
});
