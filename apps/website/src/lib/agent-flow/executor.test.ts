import assert from "node:assert/strict";
import test from "node:test";

import starterFlow from "../../../../game/agent-flows/build_agentflow_v1.json";

import { DEFAULT_GAME_DOCUMENT, type BuilderChatTurn } from "../game-contract";
import { createGame } from "../games";
import { compileFlow } from "./contract";
import { type ModelClient, ModelOutputError, type ModelTextRequest } from "./model-client";
import { BuildExecutionError, executeBuildMessage, modelMessagesForTextNode, resumeBuildTurn } from "./executor";
import { AgentFlowRunStore } from "./run-store";

class ScriptedModelClient implements ModelClient {
  textCalls = 0;
  scenarioCalls = 0;
  textRequests: ModelTextRequest[] = [];

  constructor(
    private readonly response: string,
    private readonly scenario: string,
  ) {}

  async completeText(request: ModelTextRequest) {
    this.textCalls += 1;
    this.textRequests.push(request);
    return this.response;
  }

  async selectScenario() {
    this.scenarioCalls += 1;
    return this.scenario;
  }
}

function resetMemory() {
  globalThis.splatLabGamesMemory = [];
  globalThis.splatLabAgentFlowRunsMemory = [];
}

async function execute(model: ModelClient, builderChatHistory: BuilderChatTurn[] = []) {
  resetMemory();
  const game = await createGame("owner-a", {
    title: "Test game",
    spec: { ...DEFAULT_GAME_DOCUMENT, builderChatHistory },
  });
  const store = new AgentFlowRunStore({ forceMemory: true });
  const result = await executeBuildMessage(
    { ownerId: "owner-a", gameId: game.id, message: "Build a maze" },
    { modelClient: model, runStore: store },
  );
  return { game, store, result };
}

test("enabled Agent memory sends prior bounded history in transcript order without the current message", async () => {
  const model = new ScriptedModelClient("Done.", "Ready");
  await execute(model, [
    { role: "user", message: "Make it snowy" },
    { role: "cooper", message: "I will use the ice world." },
  ]);

  assert.deepEqual(model.textRequests[0]?.messages, [
    {
      role: "developer",
      content: "Coordinate the game-building agents for the requested change. Keep the work inside the selected game contract, collect each worker handoff, and return a concise implementation summary with unresolved risks.",
    },
    { role: "user", content: "Make it snowy" },
    { role: "assistant", content: "I will use the ice world." },
    { role: "user", content: "Build a maze" },
  ]);
  assert.equal(model.textRequests[0]?.messages.filter((message) => message.content === "Build a maze").length, 1);
});

test("memory-disabled Agent nodes omit persisted history", () => {
  const flow = structuredClone(starterFlow);
  flow.nodes.find((node: any) => node.id === "agentAgentflow_0")!.data.inputs.agentEnableMemory = false;
  const agent = compileFlow(flow).nodesById.get("agentAgentflow_0")!;
  const messages = modelMessagesForTextNode(agent, "Build a maze", {}, "", [
    { role: "user", message: "Prior request" },
    { role: "cooper", message: "Prior reply" },
  ]);
  assert.deepEqual(messages.map(({ role, content }) => ({ role, content })), [
    {
      role: "developer",
      content: "Coordinate the game-building agents for the requested change. Keep the work inside the selected game contract, collect each worker handoff, and return a concise implementation summary with unresolved risks.",
    },
    { role: "user", content: "Build a maze" },
  ]);
});

test("a cross-owner game cannot provide history to a build request", async () => {
  resetMemory();
  const foreignGame = await createGame("owner-b", {
    title: "Foreign game",
    spec: {
      ...DEFAULT_GAME_DOCUMENT,
      builderChatHistory: [{ role: "cooper", message: "Private history" }],
    },
  });
  const model = new ScriptedModelClient("Done.", "Ready");
  await assert.rejects(
    () => executeBuildMessage(
      { ownerId: "owner-a", gameId: foreignGame.id, message: "Build a maze" },
      { modelClient: model, runStore: new AgentFlowRunStore({ forceMemory: true }) },
    ),
    (error: unknown) => error instanceof BuildExecutionError && error.code === "game_not_found",
  );
  assert.equal(model.textCalls, 0);
});

test("Ready completes with preserved coordinator output and one call per model node", async () => {
  const model = new ScriptedModelClient("  A scoped and verified maze handoff.  ", "Ready");
  const { game, store, result } = await execute(model);

  assert.deepEqual(result, {
    status: "replied",
    cooperMessage: "A scoped and verified maze handoff.",
    runId: result.runId,
    gameRevision: 3,
  });
  assert.equal(model.textCalls, 1);
  assert.equal(model.scenarioCalls, 1);
  const run = globalThis.splatLabAgentFlowRunsMemory?.[0];
  assert.equal(run?.status, "done");
  assert.equal(run?.currentNodeId, "directReplyAgentflow_0");
  assert.equal(run?.flowOutput, result.cooperMessage);
  assert.equal(run?.flowState.buildStatus, result.cooperMessage);
  assert.equal(await store.loadActive("owner-a", game.id), null);
  assert.deepEqual(globalThis.splatLabGamesMemory?.[0]?.spec.builderChatHistory.map((turn) => turn.role), ["user", "cooper"]);
});

