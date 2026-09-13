import assert from "node:assert/strict";
import test from "node:test";

import starterFlow from "../../../../game/agent-flows/build_agentflow_v1.json";

import { createInitialState } from "../../game/platformer/engine";
import { activePlayerAssetId, DEFAULT_GAME_DOCUMENT, type BuilderChatTurn } from "../game-contract";
import { resolveActivePlatformerLevel } from "../game-objects";
import { CATALOG_PLATFORMER_GAME_PHYSICS } from "../game-physics";
import { createGame } from "../games";
import { compileFlow } from "./contract";
import { type ModelClient, ModelOutputError, type ModelToolCall, type ModelTurnRequest, type ModelTurnResult } from "./model-client";
import { BuildExecutionError, executeBuildMessage, modelMessagesForTextNode, resumeBuildTurn } from "./executor";
import { AgentFlowRunStore } from "./run-store";

const COORDINATOR_MESSAGE = (starterFlow.nodes.find((node) => node.id === "agentAgentflow_0")
  ?.data.inputs as { agentMessages: { content: string }[] }).agentMessages[0].content;

/**
 * The newest message is wrapped so the model can tell the kid's words apart
 * from its own instructions. Replayed history and Proceed feedback are not.
 */
const kidMessage = (text: string) => `<kid_message>\n${text}\n</kid_message>`;

class ScriptedModelClient implements ModelClient {
  textCalls = 0;
  scenarioCalls = 0;
  textRequests: ModelTurnRequest[] = [];

  constructor(
    private readonly response: string,
    private readonly scenario: string,
  ) {}

  async completeTurn(request: ModelTurnRequest): Promise<ModelTurnResult> {
    this.textCalls += 1;
    this.textRequests.push(request);
    return { text: this.response, toolCalls: [], items: [] };
  }

  async selectScenario() {
    this.scenarioCalls += 1;
    return this.scenario;
  }
}

/** Replays one scripted model turn per call so tool loops can be exercised. */
class ScriptedToolModel implements ModelClient {
  readonly requests: ModelTurnRequest[] = [];
  scenarioCalls = 0;

  constructor(
    private readonly turns: readonly ModelTurnResult[],
    private readonly scenario = "Ready",
  ) {}

  async completeTurn(request: ModelTurnRequest): Promise<ModelTurnResult> {
    this.requests.push(request);
    const turn = this.turns[this.requests.length - 1];
    if (!turn) throw new Error("unscripted model call");
    return turn;
  }

  async selectScenario() {
    this.scenarioCalls += 1;
    return this.scenario;
  }
}

function toolCall(name: string, args: unknown, callId = `call-${name}`): ModelToolCall {
  return { callId, name, argumentsJson: JSON.stringify(args) };
}

function jumpHeightPatch(value: number, baseRevision = 1) {
  return {
    baseRevision,
    operations: [{ op: "replace", path: "/verticalMovement/groundedJump/jumpHeightTiles", value }],
  };
}

function storedPhysics() {
  return globalThis.splatLabGamesMemory?.[0]?.spec.physicsDocument;
}

