import assert from "node:assert/strict";
import test from "node:test";

import {
  activeGameTheme,
  activeMapSource,
  activePlayerAssetId,
  DEFAULT_GAME_DOCUMENT,
  gameDocumentSchema,
  playerAssetIdFor,
  PLATFORMER_MAP_SOURCES,
  THEME_MAP_SOURCES,
} from "./game-contract";

test("platformer maps use the campaign order", () => {
  assert.deepEqual(PLATFORMER_MAP_SOURCES, [
    "level-1.json",
    "level-3.json",
    "level-2.json",
    "level-4.json",
  ]);
});

test("game documents accept the checked-in player state", () => {
  assert.deepEqual(gameDocumentSchema.parse(DEFAULT_GAME_DOCUMENT), DEFAULT_GAME_DOCUMENT);
  assert.equal(activeMapSource(DEFAULT_GAME_DOCUMENT), "level-1.json");
  assert.equal(
    activeMapSource({ ...DEFAULT_GAME_DOCUMENT, previewKind: "maze" }),
    "maze_green_hills_01.json",
  );
  assert.equal(
    activeMapSource({
      ...DEFAULT_GAME_DOCUMENT,
      previewKind: "maze",
      mazeMapSource: "maze_space_01.json",
    }),
    "maze_space_01.json",
  );
});

test("older saved game documents default new setup fields safely", () => {
  const parsed = gameDocumentSchema.parse({
    schemaVersion: 1,
    previewKind: "platformer",
    platformerMapSource: "level-1.json",
  });

  assert.equal(parsed.mazeMapSource, "maze_green_hills_01.json");
  assert.equal(parsed.playerCharacter, "cooper");
  assert.equal(parsed.humanGender, "boy");
  assert.equal(parsed.skinTone, "skin_04");
  assert.equal(parsed.hairColor, "hair_03");
  assert.equal(parsed.setupStep, "complete");
  assert.deepEqual(parsed.builderSetupHistory, []);
  assert.deepEqual(parsed.builderChatHistory, []);
});

test("themes resolve to real maps and theme-specific player sprites", () => {
  assert.deepEqual(THEME_MAP_SOURCES.graveyard, {
    platformerMapSource: "level-3.json",
    mazeMapSource: "maze_graveyard_01.json",
  });
  assert.equal(
    activeGameTheme({
      ...DEFAULT_GAME_DOCUMENT,
      previewKind: "maze",
      mazeMapSource: "maze_space_01.json",
    }),
    "space",
  );
  assert.equal(playerAssetIdFor("graveyard", "human"), "haunted_human_01");
  assert.equal(
    playerAssetIdFor("graveyard", "human", "girl"),
    "haunted_girl_01",
  );
  assert.equal(
    activePlayerAssetId({
      ...DEFAULT_GAME_DOCUMENT,
      platformerMapSource: "level-4.json",
      playerCharacter: "ghost",
    }),
    "dragon_ghost_01",
  );
});

test("game documents reject unknown maps and extra executable-looking data", () => {
  assert.equal(
    gameDocumentSchema.safeParse({
      ...DEFAULT_GAME_DOCUMENT,
      platformerMapSource: "../../secret.json",
    }).success,
    false,
  );
  assert.equal(
    gameDocumentSchema.safeParse({
      ...DEFAULT_GAME_DOCUMENT,
      mazeMapSource: "../../secret.json",
    }).success,
    false,
  );
  assert.equal(
    gameDocumentSchema.safeParse({
      ...DEFAULT_GAME_DOCUMENT,
      script: "alert(1)",
    }).success,
    false,
  );
  assert.equal(
    gameDocumentSchema.safeParse({
      ...DEFAULT_GAME_DOCUMENT,
      playerCharacter: "ninja",
    }).success,
    false,
  );
  assert.equal(
    gameDocumentSchema.safeParse({
      ...DEFAULT_GAME_DOCUMENT,
      humanGender: "unknown",
    }).success,
    false,
  );
  assert.equal(
    gameDocumentSchema.safeParse({
      ...DEFAULT_GAME_DOCUMENT,
      setupStep: "unknown",
    }).success,
    false,
  );
  assert.equal(
    gameDocumentSchema.safeParse({
      ...DEFAULT_GAME_DOCUMENT,
      builderChatHistory: Array.from({ length: 51 }, () => ({
        role: "user",
        message: "Too many turns",
      })),
    }).success,
    false,
  );
});
