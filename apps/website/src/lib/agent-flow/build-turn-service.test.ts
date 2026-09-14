import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_GAME_DOCUMENT } from "../game-contract";
import { createGame } from "../games";
import { mapBuildTurnFailure, processBuildTurn } from "./build-turn-service";
import { BuildExecutionError } from "./executor";
import {
  buildTurnInputSchema,
  type BuildTurnResponseBody,
} from "./http-contract";
import gateFlow from "./review-gate-flow.fixture.json";

import { compileFlow, FLOW_ID } from "./contract";
import { type ModelClient, ModelProviderError } from "./model-client";
import { AGENTFLOW_RATE_LIMIT_MAX, AgentflowRateLimiter } from "./rate-limit";
import { executeBuildMessage } from "./executor";
import { flowHashFor, type RegisteredFlow } from "./registry";
import { AgentFlowRunStore } from "./run-store";

/** Only a graph with Human Input can produce the paused run these tests resume. */
const compiledGate = compileFlow(gateFlow);
const GATE_FLOW: RegisteredFlow = Object.freeze({
  id: FLOW_ID,
  flow: compiledGate,
  flowHash: flowHashFor(compiledGate),
});

class ScriptedModelClient implements ModelClient {
  async completeTurn() {
    return { text: "A scoped and verified maze handoff.", toolCalls: [], items: [] };
  }

  async selectScenario() {
    return "Ready";
  }
}

/** Renames the game on its first turn, then replies without calling a tool. */
class RenamingModelClient implements ModelClient {
  private calls = 0;

  async completeTurn() {
    this.calls += 1;
    return this.calls === 1
      ? {
          text: "",
          toolCalls: [{
            callId: "call-rename",
            name: "rename_game",
            argumentsJson: JSON.stringify({ name: "Ice World" }),
          }],
          items: [],
        }
      : { text: "Your game is called Ice World now.", toolCalls: [], items: [] };
  }

  async selectScenario() {
    return "Ready";
  }
}

function resetMemory() {
  globalThis.splatLabGamesMemory = [];
  globalThis.splatLabAgentFlowRunsMemory = [];
  globalThis.splatLabAgentflowRateLimitMemory = [];
}

test("buildTurnInputSchema accepts message and action payloads separately", () => {
  assert.deepEqual(buildTurnInputSchema.parse({ message: "Build a maze" }), {
    message: "Build a maze",
  });
  assert.deepEqual(buildTurnInputSchema.parse({ action: "proceed" }), {
    action: "proceed",
  });
  assert.deepEqual(
    buildTurnInputSchema.parse({ action: "reject", feedback: "Try again" }),
    { action: "reject", feedback: "Try again" },
  );
});

test("buildTurnInputSchema rejects mixed and extra fields", () => {
  assert.equal(
    buildTurnInputSchema.safeParse({ message: "Hi", action: "proceed" }).success,
    false,
  );
  assert.equal(
    buildTurnInputSchema.safeParse({ message: "Hi", extra: true }).success,
    false,
  );
  assert.equal(buildTurnInputSchema.safeParse({ action: "pause" }).success, false);
  assert.equal(buildTurnInputSchema.safeParse({ message: "" }).success, false);
});

test("processBuildTurn maps a successful message to the HTTP body shape", async () => {
  resetMemory();
  const game = await createGame("owner-a", { title: "Test game", spec: DEFAULT_GAME_DOCUMENT });
  const store = new AgentFlowRunStore({ forceMemory: true });
  const rateLimiter = new AgentflowRateLimiter({ forceMemory: true });

  const result = await processBuildTurn(
    { ownerId: "owner-a", gameId: game.id, input: { message: "Build a maze" } },
    {
      modelClient: new ScriptedModelClient(),
      runStore: store,
      rateLimiter,
    },
  );

  assert.equal(result.kind, "success");
  if (result.kind !== "success") return;

  const body: BuildTurnResponseBody = result.body;
  assert.equal(body.status, "replied");
  assert.equal(body.cooperMessage, "A scoped and verified maze handoff.");
  assert.match(body.runId, /^[0-9a-f-]{36}$/);
  assert.equal(result.gameRevision, 3);
  assert.equal("title" in body, false, "a turn that renamed nothing sends no name");
});

test("processBuildTurn puts a rename on the wire so the builder stops saving the old name", async () => {
  resetMemory();
  const game = await createGame("owner-a", { title: "Test game", spec: DEFAULT_GAME_DOCUMENT });

  const result = await processBuildTurn(
    { ownerId: "owner-a", gameId: game.id, input: { message: "Rename the game to Ice World" } },
    {
      modelClient: new RenamingModelClient(),
      runStore: new AgentFlowRunStore({ forceMemory: true }),
      rateLimiter: new AgentflowRateLimiter({ forceMemory: true }),
    },
  );

  assert.equal(result.kind, "success");
  if (result.kind !== "success") return;

  assert.equal(result.body.title, "Ice World");
  assert.equal(globalThis.splatLabGamesMemory?.[0]?.title, "Ice World");
});

test("processBuildTurn meters Proceed even when there is no paused run", async () => {
  resetMemory();
  const game = await createGame("owner-a", { title: "Test game", spec: DEFAULT_GAME_DOCUMENT });
  const rateLimiter = new AgentflowRateLimiter({ forceMemory: true });

  const result = await processBuildTurn(
    { ownerId: "owner-a", gameId: game.id, input: { action: "proceed" } },
    {
      modelClient: new ScriptedModelClient(),
      runStore: new AgentFlowRunStore({ forceMemory: true }),
      rateLimiter,
    },
  );

  assert.deepEqual(result, {
    kind: "error",
    status: 409,
    message: "There is no valid paused build turn to resume.",
  });
  assert.equal(globalThis.splatLabAgentflowRateLimitMemory?.[0]?.count, 1);
});

