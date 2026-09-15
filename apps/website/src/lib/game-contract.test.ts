import assert from "node:assert/strict";
import test from "node:test";

import { generatedMazeMapSchema } from "./generated-map-contract";
import {
  activeGameTheme,
  activeMapSource,
  activePlayerAssetId,
  DEFAULT_GAME_DOCUMENT,
  defaultGameTitle,
  gameDocumentSchema,
  gameThumbnailInputSchema,
  playerAssetIdFor,
  playerAssetIdForPlatformerLevel,
  playerAssetIsInvulnerable,
  PLATFORMER_MAP_SOURCES,
  PLAYER_CHARACTERS,
  THEME_MAP_SOURCES,
  toPublicGameDocument,
} from "./game-contract";

function generatedPlatformerDocument() {
  const source = "custom-platformer-gen-contract-test";
  return {
    ...DEFAULT_GAME_DOCUMENT,
    mapStyle: "generated" as const,
    platformerMapSource: source,
    generatedPlatformerMaps: [{
      source,
      templateSource: "level-1.json" as const,
      length: "short" as const,
      generatorVersion: "test-v1",
      map: {
        schemaVersion: 1,
        id: source,
        revision: 1,
        runtime: "platformer_v1" as const,
        tileSize: 64 as const,
        size: { columns: 2, rows: 2 },
        camera: { columns: 2, rows: 2 },
        physics: { gravityScale: 1 },
        rules: { respawnDelaySeconds: 1 },
        presentation: { backgroundId: "neutral_green_hills_01" },
        legend: { ".": { visualSlot: "empty" as const, collision: "none" as const } },
        layers: [{ id: "terrain", rows: ["..", ".."] }],
        objects: [
          {
            id: "spawn",
            type: "player_spawn" as const,
            x: 0,
            y: 0,
            speedPxPerSecond: 320,
            motion: { version: 1 as const, travel: { type: "controlled" as const }, visual: { type: "none" as const } },
          },
          { id: "goal", type: "goal" as const, x: 1, y: 1 },
        ],
      },
    }],
  };
}

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

