import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_GAME_DOCUMENT } from "@/lib/game-contract";

import { GAME_PLAYER_CONTENT } from "./game-player-content";
import { gameCampaignMaps } from "./game-levels";
import { resolveMapVisuals, worldArtAssetId } from "./platformer/art-catalog";
import {
  applyPlatformerEditorSelectionClick,
  applyPlatformerLevelArt,
  applyPlatformerObjectEdits,
  applyPlatformerTerrainEdits,
  EMPTY_PLATFORMER_EDITOR_SELECTION,
  erasePlatformerObjectsAtCells,
  mergePlatformerObjectEdit,
  mergePlatformerObjectEdits,
  mergePlatformerTerrainEdits,
  movePlatformerEditorSelection,
  objectPlacementsFromStroke,
  platformerHudAtViewportCell,
  platformerObjectAtPreviewCell,
  platformerPreviewCellForObject,
  platformerSelectionWithoutObject,
  platformerTerrainKindAt,
  platformerUnselectableHeroId,
  upsertPlatformerObjectSettings,
} from "./platformer/map-editing";
import { createInitialState, snapPlatformerStateToGrid } from "./platformer/engine";

test("platformer content follows the displayed campaign order", () => {
  assert.deepEqual(
    GAME_PLAYER_CONTENT.maps.map(({ source, label }) => ({ source, label })),
    [
      { source: "level-1.json", label: "Green Hills" },
      { source: "level-3.json", label: "Graveyard" },
      { source: "level-2.json", label: "Space" },
      { source: "level-4.json", label: "Dragon World" },
      { source: "level-5.json", label: "Ice World" },
    ],
  );
});

test("a game-created level clones its approved theme as an independent map", () => {
  const levelId = "custom-platformer-123e4567-e89b-12d3-a456-426614174000";
  const levels = gameCampaignMaps({
    ...DEFAULT_GAME_DOCUMENT,
    platformerMapSource: levelId,
    platformerLevels: [{
      id: levelId,
      templateSource: "level-2.json",
      label: "Space 2",
    }],
  }, GAME_PLAYER_CONTENT.maps);
  const created = levels.find((level) => level.source === levelId);
  const template = GAME_PLAYER_CONTENT.maps.find((level) => level.source === "level-2.json");

  assert.deepEqual(levels.map((level) => level.source), [levelId]);
  assert.equal(created?.label, "Space 2");
  assert.equal(created?.map.presentation.backgroundId, "space_orbital_outpost_01");
  assert.notEqual(created?.map.id, template?.map.id);
  assert.ok(created);
  assert.ok(template);
  const edited = applyPlatformerTerrainEdits(created.map, levelId, [{
    mapSource: levelId,
    x: 1,
    y: 1,
    kind: "hazard",
  }]);
  assert.equal(platformerTerrainKindAt(edited, 1, 1), "hazard");
  assert.notEqual(
    platformerTerrainKindAt(edited, 1, 1),
    platformerTerrainKindAt(template.map, 1, 1),
  );
});

test("a game exposes only its active starting level and added levels", () => {
  const levelId = "custom-platformer-123e4567-e89b-12d3-a456-426614174001";
  const levels = gameCampaignMaps({
    ...DEFAULT_GAME_DOCUMENT,
    platformerLevels: [{
      id: levelId,
      templateSource: "level-2.json",
      label: "Space 1",
    }],
  }, GAME_PLAYER_CONTENT.maps);

  assert.deepEqual(
    levels.map(({ source, label }) => ({ source, label })),
    [
      { source: "level-1.json", label: "Green Hills" },
      { source: levelId, label: "Space 1" },
    ],
  );
});