test("Needs work checkpoints one Human Input prompt", async () => {
  const model = new ScriptedModelClient("Draft needs a decision.", "Needs work");
  const { game, store, result } = await execute(model);

  assert.equal(result.status, "paused");
  assert.match(result.cooperMessage, /unresolved work/i);
  assert.equal(model.textCalls, 1);
  assert.equal(model.scenarioCalls, 1);
  const run = await store.loadActive("owner-a", game.id);
  assert.equal(run?.status, "paused");
  assert.equal(run?.currentNodeId, "humanInputAgentflow_0");
  assert.equal(run?.flowOutput, "Draft needs a decision.");
  assert.deepEqual(run?.pendingHumanInput, {
    nodeId: "humanInputAgentflow_0",
    branches: { Proceed: "loopAgentflow_0", Reject: "directReplyAgentflow_0" },
    enableFeedback: true,
  });
  assert.equal(globalThis.splatLabGamesMemory?.[0]?.spec.builderChatHistory.length, 2);
});

test("Reject completes a paused run from preserved output without a model call", async () => {
  const model = new ScriptedModelClient("Draft needs a decision.", "Needs work");
  const { game, store, result } = await execute(model);
  assert.equal(result.status, "paused");

  const resumed = await resumeBuildTurn(
    { ownerId: "owner-a", gameId: game.id, action: "reject", feedback: "Keep it as-is" },
    { modelClient: model, runStore: store },
  );

  assert.equal(resumed.status, "replied");
  assert.equal(resumed.cooperMessage, "Draft needs a decision.");
  assert.equal(model.textCalls, 1);
  assert.equal(model.scenarioCalls, 1);
  assert.equal(globalThis.splatLabAgentFlowRunsMemory?.[0]?.status, "done");
  assert.deepEqual(globalThis.splatLabGamesMemory?.[0]?.spec.builderChatHistory.map((turn) => turn.role), ["user", "cooper", "user", "cooper"]);
});

test("Proceed consumes one persisted loop and pauses again", async () => {
  class RetryingModel extends ScriptedModelClient {
    constructor() { super("", ""); }
    override async completeText(request: ModelTextRequest) {
      this.textCalls += 1;
      this.textRequests.push(request);
      return `Draft ${this.textCalls}`;
    }
    override async selectScenario() {
      this.scenarioCalls += 1;
      return "Needs work";
    }
  }
  const model = new RetryingModel();
  const { game, store, result } = await execute(model);
  const resumed = await resumeBuildTurn(
    { ownerId: "owner-a", gameId: game.id, action: "proceed", feedback: "Add coins" },
    { modelClient: model, runStore: store },
  );
  assert.equal(resumed.status, "paused");
  assert.equal(model.textCalls, 2);
  assert.equal(model.scenarioCalls, 2);
  assert.deepEqual(model.textRequests[1]?.messages.map(({ role, content }) => ({ role, content })), [
    {
      role: "developer",
      content: "Coordinate the game-building agents for the requested change. Keep the work inside the selected game contract, collect each worker handoff, and return a concise implementation summary with unresolved risks.",
    },
    { role: "assistant", content: result.cooperMessage },
    { role: "user", content: "Add coins" },
    { role: "user", content: "Build a maze" },
  ]);
  const run = await store.loadActive("owner-a", game.id);
  assert.equal(run?.loopCounts.loopAgentflow_0, 1);
  assert.equal(run?.flowState.humanFeedback, "Add coins");
});

test("loop exhaustion is enforced across paused resumes", async () => {
  const model = new ScriptedModelClient("Draft", "Needs work");
  const { game, store } = await execute(model);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const resumed = await resumeBuildTurn(
      { ownerId: "owner-a", gameId: game.id, action: "proceed" },
      { modelClient: model, runStore: store },
    );
    assert.equal(resumed.status, "paused");
  }
  await assert.rejects(
    () => resumeBuildTurn(
      { ownerId: "owner-a", gameId: game.id, action: "proceed" },
      { modelClient: model, runStore: store },
    ),
    (error: unknown) => error instanceof BuildExecutionError && error.code === "loop_exhausted",
  );
  assert.equal(model.textCalls, 4);
  assert.equal(model.scenarioCalls, 4);
  assert.equal(globalThis.splatLabAgentFlowRunsMemory?.[0]?.status, "failed");
});

test("a paused run with a stale flow hash fails before another model call", async () => {
  const model = new ScriptedModelClient("Draft", "Needs work");
  const { game, store } = await execute(model);
  globalThis.splatLabAgentFlowRunsMemory![0].flowHash = "stale-flow";

  await assert.rejects(
    () => resumeBuildTurn(
      { ownerId: "owner-a", gameId: game.id, action: "proceed" },
      { modelClient: model, runStore: store },
    ),
    (error: unknown) => error instanceof BuildExecutionError && error.code === "flow_hash_mismatch",
  );
  assert.equal(model.textCalls, 1);
  assert.equal(model.scenarioCalls, 1);
  assert.equal(globalThis.splatLabAgentFlowRunsMemory?.[0]?.status, "failed");
});

test("malformed scenario fails the run without a retry", async () => {
  const model = new ScriptedModelClient("Draft", "Maybe");
  await assert.rejects(() => execute(model), ModelOutputError);
  assert.equal(model.textCalls, 1);
  assert.equal(model.scenarioCalls, 1);
  assert.equal(globalThis.splatLabAgentFlowRunsMemory?.[0]?.status, "failed");
  assert.equal(globalThis.splatLabAgentFlowRunsMemory?.[0]?.failureCode, "model_output");
});

test("model failure releases the active run", async () => {
  const model: ModelClient = {
    async completeText() {
      throw new Error("unavailable");
    },
    async selectScenario() {
      throw new Error("must not run");
    },
  };
  await assert.rejects(() => execute(model));
  assert.equal(globalThis.splatLabAgentFlowRunsMemory?.[0]?.status, "failed");
  assert.equal(globalThis.splatLabAgentFlowRunsMemory?.[0]?.activeKey, null);
});