test("processBuildTurn does not meter Reject or initialize its model client", async () => {
  resetMemory();
  const game = await createGame("owner-a", { title: "Test game", spec: DEFAULT_GAME_DOCUMENT });
  const store = new AgentFlowRunStore({ forceMemory: true });
  const model = new class implements ModelClient {
    async completeTurn() { return { text: "Draft needs a decision.", toolCalls: [], items: [] }; }
    async selectScenario() { return "Needs work"; }
  }();
  await executeBuildMessage(
    { ownerId: "owner-a", gameId: game.id, message: "Build a maze" },
    { modelClient: model, runStore: store, flow: GATE_FLOW },
  );
  const rateLimiter = new AgentflowRateLimiter({ forceMemory: true });
  let factoryCalls = 0;

  const result = await processBuildTurn(
    { ownerId: "owner-a", gameId: game.id, input: { action: "reject" } },
    {
      modelClient: () => {
        factoryCalls += 1;
        throw new Error("OPENAI_API_KEY is unavailable");
      },
      runStore: store,
      rateLimiter,
      flow: GATE_FLOW,
    },
  );

  assert.equal(result.kind, "success");
  assert.equal(factoryCalls, 0);
  assert.equal(globalThis.splatLabAgentflowRateLimitMemory?.length ?? 0, 0);
});

test("processBuildTurn limits Proceed before it claims a paused run", async () => {
  resetMemory();
  const game = await createGame("owner-a", { title: "Test game", spec: DEFAULT_GAME_DOCUMENT });
  const store = new AgentFlowRunStore({ forceMemory: true });
  const model = new class implements ModelClient {
    async completeTurn() { return { text: "Draft needs a decision.", toolCalls: [], items: [] }; }
    async selectScenario() { return "Needs work"; }
  }();
  await executeBuildMessage(
    { ownerId: "owner-a", gameId: game.id, message: "Build a maze" },
    { modelClient: model, runStore: store, flow: GATE_FLOW },
  );
  const rateLimiter = new AgentflowRateLimiter({ forceMemory: true });
  for (let attempt = 0; attempt < AGENTFLOW_RATE_LIMIT_MAX; attempt += 1) {
    assert.equal((await rateLimiter.consume("owner-a")).allowed, true);
  }
  let factoryCalls = 0;

  const result = await processBuildTurn(
    { ownerId: "owner-a", gameId: game.id, input: { action: "proceed" } },
    {
      modelClient: () => {
        factoryCalls += 1;
        return model;
      },
      runStore: store,
      rateLimiter,
      flow: GATE_FLOW,
    },
  );

  assert.equal(result.kind, "error");
  if (result.kind === "error") assert.equal(result.status, 429);
  assert.equal(factoryCalls, 0);
  assert.equal((await store.loadActive("owner-a", game.id))?.status, "paused");
});

test("processBuildTurn returns 429 after the model-bearing limit is reached", async () => {
  resetMemory();
  const game = await createGame("owner-a", { title: "Test game", spec: DEFAULT_GAME_DOCUMENT });
  const store = new AgentFlowRunStore({ forceMemory: true });
  const rateLimiter = new AgentflowRateLimiter({ forceMemory: true });
  const deps = {
    modelClient: new ScriptedModelClient(),
    runStore: store,
    rateLimiter,
  };

  for (let attempt = 0; attempt < AGENTFLOW_RATE_LIMIT_MAX; attempt += 1) {
    const result = await processBuildTurn(
      { ownerId: "owner-a", gameId: game.id, input: { message: `Turn ${attempt}` } },
      deps,
    );
    assert.equal(result.kind, "success");
  }

  const limited = await processBuildTurn(
    { ownerId: "owner-a", gameId: game.id, input: { message: "One more turn" } },
    deps,
  );

  assert.deepEqual(limited, {
    kind: "error",
    status: 429,
    message: "Cooper needs a short break. Try again in a moment.",
    retryAfterSeconds: limited.kind === "error" ? limited.retryAfterSeconds : undefined,
  });
  if (limited.kind === "error") {
    assert.ok(limited.retryAfterSeconds !== undefined && limited.retryAfterSeconds >= 1);
  }
});

test("mapBuildTurnFailure maps service errors to stable HTTP statuses", () => {
  assert.deepEqual(mapBuildTurnFailure(new BuildExecutionError("missing", "game_not_found")), {
    kind: "error",
    status: 404,
    message: "Game not found.",
  });
  assert.deepEqual(mapBuildTurnFailure(new BuildExecutionError("busy", "active_run")), {
    kind: "error",
    status: 409,
    message: "Cooper is still working on your last message. Wait for it to finish.",
  });
  assert.deepEqual(mapBuildTurnFailure(new ModelProviderError("down")), {
    kind: "error",
    status: 500,
    message: "Cooper couldn't respond right now. Try again in a moment.",
  });
});

test("processBuildTurn returns 404 for another owner's game", async () => {
  resetMemory();
  const game = await createGame("owner-a", { title: "Test game", spec: DEFAULT_GAME_DOCUMENT });

  const result = await processBuildTurn(
    { ownerId: "owner-b", gameId: game.id, input: { message: "Build a maze" } },
    {
      modelClient: new ScriptedModelClient(),
      runStore: new AgentFlowRunStore({ forceMemory: true }),
      rateLimiter: new AgentflowRateLimiter({ forceMemory: true }),
    },
  );

  assert.deepEqual(result, {
    kind: "error",
    status: 404,
    message: "Game not found.",
  });
});