test("paused preview actors remain selectable at their settled cells", () => {
  const map = GAME_PLAYER_CONTENT.maps[0].map;
  const initial = createInitialState(map);
  const enemy = initial.enemies[0];
  assert.ok(enemy);
  const settled = snapPlatformerStateToGrid(map, {
    ...initial,
    enemies: initial.enemies.map((candidate, index) => index === 0
      ? { ...candidate, x: candidate.x + map.tileSize * 0.74 }
      : candidate),
  });
  const enemyObject = map.objects.find((object) => object.id === enemy.id);
  assert.ok(enemyObject);
  const cell = platformerPreviewCellForObject(map, settled, enemyObject);
  assert.ok(cell);

  assert.equal(
    platformerObjectAtPreviewCell(map, settled, cell.x, cell.y)?.id,
    enemy.id,
  );
  assert.notDeepEqual(cell, { x: enemyObject.x, y: enemyObject.y });
});

test("saved builder object edits add every basic object tool to a checked-in map", () => {
  const checkedInMap = GAME_PLAYER_CONTENT.maps[0].map;
  const edits = [
    { id: "build-spawn-1", mapSource: "level-1.json" as const, x: 1, y: 8, kind: "spawn" as const },
    { id: "build-coin-1", mapSource: "level-1.json" as const, x: 3, y: 8, kind: "coin" as const },
    { id: "build-life-1", mapSource: "level-1.json" as const, x: 4, y: 8, kind: "extra_life" as const },
    { id: "build-spring-1", mapSource: "level-1.json" as const, x: 4, y: 7, kind: "platform_spring" as const },
    { id: "build-enemy-1", mapSource: "level-1.json" as const, x: 5, y: 8, kind: "enemy" as const },
    { id: "build-boss-1", mapSource: "level-1.json" as const, x: 6, y: 8, kind: "boss" as const },
    { id: "build-flying-1", mapSource: "level-1.json" as const, x: 7, y: 4, kind: "flying_object" as const },
    { id: "build-checkpoint-1", mapSource: "level-1.json" as const, x: 8, y: 8, kind: "checkpoint" as const },
    { id: "build-goal-1", mapSource: "level-1.json" as const, x: 9, y: 8, kind: "goal" as const },
  ];
  const editedMap = applyPlatformerObjectEdits(checkedInMap, "level-1.json", edits);

  assert.equal(editedMap.objects.find((object) => object.id === "build-spawn-1")?.type, "player_spawn");
  assert.equal(editedMap.objects.find((object) => object.id === "build-coin-1")?.type, "collectible");
  assert.equal(editedMap.objects.find((object) => object.id === "build-life-1")?.type, "extra_life");
  assert.deepEqual(
    editedMap.objects.find((object) => object.id === "build-spring-1"),
    {
      id: "build-spring-1",
      type: "platform_spring",
      x: 4,
      y: 7,
      assetId: "ice_world_platformer_spring_01",
      launchSpeedPxPerSecond: 1200,
    },
  );
  assert.equal(editedMap.objects.find((object) => object.id === "build-enemy-1")?.type, "enemy_spawn");
  assert.equal(editedMap.objects.find((object) => object.id === "build-boss-1")?.role, "boss");
  assert.equal(editedMap.objects.find((object) => object.id === "build-flying-1")?.type, "flying_object");
  assert.equal(editedMap.objects.find((object) => object.id === "build-checkpoint-1")?.type, "checkpoint");
  assert.equal(editedMap.objects.find((object) => object.id === "build-goal-1")?.type, "goal");
});

test("builder spawn placement replaces the authored spawn and remains map-scoped", () => {
  const checkedInMap = GAME_PLAYER_CONTENT.maps[0].map;
  const first = mergePlatformerObjectEdit([], "level-1.json", checkedInMap, {
    id: "build-spawn-1", x: 4, y: 8, kind: "spawn",
  });
  const moved = mergePlatformerObjectEdit(first, "level-1.json", checkedInMap, {
    id: "build-spawn-2", x: 7, y: 8, kind: "spawn",
  });
  const editedMap = applyPlatformerObjectEdits(checkedInMap, "level-1.json", moved);
  const spawns = editedMap.objects.filter((object) => object.type === "player_spawn");

  assert.deepEqual(spawns.map(({ id, x, y }) => ({ id, x, y })), [
    { id: "build-spawn-2", x: 7, y: 8 },
  ]);
  assert.equal(applyPlatformerObjectEdits(checkedInMap, "level-2.json", moved), checkedInMap);
});

