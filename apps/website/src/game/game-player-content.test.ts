import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_GAME_DOCUMENT } from "@/lib/game-contract";

import { GAME_PLAYER_CONTENT } from "./game-player-content";
import { gameCampaignMaps } from "./game-levels";
import {
  applyPlatformerObjectEdits,
  applyPlatformerTerrainEdits,
  erasePlatformerObjectsAtCells,
  mergePlatformerObjectEdit,
  mergePlatformerTerrainEdits,
  platformerObjectAtPreviewCell,
  platformerPreviewCellForObject,
  platformerTerrainKindAt,
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
