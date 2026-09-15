import assert from "node:assert/strict";
import test from "node:test";

import starterFlow from "../../../../game/agent-flows/build_agentflow_v1.json";

import { createInitialState } from "../../game/platformer/engine";
import { activeMapSource, activePlayerAssetId, DEFAULT_GAME_DOCUMENT, type BuilderChatTurn } from "../game-contract";
import { parseBuildTurnResult } from "../../app/build/build-setup";
import { GAME_PLAYER_CONTENT } from "../../game/game-player-content";
import { gameMazeMaps } from "../../game/game-levels";
import { resolveActivePlatformerLevel } from "../game-objects";
import { rollGameMap } from "../random-map/map-roll";
import { getAgentTool } from "./tools/registry";
import { getGame, updateGame } from "../games";
import { CATALOG_PLATFORMER_GAME_PHYSICS } from "../game-physics";
import { createGame } from "../games";
import gateFlow from "./review-gate-flow.fixture.json";

import { compileFlow, FLOW_ID } from "./contract";
import { type ModelClient, ModelOutputError, type ModelToolCall, type ModelTurnRequest, type ModelTurnResult } from "./model-client";
import { ALLOW_ALL_MODERATOR } from "./moderation";
import {
  BuildExecutionError,
  executeBuildMessage,
  modelMessagesForTextNode,
  resumeBuildTurn,
  type BuildExecutorDependencies,
} from "./executor";
import { flowHashFor, type RegisteredFlow } from "./registry";
import { AgentFlowRunStore } from "./run-store";

/**
 * The checked-in flow replies on every turn, so it can never reach Condition
 * Agent, Human Input, or Loop. These tests drive the graph the product used
 * before the review gate was removed, which is the only way those interpreter
 * paths stay covered.
 */
const compiledGate = compileFlow(gateFlow);
const GATE_FLOW: RegisteredFlow = Object.freeze({
  id: FLOW_ID,
  flow: compiledGate,
  flowHash: flowHashFor(compiledGate),
});

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

async function execute(model: ModelClient, builderChatHistory: BuilderChatTurn[] = [], flow?: RegisteredFlow) {
  resetMemory();
  const game = await createGame("owner-a", {
    title: "Test game",
    spec: { ...DEFAULT_GAME_DOCUMENT, builderChatHistory },
  });
  const store = new AgentFlowRunStore({ forceMemory: true });
  const result = await executeBuildMessage(
    { ownerId: "owner-a", gameId: game.id, message: "Build a maze" },
    { modelClient: model, moderator: ALLOW_ALL_MODERATOR, runStore: store, flow },
  );
  return { game, store, result };
}

/** Runs the review-gate graph, the only one that can pause or loop. */
async function executeGated(model: ModelClient, builderChatHistory: BuilderChatTurn[] = []) {
  return execute(model, builderChatHistory, GATE_FLOW);
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
  flow.nodes.find((node) => node.id === "agentAgentflow_0")!.data.inputs.agentEnableMemory = false;
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
      {
        modelClient: model,
        moderator: ALLOW_ALL_MODERATOR,
        runStore: new AgentFlowRunStore({ forceMemory: true }),
      },
    ),
    (error: unknown) => error instanceof BuildExecutionError && error.code === "game_not_found",
  );
  assert.equal(model.textCalls, 0);
});

test("the executor rejects an omitted moderator before starting a run", async () => {
  resetMemory();
  const game = await createGame("owner-a", {
    title: "Test game",
    spec: DEFAULT_GAME_DOCUMENT,
  });
  const model = new ScriptedModelClient("Done.", "Ready");
  const dependencies = {
    modelClient: model,
    runStore: new AgentFlowRunStore({ forceMemory: true }),
  } as unknown as BuildExecutorDependencies;

  await assert.rejects(
    () => executeBuildMessage(
      { ownerId: "owner-a", gameId: game.id, message: "Build a maze" },
      dependencies,
    ),
    (error: unknown) =>
      error instanceof BuildExecutionError && error.code === "moderation_unavailable",
  );
  assert.equal(model.textCalls, 0);
  assert.equal(globalThis.splatLabAgentFlowRunsMemory?.length, 0);
});

