import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_GAME_DOCUMENT } from "./game-contract";
import { createGameHistory, gameHistoryReducer } from "./game-history";

test("game history supports edit, undo, and redo", () => {
  const initial = createGameHistory(DEFAULT_GAME_DOCUMENT);
  const maze = { ...DEFAULT_GAME_DOCUMENT, previewKind: "maze" as const };
  const edited = gameHistoryReducer(initial, { type: "edit", spec: maze });

  assert.equal(edited.present.previewKind, "maze");
  assert.equal(edited.past.length, 1);

  const undone = gameHistoryReducer(edited, { type: "undo" });
  assert.deepEqual(undone.present, DEFAULT_GAME_DOCUMENT);
  assert.deepEqual(undone.future, [maze]);

  const redone = gameHistoryReducer(undone, { type: "redo" });
  assert.deepEqual(redone.present, maze);
  assert.equal(redone.future.length, 0);
});

test("a new edit clears redo history and duplicate edits are ignored", () => {
  const initial = createGameHistory(DEFAULT_GAME_DOCUMENT);
  const maze = { ...DEFAULT_GAME_DOCUMENT, previewKind: "maze" as const };
  const edited = gameHistoryReducer(initial, { type: "edit", spec: maze });
  const undone = gameHistoryReducer(edited, { type: "undo" });
  const changedMap = {
    ...DEFAULT_GAME_DOCUMENT,
    platformerMapSource: "level-2.json" as const,
  };
  const changed = gameHistoryReducer(undone, {
    type: "edit",
    spec: changedMap,
  });

  assert.equal(changed.future.length, 0);
  assert.equal(changed.present.platformerMapSource, "level-2.json");
  assert.equal(
    gameHistoryReducer(changed, { type: "edit", spec: changedMap }),
    changed,
  );
});

test("maze level changes participate in undo and redo", () => {
  const initial = createGameHistory({
    ...DEFAULT_GAME_DOCUMENT,
    previewKind: "maze",
  });
  const changed = gameHistoryReducer(initial, {
    type: "edit",
    spec: {
      ...initial.present,
      mazeMapSource: "maze_space_01.json",
    },
  });
  const undone = gameHistoryReducer(changed, { type: "undo" });
  const redone = gameHistoryReducer(undone, { type: "redo" });

  assert.equal(changed.present.mazeMapSource, "maze_space_01.json");
  assert.equal(undone.present.mazeMapSource, "maze_green_hills_01.json");
  assert.equal(redone.present.mazeMapSource, "maze_space_01.json");
});

test("hero appearance changes participate in history", () => {
  const initial = createGameHistory(DEFAULT_GAME_DOCUMENT);
  const changed = gameHistoryReducer(initial, {
    type: "edit",
    spec: {
      ...DEFAULT_GAME_DOCUMENT,
      playerCharacter: "human",
      humanGender: "girl",
      skinTone: "skin_01",
      hairColor: "hair_06",
      setupStep: "complete",
    },
  });

  assert.equal(changed.present.playerCharacter, "human");
  assert.equal(changed.present.humanGender, "girl");
  assert.equal(changed.present.skinTone, "skin_01");
  assert.equal(changed.present.hairColor, "hair_06");
  assert.equal(changed.present.setupStep, "complete");
  assert.deepEqual(gameHistoryReducer(changed, { type: "undo" }).present, DEFAULT_GAME_DOCUMENT);
});

test("terrain paint strokes participate in history as one edit", () => {
  const initial = createGameHistory(DEFAULT_GAME_DOCUMENT);
  const painted = {
    ...DEFAULT_GAME_DOCUMENT,
    platformerTerrainEdits: [
      { mapSource: "level-1.json" as const, x: 2, y: 9, kind: "ground" as const },
      { mapSource: "level-1.json" as const, x: 3, y: 9, kind: "ground" as const },
    ],
  };
  const changed = gameHistoryReducer(initial, { type: "edit", spec: painted });

  assert.equal(changed.past.length, 1);
  assert.deepEqual(changed.present.platformerTerrainEdits, painted.platformerTerrainEdits);
  assert.deepEqual(
    gameHistoryReducer(changed, { type: "undo" }).present.platformerTerrainEdits,
    [],
  );
});

test("object placements participate in undo history", () => {
  const initial = createGameHistory(DEFAULT_GAME_DOCUMENT);
  const placed = {
    ...DEFAULT_GAME_DOCUMENT,
    platformerObjectEdits: [
      { id: "build-coin-1", mapSource: "level-1.json" as const, x: 2, y: 8, kind: "coin" as const },
    ],
    platformerObjectRemovals: [
      { mapSource: "level-1.json" as const, objectId: "coin_1" },
    ],
    platformerObjectSettings: [
      {
        mapSource: "level-1.json" as const,
        objectId: "build-coin-1",
        assetId: "neutral_ghost_01",
        behavior: "chaser" as const,
        direction: "right" as const,
      },
    ],
  };
  const changed = gameHistoryReducer(initial, { type: "edit", spec: placed });

  assert.equal(changed.past.length, 1);
  assert.deepEqual(changed.present.platformerObjectEdits, placed.platformerObjectEdits);
  assert.deepEqual(changed.present.platformerObjectRemovals, placed.platformerObjectRemovals);
  assert.deepEqual(changed.present.platformerObjectSettings, placed.platformerObjectSettings);
  assert.deepEqual(gameHistoryReducer(changed, { type: "undo" }).present.platformerObjectEdits, []);
  assert.deepEqual(gameHistoryReducer(changed, { type: "undo" }).present.platformerObjectRemovals, []);
  assert.deepEqual(gameHistoryReducer(changed, { type: "undo" }).present.platformerObjectSettings, []);
});

test("chat turns save without becoming game undo entries", () => {
  const initial = createGameHistory(DEFAULT_GAME_DOCUMENT);
  const edited = gameHistoryReducer(initial, {
    type: "edit",
    spec: { ...DEFAULT_GAME_DOCUMENT, previewKind: "maze" },
  });
  const turns = [
    { role: "user" as const, message: "Add a moon door" },
    { role: "cooper" as const, message: "Add a moon door" },
  ];
  const chatted = gameHistoryReducer(edited, { type: "chat", turns });

  assert.equal(chatted.past.length, 1);
  assert.deepEqual(chatted.present.builderChatHistory, turns);

  const undone = gameHistoryReducer(chatted, { type: "undo" });
  assert.equal(undone.present.previewKind, "platformer");
  assert.deepEqual(undone.present.builderChatHistory, turns);

  const redone = gameHistoryReducer(undone, { type: "redo" });
  assert.equal(redone.present.previewKind, "maze");
  assert.deepEqual(redone.present.builderChatHistory, turns);
});