test("a dragged object stroke places one piece per tile and keeps spawn unique", () => {
  const checkedInMap = GAME_PLAYER_CONTENT.maps[0].map;
  const coinStroke = objectPlacementsFromStroke(
    "coin",
    [{ x: 2, y: 8 }, { x: 3, y: 8 }, { x: 4, y: 8 }],
    (cell, index) => `build-coin-${index}-${cell.x}`,
  );
  const coins = mergePlatformerObjectEdits([], "level-1.json", checkedInMap, coinStroke);
  const editedMap = applyPlatformerObjectEdits(checkedInMap, "level-1.json", coins);

  assert.deepEqual(
    coinStroke.map(({ id, x, y, kind }) => ({ id, x, y, kind })),
    [
      { id: "build-coin-0-2", x: 2, y: 8, kind: "coin" },
      { id: "build-coin-1-3", x: 3, y: 8, kind: "coin" },
      { id: "build-coin-2-4", x: 4, y: 8, kind: "coin" },
    ],
  );
  assert.deepEqual(
    editedMap.objects
      .filter((object) => object.id.startsWith("build-coin-"))
      .map(({ id, x, y }) => ({ id, x, y })),
    [
      { id: "build-coin-0-2", x: 2, y: 8 },
      { id: "build-coin-1-3", x: 3, y: 8 },
      { id: "build-coin-2-4", x: 4, y: 8 },
    ],
  );

  const spawnStroke = objectPlacementsFromStroke(
    "spawn",
    [{ x: 2, y: 8 }, { x: 3, y: 8 }, { x: 7, y: 8 }],
    (cell, index) => `build-spawn-${index}-${cell.x}`,
  );
  assert.deepEqual(spawnStroke, [
    { id: "build-spawn-0-7", x: 7, y: 8, kind: "spawn" },
  ]);
});

test("the builder eraser removes added and authored objects but preserves the required spawn", () => {
  const checkedInMap = GAME_PLAYER_CONTENT.maps[0].map;
  const authoredCoin = checkedInMap.objects.find((object) => object.type === "collectible");
  const authoredSpawn = checkedInMap.objects.find((object) => object.type === "player_spawn");
  assert.ok(authoredCoin);
  assert.ok(authoredSpawn);
  const additions = mergePlatformerObjectEdit([], "level-1.json", checkedInMap, {
    id: "build-coin-erase", x: 2, y: 9, kind: "coin",
  });

  const erasedAddition = erasePlatformerObjectsAtCells(
    checkedInMap,
    "level-1.json",
    additions,
    [],
    [{ x: 2, y: 9 }],
  );
  // Erasing a builder-added object records a removal as well as dropping the
  // edit, because these arrays are unioned with the server's copy and the
  // dropped edit alone would let Cooper's stored version come back.
  assert.deepEqual(erasedAddition, {
    edits: [],
    removals: [{ mapSource: "level-1.json", objectId: "build-coin-erase" }],
    settings: [],
  });
  assert.equal(
    applyPlatformerObjectEdits(
      checkedInMap,
      "level-1.json",
      additions,
      erasedAddition.removals,
    ).objects.some((object) => object.id === "build-coin-erase"),
    false,
    "the removal suppresses the addition even if the edit survives a merge",
  );

  const erasedAuthored = erasePlatformerObjectsAtCells(
    checkedInMap,
    "level-1.json",
    [],
    [],
    [{ x: authoredCoin.x, y: authoredCoin.y }],
  );
  assert.deepEqual(erasedAuthored.removals, [
    { mapSource: "level-1.json", objectId: authoredCoin.id },
  ]);
  assert.equal(
    applyPlatformerObjectEdits(
      checkedInMap,
      "level-1.json",
      erasedAuthored.edits,
      erasedAuthored.removals,
    ).objects.some((object) => object.id === authoredCoin.id),
    false,
  );

  const protectedSpawn = erasePlatformerObjectsAtCells(
    checkedInMap,
    "level-1.json",
    [],
    [],
    [{ x: authoredSpawn.x, y: authoredSpawn.y }],
  );
  assert.deepEqual(protectedSpawn, { edits: [], removals: [], settings: [] });
});