test("Ready completes with preserved coordinator output and one call per model node", async () => {
  const model = new ScriptedModelClient("  A scoped and verified maze handoff.  ", "Ready");
  const { game, store, result } = await executeGated(model);

  assert.deepEqual(result, {
    status: "replied",
    cooperMessage: "A scoped and verified maze handoff.",
    runId: result.runId,
    gameRevision: 3,
    physicsDocument: undefined,
    specChange: undefined,
    gameTitle: undefined,
    mapRoll: undefined,
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
  const { game, store, result } = await executeGated(model);

  assert.equal(result.status, "paused");
  // The pause carries Cooper's own question rather than a stock sentence, so
  // the kid reads what is actually being asked before choosing a button.
  assert.equal(result.cooperMessage, "Draft needs a decision.");
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

/**
 * A committed write leaves nothing to decide, but the guard sees only the
 * drafted sentence. Explaining that a value is already at its bound reads as a
 * refusal, which used to replace Cooper's reason with the stock pause prompt.
 */
test("a committed write replies without consulting the guard", async () => {
  const model = new ScriptedToolModel(
    [
      { text: "", toolCalls: [toolCall("patch_game_physics", jumpHeightPatch(3.5))], items: [{ type: "function_call" }] },
      { text: "You already run as fast as this game goes, so I made you speed up quicker.", toolCalls: [], items: [] },
    ],
    "Needs work",
  );
  const { game, store, result } = await executeGated(model);

  assert.equal(result.status, "replied");
  assert.equal(result.cooperMessage, "You already run as fast as this game goes, so I made you speed up quicker.");
  assert.equal(model.scenarioCalls, 0);
  assert.equal(await store.loadActive("owner-a", game.id), null);
});

test("a read-only turn is still graded by the guard", async () => {
  const model = new ScriptedToolModel(
    [
      { text: "", toolCalls: [toolCall("read_game_physics", {}, "call-read")], items: [{ type: "function_call", call_id: "call-read" }] },
      { text: "Which one did you want me to change?", toolCalls: [], items: [] },
    ],
    "Needs work",
  );
  const { result } = await executeGated(model);

  assert.equal(result.status, "paused");
  assert.equal(model.scenarioCalls, 1);
  assert.equal(storedPhysics(), undefined);
});

test("Reject completes a paused run from preserved output without a model call", async () => {
  const model = new ScriptedModelClient("Draft needs a decision.", "Needs work");
  const { game, store, result } = await executeGated(model);
  assert.equal(result.status, "paused");

  const resumed = await resumeBuildTurn(
    { ownerId: "owner-a", gameId: game.id, action: "reject", feedback: "Keep it as-is" },
    { modelClient: model, moderator: ALLOW_ALL_MODERATOR, runStore: store, flow: GATE_FLOW },
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
  const { game, store, result } = await executeGated(model);
  const resumed = await resumeBuildTurn(
    { ownerId: "owner-a", gameId: game.id, action: "proceed", feedback: "Add coins" },
    { modelClient: model, moderator: ALLOW_ALL_MODERATOR, runStore: store, flow: GATE_FLOW },
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
  const { game, store } = await executeGated(model);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const resumed = await resumeBuildTurn(
      { ownerId: "owner-a", gameId: game.id, action: "proceed" },
      { modelClient: model, moderator: ALLOW_ALL_MODERATOR, runStore: store, flow: GATE_FLOW },
    );
    assert.equal(resumed.status, "paused");
  }
  await assert.rejects(
    () => resumeBuildTurn(
      { ownerId: "owner-a", gameId: game.id, action: "proceed" },
      { modelClient: model, moderator: ALLOW_ALL_MODERATOR, runStore: store, flow: GATE_FLOW },
    ),
    (error: unknown) => error instanceof BuildExecutionError && error.code === "loop_exhausted",
  );
  assert.equal(model.textCalls, 4);
  assert.equal(model.scenarioCalls, 4);
  assert.equal(globalThis.splatLabAgentFlowRunsMemory?.[0]?.status, "failed");
});

test("a paused run with a stale flow hash fails before another model call", async () => {
  const model = new ScriptedModelClient("Draft", "Needs work");
  const { game, store } = await executeGated(model);
  globalThis.splatLabAgentFlowRunsMemory![0].flowHash = "stale-flow";

  await assert.rejects(
    () => resumeBuildTurn(
      { ownerId: "owner-a", gameId: game.id, action: "proceed" },
      { modelClient: model, moderator: ALLOW_ALL_MODERATOR, runStore: store, flow: GATE_FLOW },
    ),
    (error: unknown) => error instanceof BuildExecutionError && error.code === "flow_hash_mismatch",
  );
  assert.equal(model.textCalls, 1);
  assert.equal(model.scenarioCalls, 1);
  assert.equal(globalThis.splatLabAgentFlowRunsMemory?.[0]?.status, "failed");
});

test("malformed scenario fails the run without a retry", async () => {
  const model = new ScriptedModelClient("Draft", "Maybe");
  await assert.rejects(() => executeGated(model), ModelOutputError);
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
    "set_level_art",
    "read_game",
    "rename_game",
    "set_game_type",
    "set_player_appearance",
    "add_level",
    "rename_level",
    "remove_level",
    "move_level",
    "set_active_level",
    "reroll_map",
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
  assert.match(String(model.requests[1]?.toolOutputs?.[0]?.output), /"enemyLooksByWorld"/);
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

test("what a tool change puts on the wire is what the client can parse back", async () => {
  // The client parses specChange with a strict schema, so a tool leaking its
  // own report into the change fails the whole reply as malformed rather than
  // failing anywhere near the tool that caused it.
  const cases: [string, Record<string, unknown>][] = [
    ["add_game_objects", { placements: [{ kind: "coin", x: 0, y: 0 }] }],
    ["remove_game_objects", { kind: "coin", cells: [] }],
    ["set_starting_lives", { lives: 10 }],
    ["set_player_character", { character: "robot", gender: "boy" }],
    ["set_enemy_appearance", { look: "neutral_robot_01", fromLook: "", cells: [] }],
    ["set_level_art", { part: "platforms", world: "Dragon World" }],
    ["set_game_type", { gameType: "maze" }],
    ["set_player_appearance", { skinTone: "skin_02", hairColor: "hair_05" }],
    ["add_level", { world: "Ice World", name: "Frozen Lake" }],
    ["rename_level", { level: 1, name: "The Start" }],
    ["set_active_level", { level: 1 }],
  ];

  for (const [name, args] of cases) {
    resetMemory();
    const model = new ScriptedToolModel([
      { text: "", toolCalls: [toolCall(name, args)], items: [] },
      { text: "Done.", toolCalls: [], items: [] },
    ]);
    const { result } = await execute(model);

    assert.ok(result.specChange, `${name} produced no change`);
    assert.deepEqual(
      parseBuildTurnResult(
        {
          status: result.status,
          cooperMessage: result.cooperMessage,
          runId: result.runId,
          specChange: JSON.parse(JSON.stringify(result.specChange)),
        },
        String(result.gameRevision),
      )?.specChange,
      result.specChange,
      `${name} sent a change the client rejects`,
    );
  }
});

test("borrowing another world's platforms redresses the level the kid is playing", async () => {
  const model = new ScriptedToolModel([
    { text: "", toolCalls: [toolCall("read_game_objects", {}, "call-read")], items: [{ type: "function_call", call_id: "call-read" }] },
    {
      text: "",
      toolCalls: [toolCall("set_level_art", { part: "platforms", world: "Dragon World" })],
      items: [{ type: "function_call" }],
    },
    { text: "Your level has dragon platforms now.", toolCalls: [], items: [] },
  ]);
  const { result } = await execute(model);

  assert.deepEqual(result.specChange?.platformerLevelArt, [
    { mapSource: "level-1.json", slot: "platform", world: "dragons_emberkeep_01" },
  ]);

  const spec = storedSpec();
  assert.ok(spec);
  const level = resolveActivePlatformerLevel(spec);
  assert.equal(level?.map.presentation.artBorrows?.platform, "dragons_emberkeep_01");

  // The art each part wears, and who else has one, reach the model.
  const read = String(model.requests[1]?.toolOutputs?.[0]?.output);
  assert.match(read, /"part":"platforms"/);
  assert.match(read, /"canBorrowFrom":\["Green Hills","Graveyard","Space","Dragon World","Ice World"\]/);
});

test("a world without its own coins is refused by name, and told who has them", async () => {
  const model = new ScriptedToolModel([
    { text: "", toolCalls: [toolCall("set_level_art", { part: "coins", world: "Graveyard" })], items: [] },
    { text: "The graveyard has no coins of its own.", toolCalls: [], items: [] },
  ]);
  const { result } = await execute(model);

  assert.equal(result.specChange, undefined);
  assert.deepEqual(storedSpec()?.platformerLevelArt, []);
  assert.match(
    String(model.requests[1]?.toolOutputs?.[0]?.output),
    /"ok":false.*Graveyard does not have its own coins.*Space, Dragon World or Ice World/,
  );
});

test("adding enemies with another world's look dresses them as they land", async () => {
  const model = new ScriptedToolModel([
    { text: "", toolCalls: [toolCall("read_game_objects", {}, "call-read")], items: [{ type: "function_call", call_id: "call-read" }] },
    {
      text: "",
      toolCalls: [toolCall("add_game_objects", {
        placements: [{ kind: "enemy", x: 0, y: 10 }],
        look: "dragon_ghost_01",
      })],
      items: [{ type: "function_call" }],
    },
    { text: "A dragon ghost just moved in.", toolCalls: [], items: [] },
  ]);
  const { result } = await execute(model);

  assert.equal(result.specChange?.platformerObjectEdits?.length, 1);
  assert.deepEqual(result.specChange?.platformerObjectSettings, [
    {
      mapSource: "level-1.json",
      objectId: "cooper-enemy-1",
      assetId: "dragon_ghost_01",
      behavior: "patroller",
      direction: "left",
    },
  ]);

  const spec = storedSpec();
  assert.ok(spec);
  const level = resolveActivePlatformerLevel(spec);
  assert.equal(
    level?.map.objects.find((object) => object.id === "cooper-enemy-1")?.assetId,
    "dragon_ghost_01",
    "the played map, not just the reply, shows the borrowed look",
  );
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
    {
      modelClient: model,
      moderator: ALLOW_ALL_MODERATOR,
      runStore: new AgentFlowRunStore({ forceMemory: true }),
    },
  );

  assert.equal(result.specChange, undefined);
  assert.match(
    String(model.requests[1]?.toolOutputs?.[0]?.output),
    /"ok":false.*only change a platformer this way/,
  );
});

test("read_game reports the game's name and its numbered levels", async () => {
  const model = new ScriptedToolModel([
    { text: "", toolCalls: [toolCall("read_game", {}, "call-read")], items: [{ type: "function_call", call_id: "call-read" }] },
    { text: "Your game is called Test game.", toolCalls: [], items: [] },
  ]);
  await execute(model);

  const read = String(model.requests[1]?.toolOutputs?.[0]?.output);
  assert.match(read, /"name":"Test game"/);
  assert.match(read, /"levels":\[\{"number":1,.*"playing":true\}\]/);
  assert.match(read, /"worldsYouCanAdd":\["Green Hills","Graveyard","Space","Dragon World","Ice World"\]/);
});

test("read_game works on a maze game, which the level-object tools refuse", async () => {
  const model = new ScriptedToolModel([
    { text: "", toolCalls: [toolCall("read_game", {}, "call-read")], items: [{ type: "function_call", call_id: "call-read" }] },
    { text: "It is a maze called Test maze.", toolCalls: [], items: [] },
  ]);
  resetMemory();
  const game = await createGame("owner-a", {
    title: "Test maze",
    spec: { ...DEFAULT_GAME_DOCUMENT, previewKind: "maze" },
  });
  await executeBuildMessage(
    { ownerId: "owner-a", gameId: game.id, message: "What is this game?" },
    {
      modelClient: model,
      moderator: ALLOW_ALL_MODERATOR,
      runStore: new AgentFlowRunStore({ forceMemory: true }),
    },
  );

  const read = String(model.requests[1]?.toolOutputs?.[0]?.output);
  assert.match(read, /"ok":true/);
  assert.match(read, /"gameType":"maze"/);
  // Ice World has no maze map, so it must not be offered as a world to add.
  assert.doesNotMatch(read, /Ice World/);
});

test("renaming the game saves the new name and rides it back to the client", async () => {
  const model = new ScriptedToolModel([
    { text: "", toolCalls: [toolCall("rename_game", { name: "Ice World" })], items: [] },
    { text: "Your game is called Ice World now.", toolCalls: [], items: [] },
  ]);
  const { result } = await execute(model);

  assert.equal(result.gameTitle, "Ice World");
  assert.equal(globalThis.splatLabGamesMemory?.[0]?.title, "Ice World");
  // The name is stored beside the spec, so it must not leak into the change.
  assert.equal(result.specChange, undefined);
  assert.equal(
    parseBuildTurnResult(
      {
        status: result.status,
        cooperMessage: result.cooperMessage,
        runId: result.runId,
        title: result.gameTitle,
      },
      String(result.gameRevision),
    )?.title,
    "Ice World",
  );
});

test("an empty name is refused and the game keeps the one it had", async () => {
  const model = new ScriptedToolModel([
    { text: "", toolCalls: [toolCall("rename_game", { name: "   " })], items: [] },
    { text: "What would you like to call it?", toolCalls: [], items: [] },
  ]);
  const { result } = await execute(model);

  assert.equal(result.gameTitle, undefined);
  assert.equal(globalThis.splatLabGamesMemory?.[0]?.title, "Test game");
  assert.match(String(model.requests[1]?.toolOutputs?.[0]?.output), /"ok":false.*needs a name/);
});

test("the deterministic filter refuses an obfuscated bad word in a game name", async () => {
  const model = new ScriptedToolModel([
    { text: "", toolCalls: [toolCall("rename_game", { name: "f.u.c.k" })], items: [] },
    { text: "Let's choose a different name.", toolCalls: [], items: [] },
  ]);
  const { result } = await execute(model);

  assert.equal(result.gameTitle, undefined);
  assert.equal(globalThis.splatLabGamesMemory?.[0]?.title, "Test game");
  assert.match(
    String(model.requests[1]?.toolOutputs?.[0]?.output),
    /"ok":false.*cannot call the game/,
  );
});

test("adding a level puts it last, starts showing it, and keeps the old one", async () => {
  const model = new ScriptedToolModel([
    { text: "", toolCalls: [toolCall("read_game", {}, "call-read")], items: [{ type: "function_call", call_id: "call-read" }] },
    {
      text: "",
      toolCalls: [toolCall("add_level", { world: "Ice World", name: "Frozen Lake" })],
      items: [{ type: "function_call" }],
    },
    { text: "I added an icy level at the end.", toolCalls: [], items: [] },
  ]);
  const { result } = await execute(model);

  const levels = result.specChange?.platformerLevels;
  assert.equal(levels?.length, 2, "the level that was showing is kept alongside the new one");
  assert.equal(levels?.[0].templateSource, "level-1.json");
  assert.deepEqual(
    { templateSource: levels?.[1].templateSource, label: levels?.[1].label },
    { templateSource: "level-5.json", label: "Frozen Lake" },
  );
  assert.equal(storedSpec()?.platformerMapSource, levels?.[1].id);
  assert.equal(
    globalThis.splatLabGamesMemory?.[0]?.mapSource,
    levels?.[1].id,
    "the stored column follows the level being played",
  );

  const spec = storedSpec();
  assert.ok(spec);
  const level = resolveActivePlatformerLevel(spec);
  assert.ok(level, "the level Cooper added did not resolve to a playable map");
  assert.equal(level.label, "Frozen Lake");
  assert.equal(
    level.map.id,
    `ice_world_01:${levels?.[1].id}`,
    "the added level plays the checked-in Ice World map from apps/game/maps",
  );
  const started = createInitialState(level.map);
  assert.deepEqual(
    { x: started.x, y: started.y },
    { x: started.spawnX, y: started.spawnY },
    "the site player starts the level Cooper added on its spawn",
  );
});

test("the deterministic filter refuses a bad word in a model-proposed level name", async () => {
  const model = new ScriptedToolModel([
    {
      text: "",
      toolCalls: [toolCall("add_level", { world: "Ice World", name: "sh1t" })],
      items: [],
    },
    { text: "Let's choose a different level name.", toolCalls: [], items: [] },
  ]);
  const { result } = await execute(model);

  assert.equal(result.specChange, undefined);
  assert.equal(storedSpec()?.platformerLevels?.length, 0);
  assert.match(
    String(model.requests[1]?.toolOutputs?.[0]?.output),
    /"ok":false.*cannot use that level name/,
  );
});

test("switching to a maze updates the stored game type as well as the spec", async () => {
  const model = new ScriptedToolModel([
    { text: "", toolCalls: [toolCall("set_game_type", { gameType: "maze" })], items: [] },
    { text: "It is a maze now.", toolCalls: [], items: [] },
  ]);
  const { result } = await execute(model);

  assert.equal(result.specChange?.previewKind, "maze");
  assert.equal(storedSpec()?.previewKind, "maze");
  assert.equal(globalThis.splatLabGamesMemory?.[0]?.gameType, "maze");
  assert.equal(
    globalThis.splatLabGamesMemory?.[0]?.mapSource,
    "maze_green_hills_01.json",
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

test("a text-only close that still returns tool calls fails the run closed", async () => {
  const round = {
    text: "",
    toolCalls: [toolCall("read_game_physics", {})],
    items: [] as ModelTurnResult["items"],
  };
  const model = new ScriptedToolModel([
    ...Array.from({ length: 6 }, () => round),
    round,
  ]);

  await assert.rejects(
    () => execute(model),
    (error: unknown) => error instanceof BuildExecutionError && error.code === "execution_budget",
  );
  assert.equal(model.requests.length, 7);
  assert.equal(model.requests[6]?.tools, undefined);
});

test("an Agent node that keeps calling tools is closed with a text-only reply", async () => {
  const round = {
    text: "",
    toolCalls: [toolCall("read_game_physics", {})],
    items: [] as ModelTurnResult["items"],
  };
  // Must stay in lockstep with MAX_TOOL_ROUNDS in executor.ts.
  const model = new ScriptedToolModel([
    ...Array.from({ length: 6 }, () => round),
    { text: "You run a bit faster now.", toolCalls: [], items: [] },
  ]);
  const { result } = await execute(model);

  assert.equal(result.status, "replied");
  assert.equal(model.requests.length, 7);
  assert.equal(model.requests[6]?.tools, undefined);
  assert.equal(
    model.requests[6]?.messages.at(-1)?.content,
    "Reply to the kid now in two or three short sentences. You cannot use tools on this turn.",
  );
});

test("reroll_map is registered with a strict schema and compact tool output", () => {
  const tool = getAgentTool("reroll_map");
  assert.equal(tool.id, "reroll_map");
  assert.deepEqual(tool.definition.parameters.required, ["confirmDiscardEdits"]);
});

test("reroll_map mints a fresh generated map and rides back out-of-band", async () => {
  const model = new ScriptedToolModel([
    { text: "", toolCalls: [toolCall("reroll_map", { confirmDiscardEdits: false })], items: [] },
    { text: "Here is a different map.", toolCalls: [], items: [] },
  ]);
  const { result } = await execute(model);

  assert.equal(result.status, "replied");
  assert.ok(result.mapRoll);
  assert.match(result.mapRoll.change.platformerMapSource ?? "", /^custom-platformer-gen-/);
  assert.equal(storedSpec()?.mapStyle, "generated");
  assert.equal(storedSpec()?.generatedPlatformerMaps.length, 1);
  assert.doesNotMatch(String(model.requests[1]?.toolOutputs?.[0]?.output), /"layers"/);
  assert.match(String(model.requests[1]?.toolOutputs?.[0]?.output), /"ok":true/);
  assert.deepEqual(
    parseBuildTurnResult(
      {
        status: result.status,
        cooperMessage: result.cooperMessage,
        runId: result.runId,
        mapRoll: JSON.parse(JSON.stringify(result.mapRoll)),
      },
      String(result.gameRevision),
    )?.mapRoll,
    result.mapRoll,
  );
});

test("reroll_map refuses without confirmation when edits exist", async () => {
  resetMemory();
  const game = await createGame("owner-a", { title: "Test game", spec: DEFAULT_GAME_DOCUMENT });
  const rolled = await rollGameMap("owner-a", game.id, { length: "short", reason: "setup" });
  assert.equal(rolled.status, "rolled");
  if (rolled.status !== "rolled") return;
  const source = rolled.result.change.platformerMapSource!;
  const current = await getGame("owner-a", game.id);
  assert.ok(current);
  await updateGame("owner-a", game.id, {
    title: current.title,
    spec: {
      ...current.spec,
      platformerTerrainEdits: [{ mapSource: source, x: 1, y: 1, kind: "ground" }],
    },
    expectedRevision: current.revision,
  });

  const model = new ScriptedToolModel([
    { text: "", toolCalls: [toolCall("reroll_map", { confirmDiscardEdits: false })], items: [] },
    { text: "Your map edits would be lost. Is it okay to replace the map anyway?", toolCalls: [], items: [] },
  ]);
  const store = new AgentFlowRunStore({ forceMemory: true });
  const result = await executeBuildMessage(
    { ownerId: "owner-a", gameId: game.id, message: "Give me a different map" },
    { modelClient: model, moderator: ALLOW_ALL_MODERATOR, runStore: store },
  );

  assert.equal(result.mapRoll, undefined);
  assert.equal((await getGame("owner-a", game.id))?.spec.platformerTerrainEdits.length, 1);
  assert.match(
    String(model.requests[1]?.toolOutputs?.[0]?.output),
    /"needsConfirmation":true/,
  );
});

test("reroll_map writes after explicit confirmation and prunes old edits", async () => {
  resetMemory();
  const game = await createGame("owner-a", { title: "Test game", spec: DEFAULT_GAME_DOCUMENT });
  const rolled = await rollGameMap("owner-a", game.id, { length: "short", reason: "setup" });
  assert.equal(rolled.status, "rolled");
  if (rolled.status !== "rolled") return;
  const source = rolled.result.change.platformerMapSource!;
  const current = await getGame("owner-a", game.id);
  assert.ok(current);
  await updateGame("owner-a", game.id, {
    title: current.title,
    spec: {
      ...current.spec,
      platformerTerrainEdits: [{ mapSource: source, x: 1, y: 1, kind: "ground" }],
    },
    expectedRevision: current.revision,
  });

  const model = new ScriptedToolModel([
    { text: "", toolCalls: [toolCall("reroll_map", { confirmDiscardEdits: true, length: "long" })], items: [] },
    { text: "Okay, here is a longer different map.", toolCalls: [], items: [] },
  ]);
  const store = new AgentFlowRunStore({ forceMemory: true });
  const result = await executeBuildMessage(
    { ownerId: "owner-a", gameId: game.id, message: "Yes, replace it" },
    { modelClient: model, moderator: ALLOW_ALL_MODERATOR, runStore: store },
  );

  assert.ok(result.mapRoll);
  assert.notEqual(result.mapRoll.change.platformerMapSource, source);
  assert.equal(result.mapRoll.change.generatedPlatformerMaps?.[0]?.length, "long");
  const stored = await getGame("owner-a", game.id);
  assert.deepEqual(stored?.spec.platformerTerrainEdits, []);
  assert.equal(stored?.spec.generatedPlatformerMaps.some((record) => record.source === source), false);
});

test("reroll_map works for mazes and keeps generated maps playable publicly", async () => {
  resetMemory();
  const game = await createGame("owner-a", {
    title: "Maze reroll",
    spec: { ...DEFAULT_GAME_DOCUMENT, previewKind: "maze", mazeMapSource: "maze_green_hills_01.json" },
  });
  const model = new ScriptedToolModel([
    { text: "", toolCalls: [toolCall("reroll_map", { confirmDiscardEdits: false })], items: [] },
    { text: "Here is a different maze.", toolCalls: [], items: [] },
  ]);
  const store = new AgentFlowRunStore({ forceMemory: true });
  const result = await executeBuildMessage(
    { ownerId: "owner-a", gameId: game.id, message: "Give me a different maze" },
    { modelClient: model, moderator: ALLOW_ALL_MODERATOR, runStore: store },
  );

  assert.ok(result.mapRoll);
  assert.match(result.mapRoll.change.mazeMapSource ?? "", /^custom-maze-gen-/);
  const stored = await getGame("owner-a", game.id);
  assert.ok(stored);
  const maps = gameMazeMaps(stored.spec, GAME_PLAYER_CONTENT.mazes);
  assert.equal(maps.length, 1);
  assert.match(maps[0]?.source ?? "", /^custom-maze-gen-/);
});

test("a map roll and an object write in one turn keep the new source", async () => {
  resetMemory();
  const game = await createGame("owner-a", { title: "Test game", spec: DEFAULT_GAME_DOCUMENT });
  const rolled = await rollGameMap("owner-a", game.id, { length: "short", reason: "setup" });
  assert.equal(rolled.status, "rolled");
  if (rolled.status !== "rolled") return;
  const oldSource = rolled.result.change.platformerMapSource!;

  const model = new ScriptedToolModel([
    { text: "", toolCalls: [toolCall("reroll_map", { confirmDiscardEdits: false })], items: [] },
    { text: "", toolCalls: [toolCall("add_game_objects", { placements: [{ kind: "coin", x: 0, y: 0 }] })], items: [] },
    { text: "Different map, plus a coin.", toolCalls: [], items: [] },
  ]);
  const store = new AgentFlowRunStore({ forceMemory: true });
  const result = await executeBuildMessage(
    { ownerId: "owner-a", gameId: game.id, message: "Different map and add a coin" },
    { modelClient: model, moderator: ALLOW_ALL_MODERATOR, runStore: store },
  );

  assert.ok(result.mapRoll);
  const newSource = result.mapRoll.change.platformerMapSource!;
  assert.notEqual(newSource, oldSource);
  assert.equal(result.specChange?.platformerObjectEdits?.[0]?.mapSource, newSource);
  assert.equal(storedSpec()?.generatedPlatformerMaps.some((record) => record.source === oldSource), false);
  assert.equal(activeMapSource(storedSpec()!), newSource);
});