function storedSpec() {
  return globalThis.splatLabGamesMemory?.[0]?.spec;
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
      content: COORDINATOR_MESSAGE,
    },
    { role: "user", content: "Make it snowy" },
    { role: "assistant", content: "I will use the ice world." },
    { role: "user", content: kidMessage("Build a maze") },
  ]);
  assert.equal(
    model.textRequests[0]?.messages.filter(
      (message) => message.content === kidMessage("Build a maze"),
    ).length,
    1,
  );
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
      content: COORDINATOR_MESSAGE,
    },
    { role: "user", content: kidMessage("Build a maze") },
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
    physicsDocument: undefined,
    specChange: undefined,
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
  // The pause prompt has to name both buttons the kid is about to choose between.
  assert.match(result.cooperMessage, /Proceed/);
  assert.match(result.cooperMessage, /Reject/);
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
    override async completeTurn(request: ModelTurnRequest): Promise<ModelTurnResult> {
      this.textCalls += 1;
      this.textRequests.push(request);
      return { text: `Draft ${this.textCalls}`, toolCalls: [], items: [] };
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
      content: COORDINATOR_MESSAGE,
    },
    { role: "assistant", content: result.cooperMessage },
    { role: "user", content: "Add coins" },
    { role: "user", content: kidMessage("Build a maze") },
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
    async completeTurn() {
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

test("the coordinator Agent node offers exactly the allowlisted tools", async () => {
  const model = new ScriptedToolModel([{ text: "Done.", toolCalls: [], items: [] }]);
  await execute(model);

  assert.deepEqual(model.requests[0]?.tools?.map((tool) => tool.name), [
    "read_game_physics",
    "patch_game_physics",
    "read_game_objects",
    "add_game_objects",
    "remove_game_objects",
    "set_starting_lives",
    "set_player_character",
    "set_enemy_appearance",
  ]);
});

test("asking for ten lives saves it as the level's starting count", async () => {
  const model = new ScriptedToolModel([
    { text: "", toolCalls: [toolCall("set_starting_lives", { lives: 10 })], items: [] },
    { text: "You get ten lives now.", toolCalls: [], items: [] },
  ]);
  const { result } = await execute(model);

  assert.equal(result.specChange?.startingLives, 10);
  assert.equal(storedSpec()?.startingLives, 10);

  const spec = storedSpec();
  assert.ok(spec);
  const level = resolveActivePlatformerLevel(spec);
  assert.ok(level);
  assert.equal(
    createInitialState(level.map).lives,
    10,
    "the played map, not just the reply, starts the player on ten",
  );
});

test("a life count out of range is refused with a reason the model can relay", async () => {
  const model = new ScriptedToolModel([
    { text: "", toolCalls: [toolCall("set_starting_lives", { lives: 500 })], items: [] },
    { text: "That is too many, want ninety-nine?", toolCalls: [], items: [] },
  ]);
  const { result } = await execute(model);

  assert.equal(result.specChange, undefined);
  assert.equal(storedSpec()?.startingLives, undefined);
  assert.match(String(model.requests[1]?.toolOutputs?.[0]?.output), /between 1 and 99/);
});

test("turning the ghosts into robots repaints them through the whole flow", async () => {
  const model = new ScriptedToolModel([
    { text: "", toolCalls: [toolCall("read_game_objects", {}, "call-read")], items: [{ type: "function_call", call_id: "call-read" }] },
    {
      text: "",
      toolCalls: [toolCall("set_enemy_appearance", { look: "neutral_robot_01", fromLook: "neutral_ghost_01", cells: [] })],
      items: [{ type: "function_call" }],
    },
    { text: "The ghosts are robots now.", toolCalls: [], items: [] },
  ]);
  const { result } = await execute(model);

  assert.equal(result.cooperMessage, "The ghosts are robots now.");
  assert.equal(result.specChange?.platformerObjectSettings?.length, 2);
  assert.deepEqual(
    storedSpec()?.platformerObjectSettings.map((entry) => entry.assetId),
    ["neutral_robot_01", "neutral_robot_01"],
  );

  // The looks and their options reach the model so it never invents an id.
  assert.match(String(model.requests[1]?.toolOutputs?.[0]?.output), /"enemyLooks"/);
});

test("changing the hero is saved and rides back to the client", async () => {
  const model = new ScriptedToolModel([
    { text: "", toolCalls: [toolCall("set_player_character", { character: "human", gender: "girl" })], items: [] },
    { text: "You are a human now.", toolCalls: [], items: [] },
  ]);
  const { result } = await execute(model);

  assert.equal(result.specChange?.playerCharacter, "human");
  assert.equal(result.specChange?.humanGender, "girl");

  const spec = storedSpec();
  assert.ok(spec);
  assert.equal(spec.playerCharacter, "human");
  assert.equal(activePlayerAssetId(spec), "neutral_girl_01");
});

test("reading the level then adding an object saves it and rides back to the client", async () => {
  const model = new ScriptedToolModel([
    { text: "", toolCalls: [toolCall("read_game_objects", {}, "call-read")], items: [{ type: "function_call", call_id: "call-read" }] },
    {
      text: "",
      toolCalls: [toolCall("add_game_objects", { placements: [{ kind: "coin", x: 0, y: 0 }, { kind: "enemy", x: 0, y: 10 }] })],
      items: [{ type: "function_call" }],
    },
    { text: "I dropped in a coin and a new enemy.", toolCalls: [], items: [] },
  ]);
  const { result } = await execute(model);

  assert.equal(result.status, "replied");
  assert.equal(result.cooperMessage, "I dropped in a coin and a new enemy.");
  assert.deepEqual(result.specChange?.platformerObjectEdits, [
    { id: "cooper-coin-1", mapSource: "level-1.json", x: 0, y: 0, kind: "coin" },
    { id: "cooper-enemy-1", mapSource: "level-1.json", x: 0, y: 10, kind: "enemy" },
  ]);
  assert.deepEqual(storedSpec()?.platformerObjectEdits, result.specChange?.platformerObjectEdits);

  // The grids reach the model, and the reply reports the new totals.
  assert.match(String(model.requests[1]?.toolOutputs?.[0]?.output), /"terrain":\[/);
  assert.match(String(model.requests[2]?.toolOutputs?.[0]?.output), /"coin":94/);
});

test("removing every coin records a removal for each and leaves the spawn alone", async () => {
  const model = new ScriptedToolModel([
    { text: "", toolCalls: [toolCall("remove_game_objects", { kind: "coin", cells: [] })], items: [] },
    { text: "All the coins are gone.", toolCalls: [], items: [] },
  ]);
  const { result } = await execute(model);

  assert.equal(result.specChange?.platformerObjectRemovals?.length, 93);
  assert.equal(storedSpec()?.platformerObjectRemovals.length, 93);
  assert.equal(
    storedSpec()?.platformerObjectRemovals.some((removal) => removal.objectId === "spawn_1"),
    false,
  );
});

test("a refused placement still returns a reply and writes nothing", async () => {
  const model = new ScriptedToolModel([
    { text: "", toolCalls: [toolCall("add_game_objects", { placements: [{ kind: "enemy", x: 0, y: 0 }] })], items: [] },
    { text: "That spot has no floor for an enemy to stand on.", toolCalls: [], items: [] },
  ]);
  const { result } = await execute(model);

  assert.equal(result.status, "replied");
  assert.equal(result.specChange, undefined);
  assert.deepEqual(storedSpec()?.platformerObjectEdits, []);
  assert.match(
    String(model.requests[1]?.toolOutputs?.[0]?.output),
    /"ok":false.*needs solid ground underneath/,
  );
});

test("Cooper cannot touch objects in a maze game", async () => {
  const model = new ScriptedToolModel([
    { text: "", toolCalls: [toolCall("add_game_objects", { placements: [{ kind: "coin", x: 0, y: 0 }] })], items: [] },
    { text: "I cannot put coins into a maze yet.", toolCalls: [], items: [] },
  ]);
  resetMemory();
  const game = await createGame("owner-a", {
    title: "Test maze",
    spec: { ...DEFAULT_GAME_DOCUMENT, previewKind: "maze" },
  });
  const result = await executeBuildMessage(
    { ownerId: "owner-a", gameId: game.id, message: "Add coins" },
    { modelClient: model, runStore: new AgentFlowRunStore({ forceMemory: true }) },
  );

  assert.equal(result.specChange, undefined);
  assert.match(
    String(model.requests[1]?.toolOutputs?.[0]?.output),
    /"ok":false.*only change a platformer this way/,
  );
});

test("a patch tool call forks the catalog into the saved game and rides back to the client", async () => {
  const model = new ScriptedToolModel([
    { text: "", toolCalls: [toolCall("patch_game_physics", jumpHeightPatch(3.5))], items: [{ type: "function_call" }] },
    { text: "Your jump is much bigger now.", toolCalls: [], items: [] },
  ]);
  const { result } = await execute(model);

  assert.equal(result.status, "replied");
  assert.equal(result.cooperMessage, "Your jump is much bigger now.");
  assert.equal(result.physicsDocument?.revision, 2);
  assert.deepEqual(result.physicsDocument?.provenance, {
    lastEditedBy: "cooper",
    lastPrompt: "Build a maze",
  });

  const stored = storedPhysics();
  assert.equal(stored?.runtime, "platformer_v1");
  if (stored?.runtime !== "platformer_v1") throw new Error("expected a platformer document");
  assert.equal(stored.verticalMovement.groundedJump.jumpHeightTiles, 3.5);
  assert.equal(CATALOG_PLATFORMER_GAME_PHYSICS.verticalMovement.groundedJump.jumpHeightTiles, 2.25625);
});

test("a tool result is echoed to the model as provider history, never as kid-visible chat", async () => {
  const model = new ScriptedToolModel([
    { text: "", toolCalls: [toolCall("read_game_physics", {}, "call-1")], items: [{ type: "function_call", call_id: "call-1" }] },
    { text: "Right now you jump about two tiles.", toolCalls: [], items: [] },
  ]);
  await execute(model);

  assert.deepEqual(model.requests[1]?.history, [{ type: "function_call", call_id: "call-1" }]);
  assert.equal(model.requests[1]?.toolOutputs?.[0]?.callId, "call-1");
  assert.match(String(model.requests[1]?.toolOutputs?.[0]?.output), /"editableFields"/);
  assert.deepEqual(
    globalThis.splatLabGamesMemory?.[0]?.spec.builderChatHistory.map((turn) => turn.message),
    ["Build a maze", "Right now you jump about two tiles."],
  );
});

test("a rejected patch still returns a reply and leaves no fork", async () => {
  const model = new ScriptedToolModel([
    { text: "", toolCalls: [toolCall("patch_game_physics", jumpHeightPatch(1))], items: [] },
    { text: "That jump would be too low to reach the platforms.", toolCalls: [], items: [] },
  ]);
  const { result } = await execute(model);

  assert.equal(result.status, "replied");
  assert.equal(result.physicsDocument, undefined);
  assert.equal(storedPhysics(), undefined);
  assert.match(
    String(model.requests[1]?.toolOutputs?.[0]?.output),
    /"ok":false.*too low to reach the platforms/,
  );
});

test("a tool the Agent node does not offer fails the run closed", async () => {
  const model = new ScriptedToolModel([
    { text: "", toolCalls: [toolCall("patch_game_map", {})], items: [] },
  ]);

  await assert.rejects(
    () => execute(model),
    (error: unknown) => error instanceof BuildExecutionError && error.code === "unexpected_tool_call",
  );
  assert.equal(globalThis.splatLabAgentFlowRunsMemory?.[0]?.status, "failed");
});

test("an Agent node that keeps calling tools stops at the bounded tool budget", async () => {
  const round = {
    text: "",
    toolCalls: [toolCall("read_game_physics", {})],
    items: [] as ModelTurnResult["items"],
  };
  const model = new ScriptedToolModel([round, round, round, round]);

  await assert.rejects(
    () => execute(model),
    (error: unknown) => error instanceof BuildExecutionError && error.code === "execution_budget",
  );
  assert.equal(model.requests.length, 4);
  assert.equal(model.scenarioCalls, 0);
});