test("enemy toolbox settings change character, behavior, and starting direction", () => {
  const checkedInMap = GAME_PLAYER_CONTENT.maps[0].map;
  const enemy = checkedInMap.objects.find(
    (object) => object.type === "enemy_spawn" && object.role !== "boss",
  );
  assert.ok(enemy);
  const settings = upsertPlatformerObjectSettings(
    [],
    "level-1.json",
    enemy.id,
    { assetId: "neutral_robot_01", behavior: "chaser", direction: "right" },
  );
  const editedMap = applyPlatformerObjectEdits(
    checkedInMap,
    "level-1.json",
    [],
    [],
    settings,
  );
  const editedEnemy = editedMap.objects.find((object) => object.id === enemy.id);

  assert.equal(editedEnemy?.assetId, "neutral_robot_01");
  assert.equal(editedEnemy?.behavior, "chaser");
  assert.equal(editedEnemy?.direction, "right");
  assert.equal(editedEnemy?.viewLeftTiles, enemy.viewLeftTiles ?? 8);
  assert.equal(editedEnemy?.viewRightTiles, enemy.viewRightTiles ?? 8);
});

test("Ice World is a checked-in slippery fifth map", () => {
  const iceWorld = GAME_PLAYER_CONTENT.maps.at(-1);
  assert.equal(iceWorld?.source, "level-5.json");
  assert.equal(iceWorld?.map.id, "ice_world_01");
  assert.equal(iceWorld?.map.presentation.backgroundId, "ice_world_01");
  assert.equal(iceWorld?.map.physics.groundTractionScale, 0.15);
  assert.deepEqual(iceWorld?.map.size, { columns: 88, rows: 12 });
  assert.deepEqual(
    new Set(
      iceWorld?.map.objects
        .filter((object) => object.type === "enemy_spawn" && object.role === "enemy")
        .map((object) => object.assetId),
    ),
    new Set(["ice_world_ghost_01", "ice_world_robot_01"]),
  );
});

test("saved builder edits change real checked-in platformer terrain", () => {
  const checkedInMap = GAME_PLAYER_CONTENT.maps[0].map;
  assert.equal(platformerTerrainKindAt(checkedInMap, 2, 9), "empty");

  const edits = mergePlatformerTerrainEdits(
    [],
    "level-1.json",
    checkedInMap,
    [
      { x: 2, y: 9, kind: "ground" },
      { x: 3, y: 9, kind: "platform" },
    ],
  );
  const editedMap = applyPlatformerTerrainEdits(
    checkedInMap,
    "level-1.json",
    edits,
  );

  assert.equal(platformerTerrainKindAt(editedMap, 2, 9), "ground");
  assert.equal(platformerTerrainKindAt(editedMap, 3, 9), "platform");
  assert.equal(editedMap.legend[editedMap.layers[0].rows[9][2]]?.collision, "solid");
  assert.equal(editedMap.legend[editedMap.layers[0].rows[9][3]]?.collision, "solid");
});

/**
 * The map sprite dropdowns let a kid mix worlds inside one level, so a painted
 * tile has to name its own art without dressing the rest of the level in it.
 */
