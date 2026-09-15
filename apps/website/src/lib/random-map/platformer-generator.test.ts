import assert from "node:assert/strict";
import test from "node:test";

import levelOne from "../../../../game/maps/level-1.json";
import levelTwo from "../../../../game/maps/level-2.json";
import levelThree from "../../../../game/maps/level-3.json";
import levelFour from "../../../../game/maps/level-4.json";
import levelFive from "../../../../game/maps/level-5.json";
import physics from "../../../../game/game-physics/platformer_small_01.json";
import type { PlatformerMapSpec } from "@/game/platformer/types";
import {
  CATALOG_PLATFORMER_GAME_PHYSICS,
  type PlatformerGamePhysicsDocument,
} from "@/lib/game-physics";
import { generatedPlatformerMapSchema } from "@/lib/generated-map-contract";

import {
  generatePlatformerMap,
  HIGH_CLIMB_TILES,
  HIGH_SECTION_COUNTS,
  oneWayPlatformsAreJumpable,
  PLATFORMER_FINAL_ARENA_COLUMNS,
  PLATFORMER_FLAT_START_COLUMNS,
  PLATFORMER_GENERATED_WIDTHS,
  PlatformerGenerationError,
  platformerLandings,
  validatePlatformerReachability,
  type PlatformerMapLength,
} from "./platformer-generator";

const donors = [
  levelOne,
  levelTwo,
  levelThree,
  levelFour,
  levelFive,
] as unknown as PlatformerMapSpec[];
const lengths = ["short", "medium", "long"] as const;
const effectivePhysics = physics as PlatformerGamePhysicsDocument;

function collisionAt(map: PlatformerMapSpec, x: number, y: number) {
  const terrain = map.layers.find((layer) => layer.id === "terrain");
  const symbol = terrain?.rows[y]?.[x] ?? ".";
  return map.legend[symbol]?.collision ?? "none";
}

function assertFlatFloor(
  map: PlatformerMapSpec,
  start: number,
  width: number,
) {
  const landing = platformerLandings(map).find((candidate) => (
    candidate.startColumn <= start
    && candidate.endColumn >= start + width - 1
  ));
  assert.ok(landing, `expected a flat floor from ${start} for ${width} columns`);
  for (let x = start; x < start + width; x += 1) {
    assert.notEqual(collisionAt(map, x, landing.surfaceRow), "hazard");
  }
}

function symbolFor(
  map: PlatformerMapSpec,
  visualSlot: "platform" | "obstacle" | "hazard",
  collision?: "solid" | "one_way" | "hazard",
) {
  return Object.entries(map.legend).find(([, value]) => (
    value.visualSlot === visualSlot
    && (collision === undefined || value.collision === collision)
  ))?.[0];
}

function hazardRuns(map: PlatformerMapSpec) {
  const hazard = symbolFor(map, "hazard", "hazard");
  const bottom = map.layers[0]?.rows[map.size.rows - 1] ?? "";
  const runs: number[] = [];
  let run = 0;
  for (const symbol of bottom) {
    if (symbol === hazard) run += 1;
    else {
      if (run > 0) runs.push(run);
      run = 0;
    }
  }
  if (run > 0) runs.push(run);
  return runs;
}

function highClimbRegions(map: PlatformerMapSpec) {
  const bottom = map.size.rows - 1;
  const threshold = bottom - HIGH_CLIMB_TILES;
  const arenaStart = map.size.columns - PLATFORMER_FINAL_ARENA_COLUMNS;
  const high: boolean[] = [];
  for (let column = PLATFORMER_FLAT_START_COLUMNS; column < arenaStart; column += 1) {
    let top: number | null = null;
    for (let row = 0; row < map.size.rows; row += 1) {
      const collision = collisionAt(map, column, row);
      if (collision === "solid" || collision === "one_way") {
        top = row;
        break;
      }
    }
    high.push(top !== null && top <= threshold);
  }
  let count = 0;
  for (let index = 0; index < high.length; index += 1) {
    if (high[index] && (index === 0 || !high[index - 1])) count += 1;
  }
  return count;
}

