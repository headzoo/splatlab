import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_GAME_DOCUMENT, gameDocumentSchema } from "../game-contract";
import { createGame, getGame } from "../games";
import { processBuildTurn } from "./build-turn-service";
import { type ModelClient } from "./model-client";
import {
  ALLOW_ALL_MODERATOR,
  COOPER_INBOUND_REDIRECT,
  COOPER_OUTBOUND_REDIRECT,
  safeScreen,
  type ContentModerator,
  type ModerationVerdict,
} from "./moderation";
import { AgentflowRateLimiter } from "./rate-limit";
import { AgentFlowRunStore } from "./run-store";

const COOPER_REPLY = "Your chicken runs faster now.";

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

test("screening failures fail open rather than breaking the turn", async () => {
  resetMemory();
  const game = await newGame();
  const throwing: ContentModerator = {
    async screen() {
      throw new Error("moderation provider is down");
    },
  };

  const result = await processBuildTurn(
    { ownerId: "owner-a", gameId: game.id, input: { message: "make my chicken faster" } },
    dependencies(new ScriptedModelClient(), throwing),
  );

  assert.equal(result.kind, "success");
  if (result.kind !== "success") return;
  assert.equal(result.body.cooperMessage, COOPER_REPLY);
});

test("safeScreen reports unflagged when a moderator throws", async () => {
  const verdict = await safeScreen("anything", {
    async screen() {
      throw new Error("boom");
    },
  });

  assert.deepEqual(verdict, { flagged: false, categories: [] });
});

test("the default moderator allows everything, so screening is opt-in", async () => {
  const verdict = await ALLOW_ALL_MODERATOR.screen("anything at all");
  assert.equal(verdict.flagged, false);
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
    { modelClient: pausing, moderator: ALLOW_ALL_MODERATOR, runStore: store, rateLimiter },
  );
  assert.equal((await store.loadActive("owner-a", game.id))?.status, "paused");

  const result = await processBuildTurn(
    { ownerId: "owner-a", gameId: game.id, input: { action: "proceed", feedback: "something nasty" } },
    { modelClient: pausing, moderator: moderatorFlagging("nasty"), runStore: store, rateLimiter },
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