test("a tile painted from another world keeps that world's art on this map", () => {
  const checkedInMap = GAME_PLAYER_CONTENT.maps[0].map;
  assert.equal(checkedInMap.presentation.backgroundId, "neutral_green_hills_01");

  const edits = mergePlatformerTerrainEdits(
    [],
    "level-1.json",
    checkedInMap,
    [
      { x: 2, y: 9, kind: "ground" },
      { x: 3, y: 9, kind: "hazard" },
    ],
    "haunted_graveyard_01",
  );
  const editedMap = applyPlatformerTerrainEdits(checkedInMap, "level-1.json", edits);
  const terrain = editedMap.layers.find((layer) => layer.id === "terrain");
  const overrideAt = (x: number, y: number) =>
    terrain?.spriteOverrides?.find((override) => override.x === x && override.y === y);

  assert.equal(platformerTerrainKindAt(editedMap, 2, 9), "ground");
  assert.equal(overrideAt(2, 9)?.assetId, worldArtAssetId("haunted_graveyard_01", "ground"));
  assert.equal(overrideAt(3, 9)?.assetId, worldArtAssetId("haunted_graveyard_01", "hazard"));
  assert.equal(overrideAt(4, 9), undefined, "an untouched cell is left alone");
  assert.equal(
    resolveMapVisuals(editedMap.presentation).ground,
    "greenGround",
    "the rest of the level still wears its own art",
  );
});

test("repainting a tile as what it already was records the world it now wears", () => {
  const checkedInMap = GAME_PLAYER_CONTENT.maps[0].map;
  const rows = checkedInMap.layers.find((layer) => layer.id === "terrain")?.rows ?? [];
  const ground = rows.flatMap((row, y) => {
    const x = [...row].findIndex(
      (symbol) => checkedInMap.legend[symbol]?.visualSlot === "ground",
    );
    return x < 0 ? [] : [{ x, y }];
  })[0];
  assert.ok(ground, "level-1 has ground to repaint");

  const restyled = mergePlatformerTerrainEdits(
    [],
    "level-1.json",
    checkedInMap,
    [{ ...ground, kind: "ground" }],
    "ice_world_01",
  );
  const restored = mergePlatformerTerrainEdits(
    restyled,
    "level-1.json",
    checkedInMap,
    [{ ...ground, kind: "ground" }],
  );

  assert.deepEqual(restyled, [
    { mapSource: "level-1.json", ...ground, kind: "ground", world: "ice_world_01" },
  ]);
  assert.deepEqual(restored, [], "painting it back from its own world drops the row");
});

test("a pickup placed from another world wears that world's art", () => {
  const checkedInMap = GAME_PLAYER_CONTENT.maps[0].map;
  const edits = mergePlatformerObjectEdits(
    [],
    "level-1.json",
    checkedInMap,
    [
      { id: "build-ice-coin", x: 2, y: 8, kind: "coin" },
      { id: "build-ice-goal", x: 3, y: 8, kind: "goal" },
      { id: "build-ice-enemy", x: 4, y: 8, kind: "enemy" },
    ],
    "ice_world_01",
  );
  const placed = applyPlatformerObjectEdits(checkedInMap, "level-1.json", edits);
  const artOf = (map: typeof placed, id: string) =>
    map.objects.find((object) => object.id === id)?.assetId;

  assert.equal(artOf(placed, "build-ice-coin"), worldArtAssetId("ice_world_01", "coin"));
  assert.equal(artOf(placed, "build-ice-goal"), worldArtAssetId("ice_world_01", "goal"));
  assert.equal(artOf(placed, "build-ice-enemy"), "ice_world_ghost_01");

  // Cooper dressing the whole level afterwards must not undo a hand-picked
  // thing, or a kid would watch their Ice World ghost turn into a bat.
  const dressed = applyPlatformerLevelArt(
    placed,
    "level-1.json",
    [{ mapSource: "level-1.json", slot: "enemy", world: "haunted_graveyard_01" }],
    [],
    edits,
  );
  assert.equal(artOf(dressed, "build-ice-enemy"), "ice_world_ghost_01");
  assert.equal(
    dressed.objects.find((object) => object.id !== "build-ice-enemy" && object.type === "enemy_spawn")
      ?.assetId,
    "haunted_ghost_01",
    "an enemy the level placed still follows the borrow",
  );
});

