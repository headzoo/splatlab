import assert from "node:assert/strict";
import test from "node:test";

import level from "../../../game/maps/level-1.json";
import { DEFAULT_GAME_DOCUMENT, PLATFORMER_MAP_SOURCES } from "@/lib/game-contract";
import {
  applyCooperPhysicsPatch,
  CATALOG_PLATFORMER_GAME_PHYSICS,
  effectivePlatformerGamePhysics,
  PLATFORMER_TILE_SIZE_PX,
} from "@/lib/game-physics";
import { GAME_PLAYER_CONTENT } from "./game-player-content";
import { createInitialState, resolvePhysics, stepPlatformer } from "./platformer/engine";
import type { PlatformerMapSpec, PlatformerPhysicsSpec } from "./platformer/types";

const map = level as unknown as PlatformerMapSpec;
const jumpInput = { moveX: 0, moveY: 0, jumpPressed: true, jumpHeld: true, weaponPressed: false };
const holdInput = { ...jumpInput, jumpPressed: false };

const forkedPhysics = applyCooperPhysicsPatch(CATALOG_PLATFORMER_GAME_PHYSICS, {
  baseRevision: 1,
  prompt: "Make me jump higher",
  operations: [
    { op: "replace", path: "/verticalMovement/groundedJump/jumpHeightTiles", value: 4 },
  ],
});

/** Mirrors how GamePlayer resolves physics for the map it is about to render. */
function playerPhysics(spec: Parameters<typeof effectivePlatformerGamePhysics>[0]) {
  return effectivePlatformerGamePhysics(spec, GAME_PLAYER_CONTENT.physics) as PlatformerPhysicsSpec;
}

function peakRise(physics: PlatformerPhysicsSpec) {
  let state = createInitialState(map);
  const startY = state.y;
  let peak = 0;
  state = stepPlatformer(map, physics, state, jumpInput).state;
  for (let tick = 0; tick < 120; tick += 1) {
    state = stepPlatformer(map, physics, state, holdInput).state;
    peak = Math.max(peak, startY - state.y);
    if (state.grounded && tick > 2) break;
  }
  return peak;
}

test("level-1.json is a map the /build flow can select", () => {
  assert.ok(PLATFORMER_MAP_SOURCES.includes("level-1.json"));
  assert.equal(map.tileSize, PLATFORMER_TILE_SIZE_PX);
  assert.equal(DEFAULT_GAME_DOCUMENT.platformerMapSource, "level-1.json");
});

test("a game with no fork runs the catalog physics", () => {
  const resolved = playerPhysics(DEFAULT_GAME_DOCUMENT.physicsDocument);

  assert.equal(resolved, GAME_PLAYER_CONTENT.physics);
  assert.equal(
    resolved.verticalMovement.groundedJump.jumpHeightTiles,
    CATALOG_PLATFORMER_GAME_PHYSICS.verticalMovement.groundedJump.jumpHeightTiles,
  );
});

test("a Cooper physics fork raises the jump the site player actually simulates", () => {
  const catalogPhysics = playerPhysics(undefined);
  const forked = playerPhysics(forkedPhysics);

  assert.equal(forked.verticalMovement.groundedJump.jumpHeightTiles, 4);
  assert.equal(
    resolvePhysics(forked, map.tileSize).jumpVelocity
      < resolvePhysics(catalogPhysics, map.tileSize).jumpVelocity,
    true,
  );

  const catalogPeak = peakRise(catalogPhysics);
  const forkedPeak = peakRise(forked);

  assert.ok(catalogPeak > 0);
  assert.ok(forkedPeak > catalogPeak);
  // level-1 has headroom above the spawn, so the fork reaches close to 4 tiles.
  assert.ok(forkedPeak > 3.5 * map.tileSize, `expected a taller jump, got ${forkedPeak}px`);
});

test("a stored document for another runtime is ignored instead of driving the platformer", () => {
  const topDown = {
    schemaVersion: 1 as const,
    id: "maze_small_01",
    revision: 2,
    runtime: "top_down_v1" as const,
    baseProfileId: "top_down_standard_v1",
    movement: { maximumSpeedTilesPerSecond: 6 },
    editPolicy: {
      agentEditable: true as const,
      applyTiming: "next_simulation_reset" as const,
      allowedPaths: ["/movement/maximumSpeedTilesPerSecond"],
    },
    provenance: { lastEditedBy: "cooper" as const, lastPrompt: "Faster" },
  };

  assert.equal(playerPhysics(topDown), GAME_PLAYER_CONTENT.physics);
});
