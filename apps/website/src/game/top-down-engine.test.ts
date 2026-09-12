import assert from "node:assert/strict";
import test from "node:test";

import mazeGreenHills from "../../../game/maps/maze_green_hills_01.json";
import { resolveBodyMotionOffset } from "./motion";
import {
  createInitialMazeState,
  resolveMazeCamera,
  stepMaze,
} from "./top-down/engine";
import type { MazeMapSpec, MazeState } from "./top-down/types";

const map = mazeGreenHills as unknown as MazeMapSpec;

test("checked-in build maze declares a camera smaller than its world", () => {
  assert.equal(map.runtime, "top_down_v1");
  assert.deepEqual(map.camera, { columns: 9, rows: 7 });
  assert.ok(map.width > map.camera.columns);
  assert.ok(map.height > map.camera.rows);
});

test("maze camera follows the player and clamps to all four world edges", () => {
  const initial = createInitialMazeState(map);
  assert.deepEqual(resolveMazeCamera(map, initial), { x: 0, y: 0 });

  const middle = { ...initial, x: 7.5, y: 5.875 };
  assert.deepEqual(resolveMazeCamera(map, middle), { x: 192, y: 128 });

  const farEdge = { ...initial, x: 14.5, y: 10.875 };
  assert.deepEqual(resolveMazeCamera(map, farEdge), {
    x: (map.width - map.camera.columns) * map.tileSize,
    y: (map.height - map.camera.rows) * map.tileSize,
  });
});

test("maze movement remains blocked by semantic wall cells", () => {
  let state: MazeState = createInitialMazeState(map);
  for (let tick = 0; tick < 120; tick += 1) {
    state = stepMaze(map, state, { moveX: -1, moveY: 0 });
  }

  assert.ok(state.x >= 1.28);
  assert.equal(state.direction, "left");
  assert.equal(state.status, "playing");
});

test("the checked-in /build maze controls hero speed", () => {
  const spawn = map.objects.find((object) => object.type === "player_spawn" && object.slot === 1);
  assert.equal(spawn?.speed, 224);
  const slowerMap = structuredClone(map);
  const slowerSpawn = slowerMap.objects.find((object) => object.type === "player_spawn" && object.slot === 1);
  assert.ok(slowerSpawn);
  slowerSpawn.speed = 112;

  const normalInitial = createInitialMazeState(map);
  const slowerInitial = createInitialMazeState(slowerMap);
  const normal = stepMaze(map, normalInitial, { moveX: 1, moveY: 0 });
  const slower = stepMaze(slowerMap, slowerInitial, { moveX: 1, moveY: 0 });

  assert.ok(normal.x > slower.x);
  assert.ok(Math.abs((normal.x - normalInitial.x) - 2 * (slower.x - slowerInitial.x)) < 0.0001);
});

test("the checked-in /build maze enemy uses its authored speed", () => {
  const fasterMap = structuredClone(map);
  const fasterEnemy = fasterMap.objects.find((object) => object.type === "enemy_spawn");
  assert.ok(fasterEnemy);
  assert.equal(fasterEnemy.speed, 70);
  fasterEnemy.speed = 140;
  const initial = { ...createInitialMazeState(map), x: 5.5, y: 7.875 };
  const fasterInitial = { ...createInitialMazeState(fasterMap), x: 5.5, y: 7.875 };
  const normal = stepMaze(map, initial, { moveX: 0, moveY: 0 });
  const faster = stepMaze(fasterMap, fasterInitial, { moveX: 0, moveY: 0 });
  const normalEnemy = normal.enemies[0];
  const movedFasterEnemy = faster.enemies[0];
  assert.ok(normalEnemy && movedFasterEnemy);
  assert.ok(movedFasterEnemy.x < normalEnemy.x);
  assert.ok(Math.abs((7.5 - movedFasterEnemy.x) - 2 * (7.5 - normalEnemy.x)) < 0.0001);
});

test("the checked-in maze hero pecks as a cosmetic body offset", () => {
  const spawn = map.objects.find((object) => object.type === "player_spawn" && object.slot === 1);
  assert.equal(spawn?.motion?.visual.type, "peck");
  const visual = spawn?.motion?.visual;
  assert.ok(visual);
  const initial = createInitialMazeState(map);
  const initialSnapshot = structuredClone(initial);
  const offsets = Array.from({ length: 60 }, (_, tick) => (
    resolveBodyMotionOffset(visual, spawn.id, tick * (1000 / 60), map.tileSize, "right")
  ));
  const strongest = offsets.reduce((best, offset) => (
    Math.abs(offset.x) > Math.abs(best.x) ? offset : best
  ));
  assert.ok(strongest.x > 0);
  assert.deepEqual(initial, initialSnapshot);
});