function countSymbolsAboveFloor(map: PlatformerMapSpec, symbol: string | undefined) {
  if (!symbol) return 0;
  const floor = map.size.rows - 1;
  let count = 0;
  for (let row = 0; row < floor; row += 1) {
    for (const cell of map.layers[0]?.rows[row] ?? "") {
      if (cell === symbol) count += 1;
    }
  }
  return count;
}

function assertObjectSupports(map: PlatformerMapSpec) {
  for (const object of map.objects) {
    assert.ok(object.x >= 0 && object.x < map.size.columns);
    assert.ok(object.y >= 0 && object.y < map.size.rows);
    if (object.type === "flying_object") continue;
    assert.equal(collisionAt(map, object.x, object.y), "none", object.id);
    assert.ok(
      ["solid", "one_way"].includes(collisionAt(map, object.x, object.y + 1)),
      `${object.id} is unsupported`,
    );
  }
}

test("all donors and lengths produce strict, reachable maps across varied seeds", () => {
  for (const donor of donors) {
    for (const length of lengths) {
      for (const seed of [0, 1, 2, 7, 19, 41, 99, 0xffff]) {
        const generated = generatePlatformerMap({ donor, length, seed });
        assert.equal(generatedPlatformerMapSchema.safeParse(generated).success, true);
        assert.equal(generated.size.columns, PLATFORMER_GENERATED_WIDTHS[length]);
        assert.equal(generated.size.rows, donor.size.rows);
        assert.equal(generated.tileSize, donor.tileSize);
        assert.deepEqual(generated.camera, donor.camera);
        assert.deepEqual(generated.physics, { ...donor.physics, gravityScale: 1 });
        assert.deepEqual(generated.rules, donor.rules);
        assert.deepEqual(generated.presentation, donor.presentation);
        assert.deepEqual(generated.legend, donor.legend);
        assert.equal(generated.layers.length, 1);
        assert.equal(generated.layers[0].rows.length, donor.size.rows);
        assert.ok(generated.layers[0].rows.every((row) => row.length === generated.size.columns));
        assert.ok(
          generated.layers[0].rows.every((row) => (
            [...row].every((symbol) => Object.hasOwn(generated.legend, symbol))
          )),
        );

        assertFlatFloor(generated, 0, PLATFORMER_FLAT_START_COLUMNS);
        assertFlatFloor(
          generated,
          generated.size.columns - PLATFORMER_FINAL_ARENA_COLUMNS,
          PLATFORMER_FINAL_ARENA_COLUMNS,
        );
        assert.equal(
          validatePlatformerReachability(generated, effectivePhysics).reachable,
          true,
        );
        assert.equal(
          validatePlatformerReachability(
            generated,
            CATALOG_PLATFORMER_GAME_PHYSICS,
          ).reachable,
          true,
        );
        assertObjectSupports(generated);
        assert.equal(oneWayPlatformsAreJumpable(generated), true);

        const platformSymbol = symbolFor(generated, "platform");
        const obstacleSymbol = symbolFor(generated, "obstacle", "solid");
        const crateSymbol = symbolFor(generated, "obstacle", "one_way");
        assert.ok(
          countSymbolsAboveFloor(generated, platformSymbol) >= 4,
          `${generated.id} is missing platform walkways`,
        );
        assert.ok(
          countSymbolsAboveFloor(generated, obstacleSymbol) >= 6,
          `${generated.id} is missing obstacle stairs`,
        );
        if (crateSymbol) {
          assert.equal(
            countSymbolsAboveFloor(generated, crateSymbol),
            0,
            `${generated.id} used one-way obstacle crates as walkways`,
          );
        }

        const wideHazards = hazardRuns(generated).filter((run) => run >= 2 && run <= 3);
        const minimumHazards = length === "long" ? 4 : length === "medium" ? 3 : 1;
        assert.ok(
          wideHazards.length >= minimumHazards,
          `${generated.id} has ${wideHazards.length} wide hazard runs, expected at least ${minimumHazards}`,
        );
        assert.equal(
          highClimbRegions(generated),
          HIGH_SECTION_COUNTS[length],
          `${generated.id} high climbs`,
        );

        const collectibles = generated.objects.filter((object) => object.type === "collectible");
        const enemies = generated.objects.filter((object) => (
          object.type === "enemy_spawn" && object.role !== "boss"
        ));
        const minimumCollectibles = length === "long" ? 18 : length === "medium" ? 12 : 6;
        const minimumEnemies = length === "long" ? 6 : length === "medium" ? 4 : 2;
        assert.ok(
          collectibles.length >= minimumCollectibles,
          `${generated.id} has ${collectibles.length} coins, expected at least ${minimumCollectibles}`,
        );
        assert.ok(
          enemies.length >= minimumEnemies,
          `${generated.id} has ${enemies.length} enemies, expected at least ${minimumEnemies}`,
        );

        const spawn = generated.objects.filter((object) => object.type === "player_spawn");
        assert.equal(spawn.length, 1);
        const boss = generated.objects.find((object) => object.role === "boss");
        const goal = generated.objects.find((object) => object.type === "goal");
        const donorBoss = donor.objects.find((object) => object.role === "boss");
        assert.equal(Boolean(boss) && Boolean(goal), false, `${generated.id} has both a boss and a goal`);
        assert.ok(boss || goal, `${generated.id} has neither a boss nor a goal`);
        assert.equal(Boolean(boss), Boolean(donorBoss));
        if (boss && donorBoss) {
          assert.equal(boss.assetId, donorBoss.assetId);
          assert.equal(boss.behavior, donorBoss.behavior);
          assert.equal(boss.hitsToDefeat, donorBoss.hitsToDefeat);
          const left = boss.behavior === "chaser"
            ? boss.viewLeftTiles ?? 0
            : boss.patrolLeftTiles ?? 0;
          const right = boss.behavior === "chaser"
            ? boss.viewRightTiles ?? 0
            : boss.patrolRightTiles ?? 0;
          const arenaStart = generated.size.columns - PLATFORMER_FINAL_ARENA_COLUMNS;
          assert.ok(boss.x - left - 1 >= arenaStart);
          assert.ok(boss.x + right + 1 < generated.size.columns);
        }
      }
    }
  }
});