test("generated style may persist only while setup awaits its map length", () => {
  for (const previewKind of ["platformer", "maze"] as const) {
    const transitional = {
      ...DEFAULT_GAME_DOCUMENT,
      previewKind,
      mapStyle: "generated" as const,
      setupStep: "mapLength" as const,
      builderSetupHistory: ["gameType", "theme", "mapStyle", "mapLength"] as const,
    };
    assert.doesNotThrow(() => gameDocumentSchema.parse(transitional));

    for (const setupStep of ["character", "complete"] as const) {
      assert.equal(
        gameDocumentSchema.safeParse({ ...transitional, setupStep }).success,
        false,
        `${previewKind} generated style without a materialized map must fail at ${setupStep}`,
      );
    }
  }
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
  assert.deepEqual(parsed.platformerTerrainSettings, []);
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
  assert.deepEqual(PLAYER_CHARACTERS, [
    "cooper",
    "rupert",
    "jamie",
    "vix",
    "leenie",
    "lango",
    "human",
    "ghost",
    "robot",
  ]);
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
  for (const theme of ["green_hills", "graveyard", "space", "dragon_world"] as const) {
    assert.equal(playerAssetIdFor(theme, "rupert"), "neutral_rupert_01");
    assert.equal(playerAssetIdFor(theme, "jamie"), "neutral_jamie_01");
    assert.equal(playerAssetIdFor(theme, "vix"), "neutral_vix_01");
    assert.equal(playerAssetIdFor(theme, "leenie"), "neutral_leenie_01");
    assert.equal(playerAssetIdFor(theme, "lango"), "neutral_lango_01");
  }
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
      playerCharacter: "rupert",
    }),
    "neutral_rupert_01",
  );
  assert.equal(
    activePlayerAssetId({
      ...DEFAULT_GAME_DOCUMENT,
      platformerMapSource: "level-5.json",
      playerCharacter: "jamie",
    }),
    "neutral_jamie_01",
  );
  assert.equal(
    activePlayerAssetId({
      ...DEFAULT_GAME_DOCUMENT,
      platformerMapSource: "level-5.json",
      playerCharacter: "vix",
    }),
    "neutral_vix_01",
  );
  assert.equal(
    activePlayerAssetId({
      ...DEFAULT_GAME_DOCUMENT,
      platformerMapSource: "level-5.json",
      playerCharacter: "leenie",
    }),
    "neutral_leenie_01",
  );
  assert.equal(
    activePlayerAssetId({
      ...DEFAULT_GAME_DOCUMENT,
      platformerMapSource: "level-5.json",
      playerCharacter: "lango",
    }),
    "neutral_lango_01",
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

test("Rupert is the only invulnerable hero", () => {
  assert.equal(playerAssetIsInvulnerable("neutral_rupert_01"), true);
  assert.equal(playerAssetIsInvulnerable("neutral_cooper_01"), false);
  assert.equal(playerAssetIsInvulnerable("neutral_jamie_01"), false);
  assert.equal(playerAssetIsInvulnerable("neutral_leenie_01"), false);
  assert.equal(playerAssetIsInvulnerable("neutral_lango_01"), false);
});

test("playerAssetIdForPlatformerLevel resolves sprites from the level template and background", () => {
  assert.equal(
    playerAssetIdForPlatformerLevel(
      "level-1.json",
      "neutral_green_hills_01",
      "jamie",
    ),
    "neutral_jamie_01",
  );
  assert.equal(
    playerAssetIdForPlatformerLevel(
      "level-5.json",
      "ice_world_01",
      "cooper",
    ),
    "ice_world_cooper_01",
  );
  assert.equal(
    playerAssetIdForPlatformerLevel(
      "level-5.json",
      "ice_world_01",
      "human",
      "girl",
    ),
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

test("generated maps reject unbounded or invalid runtime data at document and public boundaries", () => {
  const valid = generatedPlatformerDocument();
  assert.equal(gameDocumentSchema.safeParse(valid).success, true);
  assert.doesNotThrow(() => toPublicGameDocument(valid));

  const cases = [
    {
      ...valid,
      generatedPlatformerMaps: [{ ...valid.generatedPlatformerMaps[0], map: {
        ...valid.generatedPlatformerMaps[0]!.map,
        camera: { columns: 3, rows: 2 },
      } }],
    },
    {
      ...valid,
      generatedPlatformerMaps: [{ ...valid.generatedPlatformerMaps[0], map: {
        ...valid.generatedPlatformerMaps[0]!.map,
        layers: [{ id: "terrain", rows: [".?", ".."] }],
      } }],
    },
    {
      ...valid,
      generatedPlatformerMaps: [{ ...valid.generatedPlatformerMaps[0], map: {
        ...valid.generatedPlatformerMaps[0]!.map,
        presentation: {
          backgroundId: "neutral_green_hills_01",
          hud: [{ id: "lives", type: "lives", column: 2, row: 0 }],
        },
      } }],
    },
    {
      ...valid,
      generatedPlatformerMaps: [{ ...valid.generatedPlatformerMaps[0], map: {
        ...valid.generatedPlatformerMaps[0]!.map,
        presentation: {
          backgroundId: "neutral_green_hills_01",
          artBorrows: Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`slot-${index}`, "neutral_green_hills_01"])),
        },
      } }],
    },
    {
      ...valid,
      generatedPlatformerMaps: [{ ...valid.generatedPlatformerMaps[0], map: {
        ...valid.generatedPlatformerMaps[0]!.map,
        objects: [valid.generatedPlatformerMaps[0]!.map.objects[0]],
      } }],
    },
    {
      ...valid,
      generatedPlatformerMaps: [{ ...valid.generatedPlatformerMaps[0], map: {
        ...valid.generatedPlatformerMaps[0]!.map,
        id: "custom-platformer-gen-wrong-id",
      } }],
    },
  ];

  for (const invalid of cases) {
    assert.equal(gameDocumentSchema.safeParse(invalid).success, false);
    assert.throws(() => toPublicGameDocument(invalid as never));
  }
});

test("generated mazes require bounded camera, floor objects, and a key-linked exit", () => {
  const maze = {
    schemaVersion: 1,
    id: "custom-maze-gen-contract-test",
    revision: 1,
    runtime: "top_down_v1" as const,
    tileSize: 64 as const,
    width: 3,
    height: 3,
    camera: { columns: 3, rows: 3 },
    legend: { "#": "solid_wall" as const, ".": "floor" as const },
    presentation: { mazeThemeId: "neutral_green_hills_maze_01" },
    tiles: ["###", "#.#", "###"],
    objects: [
      { id: "spawn", type: "player_spawn" as const, x: 1, y: 1, slot: 1, speed: 224 },
      { id: "key", type: "key" as const, x: 1, y: 1 },
      { id: "exit", type: "exit" as const, x: 1, y: 1, requires: "key" },
    ],
  };
  // The base map deliberately demonstrates the no-overlap invariant.
  assert.equal(generatedMazeMapSchema.safeParse(maze).success, false);
  const valid = {
    ...maze,
    width: 5,
    tiles: ["#####", "#...#", "#####"],
    objects: [
      { id: "spawn", type: "player_spawn" as const, x: 1, y: 1, slot: 1, speed: 224 },
      { id: "key", type: "key" as const, x: 2, y: 1 },
      { id: "exit", type: "exit" as const, x: 3, y: 1, requires: "key" },
    ],
  };
  assert.equal(generatedMazeMapSchema.safeParse(valid).success, true);
  assert.equal(generatedMazeMapSchema.safeParse({
    ...valid,
    camera: { columns: 6, rows: 3 },
  }).success, false);
  assert.equal(generatedMazeMapSchema.safeParse({
    ...valid,
    objects: [...valid.objects.slice(0, 2), { ...valid.objects[2], requires: "other-key" }],
  }).success, false);
});

test("game thumbnails only accept blob confirm payloads", () => {
  assert.equal(
    gameThumbnailInputSchema.safeParse({
      url: "https://abc.public.blob.vercel-storage.com/users/owner-a/games/game-1/thumbnail.webp",
      pathname: "users/owner-a/games/game-1/thumbnail.webp",
    }).success,
    true,
  );
  assert.equal(
    gameThumbnailInputSchema.safeParse({
      thumbnailDataUrl: "data:image/webp;base64,UklGRg==",
    }).success,
    false,
  );
  assert.equal(
    gameThumbnailInputSchema.safeParse({
      url: "not-a-url",
      pathname: "users/owner-a/games/game-1/thumbnail.webp",
    }).success,
    false,
  );
});
