import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPlatformerObjectEdits,
  applyPlatformerRules,
  platformerObjectKind,
} from "../game/platformer/map-editing";
import { createInitialState, DEFAULT_STARTING_LIVES } from "../game/platformer/engine";
import { GAME_PLAYER_CONTENT } from "../game/game-player-content";
import { DEFAULT_GAME_DOCUMENT, type GameDocument } from "./game-contract";
import { applyCooperSpecChange } from "./cooper-spec-change";
import {
  COOPER_OBJECT_KINDS,
  describeLevel,
  GameObjectEditError,
  MAX_PLACEMENTS_PER_CALL,
  planAppearanceChange,
  planObjectAdditions,
  planObjectRemovals,
  planStartingLives,
  resolveActivePlatformerLevel,
  type ActivePlatformerLevel,
} from "./game-objects";

/**
 * Cells read off the checked-in `level-1.json` that `/build` actually loads.
 * Row 11 is the ground line, row 10 is open above it, and row 0 is open sky.
 */
const OPEN_SKY = { x: 0, y: 0 };
const ON_GROUND = { x: 0, y: 10 };
const ALSO_ON_GROUND = { x: 2, y: 10 };
const GROUND_TILE = { x: 0, y: 11 };
const HAZARD_TILE = { x: 14, y: 11 };
const AUTHORED_COIN = { x: 3, y: 8 };
const AUTHORED_SPAWN = { x: 1, y: 10 };

function level(spec: GameDocument = DEFAULT_GAME_DOCUMENT): ActivePlatformerLevel {
  const resolved = resolveActivePlatformerLevel(spec);
  assert.ok(resolved, "the default game should resolve a platformer level");
  return resolved;
}

function rejects(run: () => unknown, match: RegExp) {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof GameObjectEditError, `expected a GameObjectEditError, got ${error}`);
    assert.match(error.reason, match);
    return;
  }
  assert.fail(`expected a rejection matching ${match}`);
}

test("the active level is the checked-in level-1 map the builder shows", () => {
  const active = level();

  assert.equal(active.mapSource, "level-1.json");
  assert.deepEqual(active.map.size, { columns: 88, rows: 12 });
  assert.equal(
    active.map.objects.length,
    GAME_PLAYER_CONTENT.maps[0].map.objects.length,
    "no edits means the effective map matches the catalog map",
  );
});

test("a maze game has no platformer level for Cooper to change", () => {
  assert.equal(
    resolveActivePlatformerLevel({ ...DEFAULT_GAME_DOCUMENT, previewKind: "maze" }),
    null,
  );
});

test("the level description gives Cooper matching terrain and object grids", () => {
  const described = describeLevel(level());

  assert.equal(described.terrain.length, 12);
  assert.equal(described.objects.length, 12);
  for (const row of [...described.terrain, ...described.objects]) {
    assert.equal(row.length, 88);
  }
  assert.equal(described.terrain[11][GROUND_TILE.x], "#");
  assert.equal(described.terrain[11][HAZARD_TILE.x], "^");
  assert.equal(described.objects[AUTHORED_COIN.y][AUTHORED_COIN.x], "c");
  assert.equal(described.objects[AUTHORED_SPAWN.y][AUTHORED_SPAWN.x], "P");
  assert.equal(described.objects[OPEN_SKY.y][OPEN_SKY.x], ".");
  assert.equal(described.counts.coin, 93);
  assert.equal(described.counts.spawn, 1);
  assert.deepEqual(described.addableKinds, COOPER_OBJECT_KINDS);
});

test("a coin may float, and Cooper's ids continue a stable sequence", () => {
  const active = level();
  const first = planObjectAdditions(DEFAULT_GAME_DOCUMENT, active, [
    { kind: "coin", ...OPEN_SKY },
    { kind: "coin", x: 1, y: 0 },
  ]);

  assert.deepEqual(first.added.map((edit) => edit.id), ["cooper-coin-1", "cooper-coin-2"]);
  assert.deepEqual(first.added[0], {
    id: "cooper-coin-1",
    mapSource: "level-1.json",
    x: 0,
    y: 0,
    kind: "coin",
  });

  const carried = { ...DEFAULT_GAME_DOCUMENT, platformerObjectEdits: first.platformerObjectEdits };
  const second = planObjectAdditions(carried, level(carried), [{ kind: "coin", x: 2, y: 0 }]);
  assert.deepEqual(second.added.map((edit) => edit.id), ["cooper-coin-3"]);
});

