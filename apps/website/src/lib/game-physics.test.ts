import assert from "node:assert/strict";
import test from "node:test";

import catalogJson from "../../../game/game-physics/platformer_small_01.json";
import {
  applyCooperPhysicsPatch,
  assertJumpEnvelope,
  CATALOG_PLATFORMER_GAME_PHYSICS,
  effectiveGamePhysics,
  effectivePlatformerGamePhysics,
  GamePhysicsPatchError,
  platformerJumpEnvelope,
  PLATFORMER_EDITABLE_PATHS,
  type GamePhysicsDocument,
} from "./game-physics";

const JUMP_HEIGHT = "/verticalMovement/groundedJump/jumpHeightTiles";
const RUN_SPEED = "/movement/maximumRunSpeedTilesPerSecond";

function patch(operations: unknown[], baseRevision = 1) {
  return { baseRevision, prompt: "Make me jump higher", operations };
}

function apply(operations: unknown[], baseRevision = 1): GamePhysicsDocument {
  return applyCooperPhysicsPatch(CATALOG_PLATFORMER_GAME_PHYSICS, patch(operations, baseRevision));
}

test("the checked-in catalog document parses and clears the level-design envelope", () => {
  assert.equal(CATALOG_PLATFORMER_GAME_PHYSICS.revision, 1);
  assert.equal(CATALOG_PLATFORMER_GAME_PHYSICS.provenance.lastEditedBy, "system_default");
  assert.deepEqual(CATALOG_PLATFORMER_GAME_PHYSICS.editPolicy.allowedPaths, PLATFORMER_EDITABLE_PATHS);
  assert.doesNotThrow(() => assertJumpEnvelope(CATALOG_PLATFORMER_GAME_PHYSICS));

  const envelope = platformerJumpEnvelope(CATALOG_PLATFORMER_GAME_PHYSICS);
  assert.equal(envelope.requiredApexHeightPx, 140);
  assert.equal(envelope.requiredRangePx, 224);
});

test("a first patch forks the catalog, increments the revision, and records the kid's prompt", () => {
  const updated = apply([{ op: "replace", path: JUMP_HEIGHT, value: 3.5 }]);

  assert.equal(updated.runtime, "platformer_v1");
  assert.equal(updated.revision, 2);
  assert.deepEqual(updated.provenance, { lastEditedBy: "cooper", lastPrompt: "Make me jump higher" });
  if (updated.runtime !== "platformer_v1") throw new Error("expected a platformer document");
  assert.equal(updated.verticalMovement.groundedJump.jumpHeightTiles, 3.5);
});

test("patching leaves the imported catalog object untouched", () => {
  const before = JSON.stringify(catalogJson);
  apply([{ op: "replace", path: JUMP_HEIGHT, value: 4 }]);

  assert.equal(JSON.stringify(catalogJson), before);
  assert.equal(CATALOG_PLATFORMER_GAME_PHYSICS.verticalMovement.groundedJump.jumpHeightTiles, 2.25625);
});

test("a stale baseRevision is rejected", () => {
  assert.throws(
    () => apply([{ op: "replace", path: JUMP_HEIGHT, value: 3 }], 2),
    (error: unknown) => error instanceof GamePhysicsPatchError && /changed since Cooper looked/.test(error.reason),
  );
});

test("a path outside editPolicy.allowedPaths is rejected", () => {
  assert.throws(
    () => apply([{ op: "replace", path: "/player/collider/widthPx", value: 8 }]),
    (error: unknown) => error instanceof GamePhysicsPatchError && /not allowed to change/.test(error.reason),
  );
});

test("non-replace operations and repeated paths are rejected", () => {
  assert.throws(
    () => apply([{ op: "remove", path: JUMP_HEIGHT, value: 3 }]),
    GamePhysicsPatchError,
  );
  assert.throws(
    () => apply([
      { op: "replace", path: JUMP_HEIGHT, value: 3 },
      { op: "replace", path: JUMP_HEIGHT, value: 4 },
    ]),
    (error: unknown) => error instanceof GamePhysicsPatchError && /same setting twice/.test(error.reason),
  );
});

test("an out-of-bounds value is rejected by the document schema", () => {
  assert.throws(
    () => apply([{ op: "replace", path: JUMP_HEIGHT, value: 40 }]),
    (error: unknown) => error instanceof GamePhysicsPatchError && /outside what this game allows/.test(error.reason),
  );
});

test("a jump that no longer clears the direct rise is rejected with a kid-safe reason", () => {
  assert.throws(
    () => apply([{ op: "replace", path: JUMP_HEIGHT, value: 1 }]),
    (error: unknown) => error instanceof GamePhysicsPatchError && /too low to reach the platforms/.test(error.reason),
  );
});

test("a run speed that no longer clears the gaps is rejected", () => {
  assert.throws(
    () => apply([{ op: "replace", path: RUN_SPEED, value: 3 }]),
    (error: unknown) => error instanceof GamePhysicsPatchError && /too short to clear the gaps/.test(error.reason),
  );
});

test("switching to flight mode is accepted and skips the grounded-jump envelope", () => {
  const updated = apply([
    { op: "replace", path: "/verticalMovement/mode", value: "flight" },
    { op: "replace", path: JUMP_HEIGHT, value: 0.5 },
  ]);

  if (updated.runtime !== "platformer_v1") throw new Error("expected a platformer document");
  assert.equal(updated.verticalMovement.mode, "flight");
  assert.equal(updated.verticalMovement.groundedJump.jumpHeightTiles, 0.5);
});

test("a second patch revises the fork rather than the catalog", () => {
  const first = apply([{ op: "replace", path: JUMP_HEIGHT, value: 3 }]);
  const second = applyCooperPhysicsPatch(first, patch([{ op: "replace", path: RUN_SPEED, value: 7 }], 2));

  assert.equal(second.revision, 3);
  if (second.runtime !== "platformer_v1") throw new Error("expected a platformer document");
  assert.equal(second.movement.maximumRunSpeedTilesPerSecond, 7);
  assert.equal(second.verticalMovement.groundedJump.jumpHeightTiles, 3);
});

test("resolution prefers a saved fork and falls back to the catalog", () => {
  const fork = apply([{ op: "replace", path: JUMP_HEIGHT, value: 3 }]);

  assert.equal(effectiveGamePhysics({}), CATALOG_PLATFORMER_GAME_PHYSICS);
  assert.equal(effectiveGamePhysics({ physicsDocument: fork }), fork);
  assert.equal(
    effectivePlatformerGamePhysics(undefined, CATALOG_PLATFORMER_GAME_PHYSICS),
    CATALOG_PLATFORMER_GAME_PHYSICS,
  );
  assert.equal(effectivePlatformerGamePhysics(fork, CATALOG_PLATFORMER_GAME_PHYSICS), fork);
});
