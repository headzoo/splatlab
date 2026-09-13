import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_GAME_DOCUMENT } from "../game-contract";
import { createGame, getGame, updateGame } from "../games";
import { AgentFlowRunStore } from "./run-store";

function resetMemory() {
  globalThis.splatLabGamesMemory = [];
  globalThis.splatLabAgentFlowRunsMemory = [];
}

async function setup() {
  resetMemory();
  const game = await createGame("owner-a", { title: "Test game", spec: DEFAULT_GAME_DOCUMENT });
  const store = new AgentFlowRunStore({ forceMemory: true, leaseMs: 1_000 });
  const started = await store.startMessage({
    ownerId: "owner-a",
    gameId: game.id,
    flowId: "build_agentflow_v1",
    flowHash: "flow-hash",
    currentNodeId: "start",
    question: "Build a maze",
    userMessage: "Build a maze",
    flowState: { phase: "start" },
    flowOutput: "",
    loopCounts: {},
  });
  assert.equal(started.status, "started");
  if (started.status !== "started") throw new Error("Expected run to start");
  return { game, store, started };
}

test("memory run store enforces ownership, active runs, and revision claims", async () => {
  const { game, store, started } = await setup();

  const duplicate = await store.startMessage({
    ownerId: "owner-a", gameId: game.id, flowId: "build_agentflow_v1", flowHash: "new-hash",
    currentNodeId: "start", question: "Again", userMessage: "Again", flowState: {}, flowOutput: "", loopCounts: {},
  });
  assert.equal(duplicate.status, "active_conflict");

  const foreign = await store.checkpointHumanInput({
    ownerId: "owner-b", gameId: game.id, runId: started.run.id, expectedRevision: started.run.revision,
    currentNodeId: "human", flowState: {}, flowOutput: "", loopCounts: {}, cooperPrompt: "Tell me more", pendingHumanInput: { branch: "proceed" },
  });
  assert.equal(foreign.status, "not_found");

  const paused = await store.checkpointHumanInput({
    ownerId: "owner-a", gameId: game.id, runId: started.run.id, expectedRevision: started.run.revision,
    currentNodeId: "human", flowState: { phase: "review" }, flowOutput: "Draft", loopCounts: {}, cooperPrompt: "Tell me more", pendingHumanInput: { branch: "proceed" },
  });
  assert.equal(paused.status, "updated");
  if (paused.status !== "updated") throw new Error("Expected checkpoint");

  const stale = await store.claimPausedAction({
    ownerId: "owner-a", gameId: game.id, runId: started.run.id, expectedRevision: started.run.revision,
  });
  assert.equal(stale.status, "conflict");
});

test("memory run store preserves pause state, releases terminal runs, and increments chat revisions", async () => {
  const { game, store, started } = await setup();
  assert.equal(started.run.flowHash, "flow-hash");
  assert.equal(started.gameRevision, 2);

  const paused = await store.checkpointHumanInput({
    ownerId: "owner-a", gameId: game.id, runId: started.run.id, expectedRevision: started.run.revision,
    currentNodeId: "human", flowState: { phase: "review" }, flowOutput: "Draft", loopCounts: { review: 1 },
    cooperPrompt: "What should I change?", pendingHumanInput: { proceedNodeId: "reply" },
  });
  assert.equal(paused.status, "updated");
  if (paused.status !== "updated") throw new Error("Expected checkpoint");
  assert.equal(paused.gameRevision, 3);
  assert.equal(paused.run.status, "paused");
  assert.deepEqual(paused.run.pendingHumanInput, { proceedNodeId: "reply" });

  const loaded = await store.loadActive("owner-a", game.id);
  assert.equal(loaded?.status, "paused");
  assert.equal(loaded?.flowOutput, "Draft");

  const claimed = await store.claimPausedAction({
    ownerId: "owner-a", gameId: game.id, runId: paused.run.id, expectedRevision: paused.run.revision, feedback: "Add coins",
  });
  assert.equal(claimed.status, "updated");
  if (claimed.status !== "updated") throw new Error("Expected claim");
  assert.equal(claimed.gameRevision, 4);
  assert.equal(claimed.run.flowState.phase, "review");
  assert.equal(claimed.run.flowState.humanFeedback, "Add coins");

  const completed = await store.completeDirectReply({
    ownerId: "owner-a", gameId: game.id, runId: claimed.run.id, expectedRevision: claimed.run.revision,
    currentNodeId: "reply", flowState: claimed.run.flowState, flowOutput: "Done!", loopCounts: { review: 1 }, cooperMessage: "Done!",
  });
  assert.equal(completed.status, "updated");
  if (completed.status !== "updated") throw new Error("Expected completion");
  assert.equal(completed.gameRevision, 5);
  assert.equal(completed.run.status, "done");
  assert.equal(await store.loadActive("owner-a", game.id), null);

  const restarted = await store.startMessage({
    ownerId: "owner-a", gameId: game.id, flowId: "build_agentflow_v1", flowHash: "flow-hash-2",
    currentNodeId: "start", question: "New turn", userMessage: "New turn", flowState: {}, flowOutput: "", loopCounts: {},
  });
  assert.equal(restarted.status, "started");
});