test("an enemy needs solid ground under it, a coin does not", () => {
  const active = level();

  const grounded = planObjectAdditions(DEFAULT_GAME_DOCUMENT, active, [
    { kind: "enemy", ...ON_GROUND },
    { kind: "platform_spring", ...ALSO_ON_GROUND },
  ]);
  assert.deepEqual(grounded.added.map((edit) => edit.id), [
    "cooper-enemy-1",
    "cooper-platform_spring-1",
  ]);

  rejects(
    () => planObjectAdditions(DEFAULT_GAME_DOCUMENT, active, [{ kind: "enemy", ...OPEN_SKY }]),
    /solid ground underneath/,
  );
});

test("placements are refused rather than nudged when the cell will not work", () => {
  const active = level();
  const add = (placements: { kind: string; x: number; y: number }[]) =>
    () => planObjectAdditions(DEFAULT_GAME_DOCUMENT, active, placements);

  rejects(add([{ kind: "coin", ...GROUND_TILE }]), /not empty, it is ground/);
  rejects(add([{ kind: "coin", ...HAZARD_TILE }]), /not empty, it is hazard/);
  rejects(add([{ kind: "coin", ...AUTHORED_COIN }]), /already in that spot/);
  rejects(add([{ kind: "coin", x: 88, y: 0 }]), /outside the level/);
  rejects(add([{ kind: "coin", x: 0, y: -1 }]), /outside the level/);
  rejects(add([{ kind: "coin", x: 0.5, y: 0 }]), /whole numbers/);
  rejects(
    add([{ kind: "coin", ...OPEN_SKY }, { kind: "extra_life", ...OPEN_SKY }]),
    /two things in the same spot/,
  );
  rejects(add([]), /what to add and where/);
  rejects(
    add(Array.from({ length: MAX_PLACEMENTS_PER_CALL + 1 }, (_, index) => ({
      kind: "coin",
      x: index,
      y: 0,
    }))),
    /only add 24 things at a time/,
  );
});

test("Cooper cannot add or remove the player start or the goal", () => {
  const active = level();

  for (const kind of ["spawn", "goal"]) {
    rejects(
      () => planObjectAdditions(DEFAULT_GAME_DOCUMENT, active, [{ kind, ...OPEN_SKY }]),
      /cannot add a/,
    );
    rejects(
      () => planObjectRemovals(DEFAULT_GAME_DOCUMENT, active, kind, []),
      /cannot remove a/,
    );
  }
});

test("a named cell removes just that object, and no cells removes every one", () => {
  const active = level();

  const one = planObjectRemovals(DEFAULT_GAME_DOCUMENT, active, "coin", [AUTHORED_COIN]);
  assert.equal(one.removedCount, 1);
  assert.deepEqual(one.platformerObjectRemovals, [
    { mapSource: "level-1.json", objectId: "coin_18" },
  ]);

  const all = planObjectRemovals(DEFAULT_GAME_DOCUMENT, active, "coin", []);
  assert.equal(all.removedCount, 93);
  assert.equal(all.platformerObjectRemovals.length, 93);
});

test("removing a cell that holds nothing of that kind is refused", () => {
  const active = level();

  rejects(
    () => planObjectRemovals(DEFAULT_GAME_DOCUMENT, active, "enemy", [AUTHORED_COIN]),
    /no enemy in that spot/,
  );
  rejects(
    () => planObjectRemovals(DEFAULT_GAME_DOCUMENT, active, "coin", [OPEN_SKY]),
    /no coin in that spot/,
  );
  // level-1 has coins, enemies, a boss and a checkpoint, but no springs.
  rejects(
    () => planObjectRemovals(DEFAULT_GAME_DOCUMENT, active, "platform_spring", []),
    /no springs in this level/,
  );
});

test("removing something Cooper added drops the edit instead of stacking a pair", () => {
  const added = planObjectAdditions(DEFAULT_GAME_DOCUMENT, level(), [
    { kind: "coin", ...OPEN_SKY },
  ]);
  const spec = { ...DEFAULT_GAME_DOCUMENT, platformerObjectEdits: added.platformerObjectEdits };

  const removed = planObjectRemovals(spec, level(spec), "coin", [OPEN_SKY]);

  assert.deepEqual(removed.platformerObjectEdits, []);
  assert.deepEqual(removed.platformerObjectRemovals, [
    { mapSource: "level-1.json", objectId: "cooper-coin-1" },
  ]);
});