test("generation is reproducible but seeds produce diverse terrain", () => {
  const donor = donors[0];
  const length: PlatformerMapLength = "long";
  const first = generatePlatformerMap({ donor, length, seed: "same-seed" });
  const repeated = generatePlatformerMap({ donor, length, seed: "same-seed" });
  assert.deepEqual(repeated, first);

  const layouts = new Set(
    Array.from({ length: 12 }, (_, seed) => (
      generatePlatformerMap({ donor, length, seed }).layers[0].rows.join("\n")
    )),
  );
  assert.ok(layouts.size >= 8, `expected diverse layouts, received ${layouts.size}`);
});

test("effective flight physics is validated without exceeding the protected route", () => {
  const flightPhysics: PlatformerGamePhysicsDocument = {
    ...effectivePhysics,
    verticalMovement: {
      ...effectivePhysics.verticalMovement,
      mode: "flight",
    },
  };
  const generated = generatePlatformerMap({
    donor: donors[2],
    length: "medium",
    seed: 808,
    physics: flightPhysics,
  });
  assert.equal(validatePlatformerReachability(generated, flightPhysics).reachable, true);
  assert.equal(
    validatePlatformerReachability(generated, CATALOG_PLATFORMER_GAME_PHYSICS).reachable,
    true,
  );
});

test("generation fails closed when its bounded attempt budget is exhausted", () => {
  assert.throws(
    () => generatePlatformerMap({
      donor: donors[0],
      length: "short",
      seed: 1,
      maxAttempts: 0,
    }),
    (error) => (
      error instanceof PlatformerGenerationError
      && /exhausted 0 attempts/.test(error.message)
    ),
  );
});