test("builder edits are map-scoped and prune restored cells", () => {
  const checkedInMap = GAME_PLAYER_CONTENT.maps[0].map;
  const added = mergePlatformerTerrainEdits(
    [],
    "level-1.json",
    checkedInMap,
    [{ x: 2, y: 9, kind: "hazard" }],
  );
  const restored = mergePlatformerTerrainEdits(
    added,
    "level-1.json",
    checkedInMap,
    [{ x: 2, y: 9, kind: "empty" }],
  );
  const untouched = applyPlatformerTerrainEdits(checkedInMap, "level-1.json", [
    { mapSource: "level-2.json", x: 2, y: 9, kind: "ground" },
  ]);

  assert.equal(added.length, 1);
  assert.deepEqual(restored, []);
  assert.equal(untouched, checkedInMap);
});

test("an object edit that reuses an authored id relocates that object", () => {
  const checkedInMap = GAME_PLAYER_CONTENT.maps[0].map;
  const coin = checkedInMap.objects.find((object) => object.type === "collectible");
  assert.ok(coin);
  const nextX = Math.min(coin.x + 2, checkedInMap.size.columns - 1);
  const editedMap = applyPlatformerObjectEdits(checkedInMap, "level-1.json", [{
    id: coin.id,
    mapSource: "level-1.json",
    x: nextX,
    y: coin.y,
    kind: "coin",
  }]);
  const matches = editedMap.objects.filter((object) => object.id === coin.id);

  assert.deepEqual(matches.map(({ id, x, y, type }) => ({ id, x, y, type })), [
    { id: coin.id, x: nextX, y: coin.y, type: "collectible" },
  ]);
});

test("moving a builder-placed object updates that edit instead of duplicating it", () => {
  const checkedInMap = GAME_PLAYER_CONTENT.maps[0].map;
  const placed = mergePlatformerObjectEdit([], "level-1.json", checkedInMap, {
    id: "build-coin-move", x: 2, y: 8, kind: "coin",
  });
  const moved = movePlatformerEditorSelection(
    checkedInMap,
    "level-1.json",
    placed,
    [],
    [],
    [],
    { objectIds: ["build-coin-move"], terrainCells: [] },
    3,
    0,
  );

  assert.deepEqual(moved.platformerObjectEdits, [{
    id: "build-coin-move",
    mapSource: "level-1.json",
    x: 5,
    y: 8,
    kind: "coin",
  }]);
  assert.deepEqual(
    applyPlatformerObjectEdits(checkedInMap, "level-1.json", moved.platformerObjectEdits)
      .objects
      .filter((object) => object.id === "build-coin-move")
      .map(({ x, y }) => ({ x, y })),
    [{ x: 5, y: 8 }],
  );
});

test("select-tool moves keep mixed terrain and objects together", () => {
  const checkedInMap = GAME_PLAYER_CONTENT.maps[0].map;
  const coin = checkedInMap.objects.find((object) => object.type === "collectible");
  assert.ok(coin);
  const painted = mergePlatformerTerrainEdits(
    [],
    "level-1.json",
    checkedInMap,
    [{ x: 2, y: 8, kind: "ground" }],
  );
  const fromKind = platformerTerrainKindAt(
    applyPlatformerTerrainEdits(checkedInMap, "level-1.json", painted),
    2,
    8,
  );
  const moved = movePlatformerEditorSelection(
    checkedInMap,
    "level-1.json",
    [],
    [],
    [],
    painted,
    { objectIds: [coin.id], terrainCells: [{ x: 2, y: 8 }] },
    1,
    0,
  );
  const editedMap = applyPlatformerObjectEdits(
    applyPlatformerTerrainEdits(checkedInMap, "level-1.json", moved.platformerTerrainEdits),
    "level-1.json",
    moved.platformerObjectEdits,
  );

  assert.equal(fromKind, "ground");
  assert.equal(platformerTerrainKindAt(editedMap, 2, 8), "empty");
  assert.equal(platformerTerrainKindAt(editedMap, 3, 8), "ground");
  assert.equal(editedMap.objects.find((object) => object.id === coin.id)?.x, coin.x + 1);
  assert.deepEqual(moved.selection, {
    objectIds: [coin.id],
    terrainCells: [{ x: 3, y: 8 }],
  });
});

