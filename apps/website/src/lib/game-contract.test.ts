import assert from "node:assert/strict";
import test from "node:test";

import {
  activeGameTheme,
  activeMapSource,
  activePlayerAssetId,
  DEFAULT_GAME_DOCUMENT,
  defaultGameTitle,
  gameDocumentSchema,
  gameThumbnailInputSchema,
  playerAssetIdFor,
  PLATFORMER_MAP_SOURCES,
  THEME_MAP_SOURCES,
} from "./game-contract";

const TEST_THUMBNAIL = "data:image/webp;base64,UklGRg==";

test("platformer maps use the campaign order", () => {
  assert.deepEqual(PLATFORMER_MAP_SOURCES, [
    "level-1.json",
    "level-3.json",
    "level-2.json",
    "level-4.json",
    "level-5.json",
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
  assert.deepEqual(parsed.platformerTerrainEdits, []);
  assert.deepEqual(parsed.platformerObjectEdits, []);
  assert.deepEqual(parsed.platformerObjectRemovals, []);
  assert.deepEqual(parsed.platformerObjectSettings, []);
  assert.deepEqual(parsed.platformerLevels, []);
  assert.deepEqual(parsed.mazeLevels, []);
});

test("game documents persist independent levels created from approved templates", () => {
  const levelId = "custom-platformer-123e4567-e89b-12d3-a456-426614174000";
  const parsed = gameDocumentSchema.parse({
    ...DEFAULT_GAME_DOCUMENT,
    platformerMapSource: levelId,
    platformerLevels: [{
      id: levelId,
      templateSource: "level-2.json",
      label: "Space 2",
    }],
    platformerTerrainEdits: [{
      mapSource: levelId,
      x: 3,
      y: 4,
      kind: "platform",
    }],
  });

  assert.equal(activeGameTheme(parsed), "space");
  assert.equal(defaultGameTitle(parsed), "Space Platformer");
  assert.equal(parsed.platformerTerrainEdits[0]?.mapSource, levelId);
  assert.equal(gameDocumentSchema.safeParse({
    ...DEFAULT_GAME_DOCUMENT,
    platformerMapSource: levelId,
  }).success, false);
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
  assert.equal(
    activePlayerAssetId({
      ...DEFAULT_GAME_DOCUMENT,
      platformerMapSource: "level-5.json",
      playerCharacter: "cooper",
    }),
    "ice_world_cooper_01",
  );
  assert.equal(
    activePlayerAssetId({
      ...DEFAULT_GAME_DOCUMENT,
      platformerMapSource: "level-5.json",
      playerCharacter: "human",
      humanGender: "girl",
    }),
    "ice_world_girl_01",
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
  assert.equal(
    gameDocumentSchema.safeParse({
      ...DEFAULT_GAME_DOCUMENT,
      platformerTerrainEdits: [
        { mapSource: "../../secret.json", x: 1, y: 1, kind: "ground" },
      ],
    }).success,
    false,
  );
  assert.equal(
    gameDocumentSchema.safeParse({
      ...DEFAULT_GAME_DOCUMENT,
      platformerTerrainEdits: [
        { mapSource: "level-1.json", x: -1, y: 1, kind: "lava_script" },
      ],
    }).success,
    false,
  );
  assert.equal(
    gameDocumentSchema.safeParse({
      ...DEFAULT_GAME_DOCUMENT,
      platformerObjectEdits: [
        { id: "bad", mapSource: "level-1.json", x: 1, y: 1, kind: "script" },
      ],
    }).success,
    false,
  );
});

test("game thumbnails only accept bounded PNG or WebP data URLs", () => {
  assert.equal(
    gameThumbnailInputSchema.safeParse({ thumbnailDataUrl: TEST_THUMBNAIL }).success,
    true,
  );
  assert.equal(
    gameThumbnailInputSchema.safeParse({
      thumbnailDataUrl: "https://example.com/untrusted.png",
    }).success,
    false,
  );
  assert.equal(
    gameThumbnailInputSchema.safeParse({
      thumbnailDataUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    }).success,
    false,
  );
});
