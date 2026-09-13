import assert from "node:assert/strict";
import test from "node:test";

import { GAME_PLAYER_CONTENT } from "@/game/game-player-content";
import { applyPlatformerObjectEdits } from "@/game/platformer/map-editing";
import { DEFAULT_GAME_DOCUMENT } from "@/lib/game-contract";
import { COOPER_OBJECT_KINDS } from "@/lib/game-objects";
import { PLATFORMER_EDITABLE_PATHS } from "@/lib/game-physics";

import {
  buildGameNameOptions,
  parseBuildTurnResult,
  persistedBuildTurn,
  reconcilePersistedGame,
  isSetupHistoryLocked,
  setupQuestionHistoryFromSpec,
  setupSelectionsFromSpec,
} from "./build-setup";
import { buildPromptSuggestions } from "./build-prompt-suggestions";
import {
  cooperSetupChoiceReplies,
  setupChoiceReplyFor,
} from "./build-setup-replies";

test("post-setup prompt suggestions only ask for things Cooper's tools can do", () => {
  assert.deepEqual(buildPromptSuggestions("platformer"), [
    "Add another level",
    "Add more coins",
    "Add more enemies",
    "Give me 10 lives",
    "Make me jump higher",
    "Make me run faster",
  ]);
});

test("every object suggestion names a kind Cooper is allowed to add", () => {
  const addable = new Set<string>(COOPER_OBJECT_KINDS);

  assert.equal(addable.has("coin"), true);
  assert.equal(addable.has("enemy"), true);
  assert.equal(addable.has("spawn"), false, "the player start is never addable");
  assert.equal(addable.has("goal"), false, "the goal is never addable");
});

test("every platformer suggestion has an editable physics path behind it", () => {
  const editable = new Set(PLATFORMER_EDITABLE_PATHS);

  for (const path of [
    "/verticalMovement/groundedJump/jumpHeightTiles",
    "/movement/maximumRunSpeedTilesPerSecond",
    "/verticalMovement/groundedJump/maximumFallSpeedTilesPerSecond",
    "/verticalMovement/mode",
  ]) {
    assert.equal(editable.has(path), true, `${path} is no longer editable`);
  }
});

test("a maze is only offered the level picker, since it ignores the physics document", () => {
  assert.deepEqual(buildPromptSuggestions("maze"), ["Add another level"]);
});

test("a new unsaved game has no locked setup answers", () => {
  assert.deepEqual(setupSelectionsFromSpec(null), {
    gameType: null,
    theme: null,
    character: null,
    humanGender: null,
    skinTone: null,
    hairColor: null,
    gameName: null,
  });
});

test("setup choices lock only after game creation is complete", () => {
  assert.equal(isSetupHistoryLocked("gameType"), false);
  assert.equal(isSetupHistoryLocked("theme"), false);
  assert.equal(isSetupHistoryLocked("character"), false);
  assert.equal(isSetupHistoryLocked("complete"), true);
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
      gameName: null,
    },
  );
});

test("a completed human setup restores gender and appearance answers", () => {
  assert.deepEqual(
    setupSelectionsFromSpec(
      {
        ...DEFAULT_GAME_DOCUMENT,
        platformerMapSource: "level-3.json",
        playerCharacter: "human",
        humanGender: "girl",
        skinTone: "skin_01",
        hairColor: "hair_06",
        setupStep: "complete",
      },
      "Crypt Dash",
    ),
    {
      gameType: "platformer",
      theme: "graveyard",
      character: "human",
      humanGender: "girl",
      skinTone: "skin_01",
      hairColor: "hair_06",
      gameName: "Crypt Dash",
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
      gameName: "Green Hills Platformer",
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

test("a completed legacy setup transcript includes the name question", () => {
  assert.deepEqual(
    setupQuestionHistoryFromSpec({
      ...DEFAULT_GAME_DOCUMENT,
      builderSetupHistory: [],
      setupStep: "complete",
    }),
    ["gameType", "theme", "character", "gameName"],
  );
});

test("game name choices are generated from the setup selections", () => {
  assert.deepEqual(
    buildGameNameOptions({
      gameType: "maze",
      theme: "space",
      character: "robot",
      humanGender: null,
    }),
    [
      "Robot's Star Mission",
      "Space Maze",
      "Rocket Robot Escape",
      "Moon Key Quest",
    ],
  );
});

test("setup choice replies are mapped for game type and theme choices only", () => {
  assert.deepEqual(Object.keys(cooperSetupChoiceReplies).sort(), [
    "gameType",
    "theme",
  ]);
  assert.deepEqual(Object.keys(cooperSetupChoiceReplies.gameType).sort(), [
    "maze",
    "platformer",
  ]);
  assert.deepEqual(Object.keys(cooperSetupChoiceReplies.theme).sort(), [
    "dragon_world",
    "graveyard",
    "green_hills",
    "space",
  ]);
  assert.equal(
    setupChoiceReplyFor("theme", "space"),
    "Be careful, there's less gravity in space.",
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

test("Cooper's objects and the kid's unsaved objects both survive reconciliation", () => {
  const cooperCoin = {
    id: "cooper-coin-1",
    mapSource: "level-1.json" as const,
    x: 0,
    y: 0,
    kind: "coin" as const,
  };
  const kidSpring = {
    id: "build-platform_spring-abc",
    mapSource: "level-1.json" as const,
    x: 2,
    y: 10,
    kind: "platform_spring" as const,
  };

  const saved = DEFAULT_GAME_DOCUMENT;
  const server = { ...DEFAULT_GAME_DOCUMENT, platformerObjectEdits: [cooperCoin] };
  const local = { ...DEFAULT_GAME_DOCUMENT, platformerObjectEdits: [kidSpring] };

  assert.deepEqual(
    reconcilePersistedGame(server, saved, local).platformerObjectEdits,
    [cooperCoin, kidSpring],
  );
});

test("an object the kid erased is not resurrected by the server's copy", () => {
  const cooperCoin = {
    id: "cooper-coin-1",
    mapSource: "level-1.json" as const,
    x: 0,
    y: 0,
    kind: "coin" as const,
  };
  const erased = { mapSource: "level-1.json" as const, objectId: "cooper-coin-1" };

  const saved = { ...DEFAULT_GAME_DOCUMENT, platformerObjectEdits: [cooperCoin] };
  const server = saved;
  // Erasing drops the edit and records a removal, which suppresses the union.
  const local = {
    ...DEFAULT_GAME_DOCUMENT,
    platformerObjectEdits: [],
    platformerObjectRemovals: [erased],
  };

  const reconciled = reconcilePersistedGame(server, saved, local);
  assert.deepEqual(reconciled.platformerObjectEdits, [cooperCoin]);
  assert.deepEqual(reconciled.platformerObjectRemovals, [erased]);
  assert.deepEqual(
    applyPlatformerObjectEdits(
      GAME_PLAYER_CONTENT.maps[0].map,
      "level-1.json",
      reconciled.platformerObjectEdits,
      reconciled.platformerObjectRemovals,
    ).objects.filter((object) => object.id === "cooper-coin-1"),
    [],
  );
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
