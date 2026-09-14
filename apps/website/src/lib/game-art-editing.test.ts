import assert from "node:assert/strict";
import test from "node:test";

import physics from "../../../game/game-physics/platformer_small_01.json";
import { createInitialState, stepPlatformer } from "../game/platformer/engine";
import { resolveMapVisuals } from "../game/platformer/art-catalog";
import type { PlatformerPhysicsSpec } from "../game/platformer/types";
import { applyCooperSpecChange } from "./cooper-spec-change";
import { DEFAULT_GAME_DOCUMENT, type GameDocument } from "./game-contract";
import {
  describeLevelArt,
  planLevelArt,
  LEVEL_ART_PARTS,
} from "./game-art-editing";
import {
  GameObjectEditError,
  planAppearanceChange,
  resolveActivePlatformerLevel,
  type ActivePlatformerLevel,
} from "./game-objects";
import { planAddLevel, planRemoveLevel, planSetActiveLevel } from "./game-levels-editing";

const physicsSpec = physics as unknown as PlatformerPhysicsSpec;
const idleInput = {
  moveX: 0,
  moveY: 0,
  jumpPressed: false,
  jumpHeld: false,
  weaponPressed: false,
};

function level(spec: GameDocument = DEFAULT_GAME_DOCUMENT): ActivePlatformerLevel {
  const resolved = resolveActivePlatformerLevel(spec);
  assert.ok(resolved, "the default game should resolve a platformer level");
  return resolved;
}