test("memory run store returns prior owner history before appending the current message", async () => {
  resetMemory();
  const game = await createGame("owner-a", {
    title: "History game",
    spec: {
      ...DEFAULT_GAME_DOCUMENT,
      builderChatHistory: [
        { role: "user", message: "Earlier request" },
        { role: "cooper", message: "Earlier reply" },
      ],
    },
  });
  const store = new AgentFlowRunStore({ forceMemory: true });
  const started = await store.startMessage({
    ownerId: "owner-a", gameId: game.id, flowId: "build_agentflow_v1", flowHash: "flow-hash",
    currentNodeId: "start", question: "Current request", userMessage: "Current request", flowState: {}, flowOutput: "", loopCounts: {},
  });
  assert.equal(started.status, "started");
  if (started.status !== "started") throw new Error("Expected run to start");
  assert.deepEqual(started.builderChatHistory, [
    { role: "user", message: "Earlier request" },
    { role: "cooper", message: "Earlier reply" },
  ]);
  assert.deepEqual(globalThis.splatLabGamesMemory?.[0]?.spec.builderChatHistory.map((turn) => turn.message), [
    "Earlier request",
    "Earlier reply",
    "Current request",
  ]);
});

test("memory run store trims visible transcript to fifty turns", async () => {
  resetMemory();
  const history = Array.from({ length: 49 }, (_, index) => ({ role: "user" as const, message: `old ${index}` }));
  const game = await createGame("owner-a", {
    title: "History game",
    spec: { ...DEFAULT_GAME_DOCUMENT, builderChatHistory: history },
  });
  const store = new AgentFlowRunStore({ forceMemory: true });
  const started = await store.startMessage({
    ownerId: "owner-a", gameId: game.id, flowId: "build_agentflow_v1", flowHash: "flow-hash",
    currentNodeId: "start", question: "Newest", userMessage: "Newest", flowState: {}, flowOutput: "", loopCounts: {},
  });
  assert.equal(started.status, "started");
  if (started.status !== "started") throw new Error("Expected run to start");
  const paused = await store.checkpointHumanInput({
    ownerId: "owner-a", gameId: game.id, runId: started.run.id, expectedRevision: started.run.revision,
    currentNodeId: "human", flowState: {}, flowOutput: "", loopCounts: {}, cooperPrompt: "Prompt", pendingHumanInput: {},
  });
  assert.equal(paused.status, "updated");
  const stored = globalThis.splatLabGamesMemory?.[0];
  assert.equal(stored?.spec.builderChatHistory.length, 50);
  assert.equal(stored?.spec.builderChatHistory[0]?.message, "old 1");
  assert.equal(stored?.spec.builderChatHistory.at(-1)?.message, "Prompt");
});

test("memory transcript appends preserve concurrent ordinary game edits", async () => {
  const { game, store, started } = await setup();
  const beforeEdit = await getGame("owner-a", game.id);
  if (!beforeEdit) throw new Error("Expected game");
  const edited = await updateGame("owner-a", game.id, {
    title: "Edited while Cooper works",
    spec: {
      ...beforeEdit.spec,
      platformerTerrainEdits: [{ mapSource: "level-1.json", x: 3, y: 4, kind: "ground" }],
    },
    expectedRevision: started.gameRevision!,
  });
  assert.equal(edited.status, "updated");

  const paused = await store.checkpointHumanInput({
    ownerId: "owner-a", gameId: game.id, runId: started.run.id, expectedRevision: started.run.revision,
    currentNodeId: "human", flowState: {}, flowOutput: "", loopCounts: {},
    cooperPrompt: "Which obstacle?", pendingHumanInput: {},
  });
  assert.equal(paused.status, "updated");
  const persisted = await getGame("owner-a", game.id);
  assert.deepEqual(persisted?.spec.platformerTerrainEdits, [
    { mapSource: "level-1.json", x: 3, y: 4, kind: "ground" },
  ]);
  assert.deepEqual(persisted?.spec.builderChatHistory.map((turn) => turn.message), [
    "Build a maze",
    "Which obstacle?",
  ]);
});

test("memory run store fails an expired running lease distinctly", async () => {
  const { game, store, started } = await setup();
  const original = globalThis.splatLabAgentFlowRunsMemory?.[0];
  if (!original) throw new Error("Expected stored run");
  original.leaseExpiresAt = new Date(Date.now() - 1);

  const replacement = await store.startMessage({
    ownerId: "owner-a", gameId: game.id, flowId: "build_agentflow_v1", flowHash: "flow-hash-2",
    currentNodeId: "start", question: "Replacement", userMessage: "Replacement", flowState: {}, flowOutput: "", loopCounts: {},
  });
  assert.equal(replacement.status, "stale_running");
  assert.equal(replacement.status === "stale_running" && replacement.run.id, started.run.id);
  assert.equal(replacement.status === "stale_running" && replacement.run.status, "failed");
  assert.equal(replacement.status === "stale_running" && replacement.run.failureCode, "stale_running");
});