test("Cooper's plan lands in the map the site player actually builds", () => {
  const catalog = GAME_PLAYER_CONTENT.maps[0];
  const added = planObjectAdditions(DEFAULT_GAME_DOCUMENT, level(), [
    { kind: "coin", ...OPEN_SKY },
    { kind: "enemy", ...ON_GROUND },
  ]);
  const removed = planObjectRemovals(
    { ...DEFAULT_GAME_DOCUMENT, ...added },
    level({ ...DEFAULT_GAME_DOCUMENT, ...added }),
    "coin",
    [AUTHORED_COIN],
  );

  const played = applyPlatformerObjectEdits(
    catalog.map,
    catalog.source,
    removed.platformerObjectEdits,
    removed.platformerObjectRemovals,
    [],
  );

  const coin = played.objects.find((object) => object.id === "cooper-coin-1");
  const enemy = played.objects.find((object) => object.id === "cooper-enemy-1");
  assert.deepEqual(
    { type: coin?.type, x: coin?.x, y: coin?.y },
    { type: "collectible", x: 0, y: 0 },
  );
  assert.equal(platformerObjectKind(enemy!), "enemy");
  assert.equal(enemy?.x, ON_GROUND.x);
  assert.equal(
    played.objects.some((object) => object.id === "coin_18"),
    false,
    "the erased authored coin stays out of the played map",
  );
  assert.equal(
    played.objects.filter((object) => object.type === "player_spawn").length,
    1,
    "Cooper never disturbs the single player spawn",
  );
});


test("starting lives default to the engine's count until Cooper sets one", () => {
  assert.equal(describeLevel(level()).startingLives, DEFAULT_STARTING_LIVES);
  assert.equal(
    createInitialState(level().map).lives,
    DEFAULT_STARTING_LIVES,
    "an untouched game still starts with the default",
  );
});

test("ten lives becomes the played map's own starting count", () => {
  const change = planStartingLives(10);
  assert.deepEqual(change, { startingLives: 10 });

  const spec = applyCooperSpecChange(DEFAULT_GAME_DOCUMENT, change);
  const played = level(spec).map;

  // The count lives on the map, so a fresh start and a post-game-over restart
  // both read 10 rather than the engine default.
  assert.equal(played.rules.startingLives, 10);
  assert.equal(createInitialState(played).lives, 10);
  assert.equal(describeLevel(level(spec)).startingLives, 10);
});

test("a life count outside the allowed range or not a whole number is refused", () => {
  rejects(() => planStartingLives(0), /between 1 and 99/);
  rejects(() => planStartingLives(100), /between 1 and 99/);
  rejects(() => planStartingLives(2.5), /whole number/);
  rejects(() => planStartingLives("ten"), /whole number/);
});

test("an unknown starting-lives value on a map falls back rather than breaking play", () => {
  const broken = applyPlatformerRules(level().map, undefined);
  assert.equal(createInitialState(broken).lives, DEFAULT_STARTING_LIVES);
});

test("read_game_objects lists each enemy with its look and every world's options", () => {
  const { characters } = describeLevel(level());

  assert.ok(characters.inLevel.length > 0, "level-1 should ship with enemies");
  for (const character of characters.inLevel) {
    assert.ok(character.look, `${character.role} at ${character.x},${character.y} has no look`);
  }
  const greenHills = characters.enemyLooksByWorld.find(
    (entry) => entry.world === "Green Hills",
  );
  assert.deepEqual(
    greenHills?.looks.map((option) => option.value),
    [
      "neutral_cooper_01",
      "neutral_human_01",
      "neutral_ghost_01",
      "neutral_robot_01",
      "neutral_zombie_01",
    ],
  );
  assert.ok(
    characters.enemyLooksByWorld
      .find((entry) => entry.world === "Dragon World")
      ?.looks.some((option) => option.value === "dragon_ghost_01"),
    "a Green Hills level should still be offered Dragon World looks",
  );
});

test("turning the ghosts into robots repaints only the ghosts and keeps their behavior", () => {
  const active = level();
  const ghosts = describeLevel(active).characters.inLevel
    .filter((character) => character.look === "neutral_ghost_01");
  assert.ok(ghosts.length > 0, "level-1 should ship with ghost enemies");

  const change = planAppearanceChange(
    DEFAULT_GAME_DOCUMENT,
    active,
    "neutral_robot_01",
    "neutral_ghost_01",
    [],
  );
  assert.equal(change.changed.length, ghosts.length);

  const before = new Map(
    active.map.objects
      .filter((object) => object.type === "enemy_spawn")
      .map((object) => [object.id, object]),
  );
  for (const entry of change.platformerObjectSettings) {
    const original = before.get(entry.objectId);
    assert.ok(original);
    assert.equal(entry.assetId, "neutral_robot_01");
    assert.equal(entry.behavior, original.behavior ?? "patroller");
    assert.equal(entry.direction, original.direction ?? "right");
  }

  const played = level(applyCooperSpecChange(DEFAULT_GAME_DOCUMENT, change)).map;
  const looks = played.objects
    .filter((object) => object.type === "enemy_spawn")
    .map((object) => object.assetId)
    .sort();

  assert.deepEqual(looks, [
    "neutral_green_hills_boss_01",
    "neutral_robot_01",
    "neutral_robot_01",
    "neutral_robot_01",
    "neutral_robot_01",
    "neutral_zombie_01",
  ], "the ghosts became robots and the zombie and boss were left alone");
});

