import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_GAME_DOCUMENT } from "@/lib/game-contract";

import {
  parseBuildTurnResult,
  persistedBuildTurn,
  reconcilePersistedGame,
  setupQuestionHistoryFromSpec,
  setupSelectionsFromSpec,
} from "./build-setup";

test("a new unsaved game has no locked setup answers", () => {
  assert.deepEqual(setupSelectionsFromSpec(null), {
    gameType: null,
    theme: null,
    character: null,
    humanGender: null,
    skinTone: null,
    hairColor: null,
  });
});

test("a partially completed game restores only its locked answers", () => {
  assert.deepEqual(
    setupSelectionsFromSpec({
      ...DEFAULT_GAME_DOCUMENT,
      previewKind: "maze",
      platformerMapSource: "level-2.json",
      mazeMapSource: "maze_space_01.json",
      setupStep: "character",
    }),
    {
      gameType: "maze",
      theme: "space",
      character: null,
      humanGender: null,
      skinTone: null,
      hairColor: null,
    },
  );
});

test("a completed human setup restores gender and appearance answers", () => {
  assert.deepEqual(
    setupSelectionsFromSpec({
      ...DEFAULT_GAME_DOCUMENT,
      platformerMapSource: "level-3.json",
      playerCharacter: "human",
      humanGender: "girl",
      skinTone: "skin_01",
      hairColor: "hair_06",
      setupStep: "complete",
    }),
    {
      gameType: "platformer",
      theme: "graveyard",
      character: "human",
      humanGender: "girl",
      skinTone: "skin_01",
      hairColor: "hair_06",
    },
  );
});

test("a completed nonhuman setup does not expose unused human answers", () => {
  assert.deepEqual(
    setupSelectionsFromSpec({
      ...DEFAULT_GAME_DOCUMENT,
      playerCharacter: "robot",
      setupStep: "complete",
    }),
    {
      gameType: "platformer",
      theme: "green_hills",
      character: "robot",
      humanGender: null,
      skinTone: null,
      hairColor: null,
    },
  );
});

test("legacy games reconstruct their setup transcript from the saved step", () => {
  assert.deepEqual(
    setupQuestionHistoryFromSpec({
      ...DEFAULT_GAME_DOCUMENT,
      builderSetupHistory: [],
      playerCharacter: "human",
      setupStep: "hairColor",
    }),
    ["gameType", "theme", "character", "humanGender", "skinTone", "hairColor"],
  );
});

test("a build-turn result appends the server-persisted exchange and trims history", () => {
  const history = Array.from({ length: 49 }, (_, index) => ({
    role: "user" as const,
    message: `Earlier message ${index}`,
  }));
  const turn = persistedBuildTurn(history, "Add a moon", {
    status: "paused",
    cooperMessage: "Should I add craters too?",
    runId: "run-1",
    revision: 12,
  });

  assert.equal(turn.chatHistory.length, 50);
  assert.deepEqual(turn.chatHistory.slice(-2), [
    { role: "user", message: "Add a moon" },
    { role: "cooper", message: "Should I add craters too?" },
  ]);
});

test("a resume without feedback only adds Cooper's persisted reply", () => {
  const turn = persistedBuildTurn(
    [{ role: "cooper", message: "Continue?" }],
    "",
    {
      status: "replied",
      cooperMessage: "Great, I continued.",
      runId: "run-1",
      revision: 13,
    },
  );

  assert.deepEqual(turn.chatHistory, [
    { role: "cooper", message: "Continue?" },
    { role: "cooper", message: "Great, I continued." },
  ]);
});

test("server transcript reconciliation retains unsaved map and setup edits", () => {
  const saved = DEFAULT_GAME_DOCUMENT;
  const server = {
    ...DEFAULT_GAME_DOCUMENT,
    builderChatHistory: [{ role: "user" as const, message: "Server message" }],
  };
  const local = {
    ...DEFAULT_GAME_DOCUMENT,
    playerCharacter: "robot" as const,
    platformerTerrainEdits: [{ mapSource: "level-1.json" as const, x: 3, y: 4, kind: "ground" as const }],
  };

  assert.deepEqual(reconcilePersistedGame(server, saved, local), {
    ...server,
    playerCharacter: "robot",
    platformerTerrainEdits: [{ mapSource: "level-1.json", x: 3, y: 4, kind: "ground" }],
  });
});

test("build-turn response requires the declared response and revision header", () => {
  assert.deepEqual(
    parseBuildTurnResult(
      { status: "replied", cooperMessage: "Done!", runId: "run-1" },
      "14",
    ),
    { status: "replied", cooperMessage: "Done!", runId: "run-1", revision: 14 },
  );
  assert.equal(
    parseBuildTurnResult({ status: "nope", cooperMessage: "Done!", runId: "run-1" }, "14"),
    null,
  );
  assert.equal(
    parseBuildTurnResult(
      { status: "replied", cooperMessage: "Done!", runId: "run-1" },
      null,
    ),
    null,
  );
});
