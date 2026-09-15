import assert from "node:assert/strict";
import test from "node:test";

import mazeGreenHills from "../../../game/maps/maze_green_hills_01.json";
import { resolveBodyMotionOffset } from "./motion";
import {
  createInitialMazeState,
  MAZE_DEATH_DURATION_TICKS,
  MAZE_FIXED_DELTA_SECONDS,
  MAZE_JUMP_DURATION_TICKS,
  resolveMazeCamera,
  stepMaze,
  stepMazeWithEvents,
} from "./top-down/engine";
import type { MazeInput, MazeMapSpec, MazeRuntimeEvent, MazeState } from "./top-down/types";

const map = mazeGreenHills as unknown as MazeMapSpec;
const idleInput: MazeInput = { moveX: 0, moveY: 0, jumpPressed: false };

function openLaneMap(objects: MazeMapSpec["objects"]): MazeMapSpec {
  return {
    ...structuredClone(map),
    objects,
  };
}

function finishJump(
  jumpMap: MazeMapSpec,
  initial: MazeState,
): { state: MazeState; events: MazeRuntimeEvent[] } {
  let result = stepMazeWithEvents(jumpMap, initial, { ...idleInput, jumpPressed: true });
  const events = [...result.events];
  for (let tick = 0; tick < MAZE_JUMP_DURATION_TICKS; tick += 1) {
    result = stepMazeWithEvents(jumpMap, result.state, idleInput);
    events.push(...result.events);
  }
  return { state: result.state, events };
}

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

test("maze enemy contact defeats the hero and returns them to the first spawn", () => {
  const initial = createInitialMazeState(map);
  const enemy = initial.enemies[0];
  assert.ok(enemy);
  let result = stepMazeWithEvents(
    map,
    { ...initial, x: enemy.x, y: enemy.y },
    idleInput,
  );

  assert.equal(result.state.status, "dying");
  assert.deepEqual(result.events, [{ type: "player_death" }]);

  const events = [...result.events];
  for (let tick = 0; tick < MAZE_DEATH_DURATION_TICKS; tick += 1) {
    result = stepMazeWithEvents(map, result.state, idleInput);
    events.push(...result.events);
  }
  const spawn = map.objects.find((object) => object.type === "player_spawn" && object.slot === 1);
  assert.ok(spawn);
  assert.equal(result.state.status, "playing");
  assert.equal(result.state.x, spawn.x + 0.5);
  assert.equal(result.state.y, spawn.y + 0.875);
  assert.ok(events.some((event) => event.type === "respawn"));
});

test("maze respawning puts every enemy back at its starting cell", () => {
  const enemyMap = openLaneMap([
    { id: "spawn", type: "player_spawn", x: 1, y: 1, slot: 1, speed: 224 },
    { id: "hazard", type: "hazard", x: 2, y: 1 },
    {
      id: "enemy_a",
      type: "enemy_spawn",
      x: 5,
      y: 1,
      direction: "left",
      behavior: "chaser",
      speed: 0,
      detectionRadius: 0,
    },
    {
      id: "enemy_b",
      type: "enemy_spawn",
      x: 6,
      y: 1,
      direction: "left",
      behavior: "chaser",
      speed: 0,
      detectionRadius: 0,
    },
  ]);
  const initial = createInitialMazeState(enemyMap);
  const [defeatedEnemy, wanderedEnemy] = initial.enemies;
  assert.ok(defeatedEnemy);
  assert.ok(wanderedEnemy);

  let result = stepMazeWithEvents(
    enemyMap,
    {
      ...initial,
      x: 2.5,
      y: 1.875,
      enemies: [
        { ...defeatedEnemy, defeated: true },
        { ...wanderedEnemy, x: wanderedEnemy.x + 1.5 },
      ],
    },
    idleInput,
  );
  assert.equal(result.state.status, "dying");

  for (let tick = 0; tick < MAZE_DEATH_DURATION_TICKS; tick += 1) {
    result = stepMazeWithEvents(enemyMap, result.state, idleInput);
  }

  assert.equal(result.state.status, "playing");
  assert.deepEqual(result.state.enemies, initial.enemies);
});

test("maze hazards defeat the hero when they are not jumping", () => {
  const hazardMap = openLaneMap([
    { id: "spawn", type: "player_spawn", x: 1, y: 1, slot: 1, speed: 224 },
    { id: "hazard", type: "hazard", x: 2, y: 1 },
  ]);
  const initial = { ...createInitialMazeState(hazardMap), x: 2.5, y: 1.875 };
  const result = stepMazeWithEvents(hazardMap, initial, idleInput);

  assert.equal(result.state.status, "dying");
  assert.deepEqual(result.events, [{ type: "player_death" }]);
});

test("an invulnerable Rupert ignores maze hazards", () => {
  const hazardMap = openLaneMap([
    { id: "spawn", type: "player_spawn", x: 1, y: 1, slot: 1, speed: 224 },
    { id: "hazard", type: "hazard", x: 2, y: 1 },
  ]);
  const initial = { ...createInitialMazeState(hazardMap), x: 2.5, y: 1.875 };
  const result = stepMazeWithEvents(
    hazardMap,
    initial,
    idleInput,
    MAZE_FIXED_DELTA_SECONDS,
    { playerInvulnerable: true },
  );

  assert.equal(result.state.status, "playing");
  assert.deepEqual(result.events, []);
});

test("maze jump crosses one hazard cell and lands on clear ground", () => {
  const hazardMap = openLaneMap([
    { id: "spawn", type: "player_spawn", x: 1, y: 1, slot: 1, speed: 224 },
    { id: "hazard", type: "hazard", x: 2, y: 1 },
  ]);
  const initial = { ...createInitialMazeState(hazardMap), direction: "right" as const };
  const result = finishJump(hazardMap, initial);

  assert.equal(result.state.status, "playing");
  assert.equal(result.state.x, 3.5);
  assert.equal(result.state.y, 1.875);
  assert.equal(result.state.jump, null);
  assert.ok(result.events.some((event) => event.type === "jump"));
  assert.ok(result.events.some((event) => event.type === "land"));
});

test("maze jump stays put when the cell beyond a hazard is blocked", () => {
  const blockedMap = openLaneMap([
    { id: "spawn", type: "player_spawn", x: 1, y: 1, slot: 1, speed: 224 },
    { id: "hazard", type: "hazard", x: 2, y: 1 },
    { id: "obstacle", type: "obstacle", x: 3, y: 1 },
  ]);
  const initial = { ...createInitialMazeState(blockedMap), direction: "right" as const };
  const result = finishJump(blockedMap, initial);

  assert.equal(result.state.status, "playing");
  assert.equal(result.state.x, 1.5);
  assert.equal(result.state.y, 1.875);
});

test("maze jump defeats an enemy in front of the hero", () => {
  const enemyMap = openLaneMap([
    { id: "spawn", type: "player_spawn", x: 1, y: 1, slot: 1, speed: 224 },
    {
      id: "enemy",
      type: "enemy_spawn",
      x: 2,
      y: 1,
      direction: "left",
      behavior: "chaser",
      speed: 0,
      detectionRadius: 240,
    },
  ]);
  const initial = { ...createInitialMazeState(enemyMap), direction: "right" as const };
  const result = finishJump(enemyMap, initial);

  assert.equal(result.state.status, "playing");
  assert.equal(result.state.x, 3.5);
  assert.equal(result.state.enemies[0]?.defeated, true);
  assert.ok(result.events.some((event) => event.type === "enemy_defeat"));
});