test("only the enemies in the named cells are repainted", () => {
  const active = level();
  const target = describeLevel(active).characters.inLevel
    .find((character) => character.role === "enemy");
  assert.ok(target);

  const change = planAppearanceChange(
    DEFAULT_GAME_DOCUMENT,
    active,
    "neutral_robot_01",
    "",
    [{ x: target.x, y: target.y }],
  );
  assert.equal(change.platformerObjectSettings.length, 1);
  assert.deepEqual(change.changed, [{ x: target.x, y: target.y, look: "neutral_robot_01" }]);
});

test("another world's look is allowed but a look nobody drew is refused", () => {
  const change = planAppearanceChange(
    DEFAULT_GAME_DOCUMENT,
    level(),
    "dragon_ghost_01",
    "",
    [],
  );
  assert.ok(change.changed.length > 0, "a Green Hills level should take a Dragon World look");
  for (const entry of change.platformerObjectSettings) {
    assert.equal(entry.assetId, "dragon_ghost_01");
  }

  rejects(
    () => planAppearanceChange(DEFAULT_GAME_DOCUMENT, level(), "not_a_sprite", "", []),
    /does not have a look called/,
  );
});

test("changing every enemy leaves the boss alone instead of refusing the call", () => {
  const active = level();
  const change = planAppearanceChange(DEFAULT_GAME_DOCUMENT, active, "neutral_robot_01", "", []);
  const bossId = active.map.objects.find((object) => object.role === "boss")?.id;

  assert.ok(bossId, "level-1 should ship with a boss");
  assert.equal(
    change.platformerObjectSettings.some((entry) => entry.objectId === bossId),
    false,
    "an enemy look must not be applied to the boss",
  );
  assert.equal(change.changed.length, 5, "all five plain enemies are repainted");
});

test("a boss look cannot be put on a plain enemy, and the reverse", () => {
  const active = level();
  const enemy = describeLevel(active).characters.inLevel
    .find((character) => character.role === "enemy");
  const boss = describeLevel(active).characters.inLevel
    .find((character) => character.role === "boss");
  assert.ok(enemy);
  assert.ok(boss);

  rejects(
    () => planAppearanceChange(
      DEFAULT_GAME_DOCUMENT,
      active,
      "neutral_green_hills_boss_01",
      "",
      [{ x: enemy.x, y: enemy.y }],
    ),
    /only fits a boss/,
  );
  rejects(
    () => planAppearanceChange(
      DEFAULT_GAME_DOCUMENT,
      active,
      "neutral_robot_01",
      "",
      [{ x: boss.x, y: boss.y }],
    ),
    /not a boss/,
  );
});

test("repainting a cell with no enemy in it is refused", () => {
  rejects(
    () => planAppearanceChange(DEFAULT_GAME_DOCUMENT, level(), "neutral_robot_01", "", [OPEN_SKY]),
    /no enemy or boss in that spot/,
  );
  rejects(
    () => planAppearanceChange(
      DEFAULT_GAME_DOCUMENT,
      level(),
      "neutral_robot_01",
      "neutral_human_01",
      [],
    ),
    /nothing in this level with that look/,
  );
});


test("every cell read_game_objects offers is one the add tool accepts", () => {
  const active = level();
  const { openCells } = describeLevel(active);

  assert.ok(openCells.onGround.length > 0);
  assert.ok(openCells.inAir.length > 0);

  // Placed one at a time, because the caps apply per call, not per cell.
  for (const cell of openCells.onGround) {
    planObjectAdditions(DEFAULT_GAME_DOCUMENT, active, [{ kind: "enemy", ...cell }]);
  }
  for (const cell of openCells.inAir) {
    planObjectAdditions(DEFAULT_GAME_DOCUMENT, active, [{ kind: "coin", ...cell }]);
  }
});

test("the offered cells are spread along the level, not bunched at the start", () => {
  const { openCells, level: bounds } = describeLevel(level());
  const columns = openCells.onGround.map((cell) => cell.x);

  assert.ok(
    Math.max(...columns) > bounds.columns / 2,
    "ground cells should reach past the middle of the level",
  );
});