test("a selection move clamps to the map edge", () => {
  const checkedInMap = GAME_PLAYER_CONTENT.maps[0].map;
  const moved = movePlatformerEditorSelection(
    checkedInMap,
    "level-1.json",
    [],
    [],
    [],
    [],
    { objectIds: [], terrainCells: [{ x: checkedInMap.size.columns - 1, y: 11 }] },
    8,
    0,
  );

  assert.deepEqual(moved.delta, { dx: 0, dy: 0 });
  assert.deepEqual(moved.platformerTerrainEdits, []);
});

test("HUD overlay cells are ignored by the select tool", () => {
  const checkedInMap = GAME_PLAYER_CONTENT.maps[0].map;
  const lives = platformerHudAtViewportCell(checkedInMap, 5, 0);
  const coins = platformerHudAtViewportCell(checkedInMap, 9, 0);
  const besideLives = platformerHudAtViewportCell(checkedInMap, 7, 0);

  assert.equal(lives?.type, "lives");
  assert.equal(platformerHudAtViewportCell(checkedInMap, 6, 0)?.type, "lives");
  assert.equal(coins?.type, "coins");
  assert.equal(besideLives, null);
  assert.equal(
    applyPlatformerEditorSelectionClick(
      EMPTY_PLATFORMER_EDITOR_SELECTION,
      { type: "hud" },
      false,
    ),
    null,
  );
});

test("select-tool clicks add items and clicking again unselects them", () => {
  const added = applyPlatformerEditorSelectionClick(
    EMPTY_PLATFORMER_EDITOR_SELECTION,
    { type: "object", id: "coin_1" },
    false,
  );
  const both = applyPlatformerEditorSelectionClick(
    added ?? EMPTY_PLATFORMER_EDITOR_SELECTION,
    { type: "terrain", x: 2, y: 8 },
    false,
  );
  const unselected = applyPlatformerEditorSelectionClick(
    both ?? EMPTY_PLATFORMER_EDITOR_SELECTION,
    { type: "object", id: "coin_1" },
    false,
  );
  const toggled = applyPlatformerEditorSelectionClick(
    both ?? EMPTY_PLATFORMER_EDITOR_SELECTION,
    { type: "terrain", x: 2, y: 8 },
    true,
  );
  const cleared = applyPlatformerEditorSelectionClick(
    both ?? EMPTY_PLATFORMER_EDITOR_SELECTION,
    { type: "empty" },
    false,
  );

  assert.deepEqual(added, { objectIds: ["coin_1"], terrainCells: [] });
  assert.deepEqual(both, {
    objectIds: ["coin_1"],
    terrainCells: [{ x: 2, y: 8 }],
  });
  assert.deepEqual(unselected, { objectIds: [], terrainCells: [{ x: 2, y: 8 }] });
  assert.deepEqual(toggled, { objectIds: ["coin_1"], terrainCells: [] });
  assert.deepEqual(cleared, EMPTY_PLATFORMER_EDITOR_SELECTION);
});

test("a zoomed-out map has no hero to select, so a placement opens no settings", () => {
  const checkedInMap = GAME_PLAYER_CONTENT.maps[0].map;
  const heroId = checkedInMap.objects.find(
    (object) => object.type === "player_spawn",
  )?.id;
  const selection = { objectIds: [heroId ?? "", "coin_1"], terrainCells: [{ x: 2, y: 8 }] };

  assert.ok(heroId);
  assert.equal(platformerUnselectableHeroId(checkedInMap, 1), null);
  assert.equal(platformerUnselectableHeroId(checkedInMap, 0.8), heroId);
  assert.deepEqual(
    platformerSelectionWithoutObject(
      selection,
      platformerUnselectableHeroId(checkedInMap, 0.8),
    ),
    { objectIds: ["coin_1"], terrainCells: [{ x: 2, y: 8 }] },
  );
  assert.equal(
    platformerSelectionWithoutObject(
      selection,
      platformerUnselectableHeroId(checkedInMap, 1),
    ),
    selection,
  );
});