/** Runs the planner against whatever level the game is currently showing. */
function borrow(spec: GameDocument, part: string, world: string): GameDocument {
  return applyCooperSpecChange(spec, planLevelArt(spec, level(spec), part, world));
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

test("the parts a kid can name are the words a kid would use", () => {
  assert.deepEqual(LEVEL_ART_PARTS, [
    "ground",
    "platforms",
    "blocks",
    "spikes",
    "coins",
    "checkpoints",
    "goal",
    "springs",
    "flying things",
    "enemies",
    "bosses",
  ]);
});

test("a world that does not have its own version of a part is refused by name", () => {
  rejects(
    () => planLevelArt(DEFAULT_GAME_DOCUMENT, level(), "coins", "Green Hills"),
    /Green Hills does not have its own coins.*Space, Dragon World or Ice World/,
  );
  rejects(
    () => planLevelArt(DEFAULT_GAME_DOCUMENT, level(), "springs", "Space"),
    /Space does not have its own springs.*Graveyard or Ice World/,
  );
  rejects(
    () => planLevelArt(DEFAULT_GAME_DOCUMENT, level(), "wallpaper", "Space"),
    /cannot change the art for "wallpaper"/,
  );
  rejects(
    () => planLevelArt(DEFAULT_GAME_DOCUMENT, level(), "coins", "Atlantis"),
    /does not know a world called "Atlantis"/,
  );
});

test("borrowing a part twice replaces the borrow rather than stacking rows", () => {
  const once = borrow(DEFAULT_GAME_DOCUMENT, "platforms", "Dragon World");
  const twice = borrow(once, "platforms", "Ice World");

  assert.deepEqual(twice.platformerLevelArt, [
    { mapSource: "level-1.json", slot: "platform", world: "ice_world_01" },
  ]);
});

test("asking for a level's own world again takes the borrow back out of the game", () => {
  const borrowed = borrow(DEFAULT_GAME_DOCUMENT, "platforms", "Dragon World");
  const returned = borrow(borrowed, "platforms", "Green Hills");

  assert.deepEqual(returned.platformerLevelArt, []);
});

test("a borrowed level reports what it is wearing and where else each part lives", () => {
  const borrowed = borrow(DEFAULT_GAME_DOCUMENT, "platforms", "Dragon World");
  const art = describeLevelArt(level(borrowed));

  assert.equal(art.world, "Green Hills");
  assert.deepEqual(
    art.parts.find((part) => part.part === "platforms"),
    {
      part: "platforms",
      wearing: "Dragon World",
      borrowed: true,
      canBorrowFrom: ["Green Hills", "Graveyard", "Space", "Dragon World", "Ice World"],
    },
  );
  assert.deepEqual(
    art.parts.find((part) => part.part === "coins"),
    {
      part: "coins",
      wearing: "Green Hills",
      borrowed: false,
      canBorrowFrom: ["Space", "Dragon World", "Ice World"],
    },
  );
});

test("a level wearing borrowed platforms still plays, on the real checked-in map", () => {
  const spec = borrow(DEFAULT_GAME_DOCUMENT, "platforms", "Dragon World");
  const borrowed = level(spec);

  assert.equal(borrowed.mapSource, "level-1.json");
  assert.equal(resolveMapVisuals(borrowed.map.presentation).platform, "dragonsPlatform");
  assert.equal(
    resolveMapVisuals(borrowed.map.presentation).ground,
    resolveMapVisuals(level().map.presentation).ground,
    "borrowing platforms leaves the ground alone",
  );

  let state = createInitialState(borrowed.map);
  for (let tick = 0; tick < 120; tick += 1) {
    state = stepPlatformer(borrowed.map, physicsSpec, state, idleInput).state;
  }
  assert.equal(state.status, "playing");
  assert.equal(state.lives, createInitialState(level().map).lives);
});

test("an enemy dressed by hand keeps its look through a level-wide enemy borrow", () => {
  const active = level();
  const target = active.map.objects.find(
    (object) => object.type === "enemy_spawn" && object.role !== "boss",
  );
  assert.ok(target, "level-1 should ship with an enemy");

  const dressed = applyCooperSpecChange(
    DEFAULT_GAME_DOCUMENT,
    planAppearanceChange(DEFAULT_GAME_DOCUMENT, active, "neutral_robot_01", "", [
      { x: Math.floor(target.x), y: Math.floor(target.y) },
    ]),
  );
  const borrowed = level(borrow(dressed, "enemies", "Dragon World"));

  assert.equal(
    borrowed.map.objects.find((object) => object.id === target.id)?.assetId,
    "neutral_robot_01",
    "the kid's own choice outranks the level's borrow",
  );
  const others = borrowed.map.objects.filter(
    (object) => object.type === "enemy_spawn" && object.role !== "boss" && object.id !== target.id,
  );
  assert.ok(others.length > 0, "level-1 should ship with more than one enemy");
  for (const object of others) {
    assert.equal(object.assetId, "dragon_ghost_01", object.id);
  }
});

test("deleting a level takes its borrowed art with it", () => {
  const withLevel = applyCooperSpecChange(
    DEFAULT_GAME_DOCUMENT,
    planAddLevel(DEFAULT_GAME_DOCUMENT, "Ice World", "Frozen Lake"),
  );
  const borrowed = borrow(withLevel, "platforms", "Dragon World");
  const addedSource = borrowed.platformerLevelArt[0]?.mapSource;
  assert.ok(addedSource?.startsWith("custom-platformer-"), "the new level is the one showing");

  const removed = applyCooperSpecChange(
    borrowed,
    planRemoveLevel(borrowed, borrowed.platformerLevels.length),
  );
  assert.deepEqual(removed.platformerLevelArt, []);
});

test("each level keeps its own borrows when the kid switches between them", () => {
  const withLevel = applyCooperSpecChange(
    DEFAULT_GAME_DOCUMENT,
    planAddLevel(DEFAULT_GAME_DOCUMENT, "Ice World", "Frozen Lake"),
  );
  const iceBorrowed = borrow(withLevel, "platforms", "Dragon World");
  const showingFirst = applyCooperSpecChange(iceBorrowed, planSetActiveLevel(iceBorrowed, 1));

  assert.equal(level(showingFirst).map.presentation.artBorrows, undefined);
  assert.equal(
    level(iceBorrowed).map.presentation.artBorrows?.platform,
    "dragons_emberkeep_01",
  );
});
