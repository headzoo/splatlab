import type {
  MazeCamera,
  MazeDirection,
  MazeEnemyState,
  MazeInput,
  MazeMapObject,
  MazeMapSpec,
  MazeState,
} from "./types";

export const MAZE_FIXED_TICK_RATE = 60;
export const MAZE_FIXED_DELTA_SECONDS = 1 / MAZE_FIXED_TICK_RATE;
export const MAZE_MAX_CATCH_UP_STEPS = 5;
export const MAZE_MAX_FRAME_DELTA_SECONDS = 0.25;
export const MAZE_DEFAULT_PLAYER_SPEED_PX_PER_SECOND = 224;
export const MAZE_DEFAULT_ENEMY_SPEED_PX_PER_SECOND = 70;

const PLAYER_RADIUS_TILES = 0.28;
const ENEMY_RADIUS_TILES = 0.27;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function firstSpawn(map: MazeMapSpec): MazeMapObject {
  return map.objects.find((object) => object.type === "player_spawn" && object.slot === 1)
    ?? map.objects.find((object) => object.type === "player_spawn")
    ?? {
      id: "spawn_1",
      type: "player_spawn",
      x: 1,
      y: 1,
      speed: MAZE_DEFAULT_PLAYER_SPEED_PX_PER_SECOND,
    };
}

function createEnemyState(object: MazeMapSpec["objects"][number]): MazeEnemyState {
  return {
    id: object.id,
    x: object.x + 0.5,
    y: object.y + 0.875,
    originX: object.x + 0.5,
    originY: object.y + 0.875,
    direction: object.direction ?? "down",
    wanderDirection: object.direction ?? "down",
    moving: false,
  };
}

export function createInitialMazeState(map: MazeMapSpec): MazeState {
  const spawn = firstSpawn(map);
  return {
    tick: 0,
    x: spawn.x + 0.5,
    y: spawn.y + 0.875,
    direction: "down",
    moving: false,
    enemies: map.objects
      .filter((object) => object.type === "enemy_spawn")
      .map(createEnemyState),
    collectedKeyId: null,
    status: "playing",
  };
}

function exitIsLocked(map: MazeMapSpec, state: MazeState, x: number, y: number) {
  const exit = map.objects.find((object) => (
    object.type === "exit" && object.x === x && object.y === y
  ));
  return Boolean(exit && exit.requires !== state.collectedKeyId);
}

function solidCell(map: MazeMapSpec, state: MazeState, x: number, y: number) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return true;
  if (map.tiles[y]?.[x] === "#") return true;
  if (map.objects.some((object) => object.type === "obstacle" && object.x === x && object.y === y)) {
    return true;
  }
  return exitIsLocked(map, state, x, y);
}

function canOccupy(
  map: MazeMapSpec,
  state: MazeState,
  x: number,
  y: number,
  radius = PLAYER_RADIUS_TILES,
) {
  const centerY = y - 0.375;
  const left = Math.floor(x - radius);
  const right = Math.floor(x + radius);
  const top = Math.floor(centerY - radius);
  const bottom = Math.floor(centerY + radius);
  for (let cellY = top; cellY <= bottom; cellY += 1) {
    for (let cellX = left; cellX <= right; cellX += 1) {
      if (solidCell(map, state, cellX, cellY)) return false;
    }
  }
  return true;
}

function moveAxis<T extends { x: number; y: number }>(
  map: MazeMapSpec,
  state: MazeState,
  entity: T,
  axis: "x" | "y",
  amount: number,
  radius = PLAYER_RADIUS_TILES,
) {
  if (amount === 0) return entity;
  const next = { ...entity, [axis]: entity[axis] + amount };
  return canOccupy(map, state, next.x, next.y, radius) ? next : entity;
}

function directionFromInput(moveX: number, moveY: number, fallback: MazeDirection) {
  if (Math.abs(moveX) > Math.abs(moveY)) return moveX < 0 ? "left" : "right";
  if (moveY !== 0) return moveY < 0 ? "up" : "down";
  return fallback;
}

function directionVector(direction: MazeDirection) {
  switch (direction) {
    case "left": return { x: -1, y: 0 };
    case "right": return { x: 1, y: 0 };
    case "up": return { x: 0, y: -1 };
    default: return { x: 0, y: 1 };
  }
}

function directionFromVector(x: number, y: number, fallback: MazeDirection) {
  if (Math.abs(x) >= Math.abs(y) && x !== 0) return x < 0 ? "left" : "right";
  if (y !== 0) return y < 0 ? "up" : "down";
  return fallback;
}

function nextWanderDirection(direction: MazeDirection) {
  const directions: MazeDirection[] = ["down", "left", "right", "up"];
  return directions[(directions.indexOf(direction) + 1) % directions.length];
}

function stepEnemy(
  map: MazeMapSpec,
  state: MazeState,
  originalEnemy: MazeEnemyState,
  deltaSeconds: number,
): MazeEnemyState {
  const object = map.objects.find((candidate) => candidate.id === originalEnemy.id);
  if (!object || object.type !== "enemy_spawn") return originalEnemy;
  let enemy = originalEnemy;
  let moveX = 0;
  let moveY = 0;
  if ((object.behavior ?? "chaser") === "chaser") {
    const differenceX = state.x - enemy.x;
    const differenceY = state.y - enemy.y;
    const distance = Math.hypot(differenceX, differenceY);
    const detectionTiles = (object.detectionRadius ?? 240) / map.tileSize;
    if (distance > 0.001 && distance <= detectionTiles) {
      moveX = differenceX / distance;
      moveY = differenceY / distance;
    }
  } else {
    let vector = directionVector(enemy.wanderDirection);
    moveX = vector.x;
    moveY = vector.y;
    const distanceFromOrigin = Math.hypot(enemy.x - enemy.originX, enemy.y - enemy.originY);
    if (distanceFromOrigin >= (object.wanderRadiusTiles ?? 3)) {
      const wanderDirection = nextWanderDirection(enemy.wanderDirection);
      enemy = { ...enemy, wanderDirection };
      vector = directionVector(wanderDirection);
      moveX = vector.x;
      moveY = vector.y;
    }
  }
  const distance = ((object.speed ?? MAZE_DEFAULT_ENEMY_SPEED_PX_PER_SECOND) / map.tileSize)
    * deltaSeconds;
  const movedX = moveAxis(map, state, enemy, "x", moveX * distance, ENEMY_RADIUS_TILES);
  const moved = moveAxis(map, state, movedX, "y", moveY * distance, ENEMY_RADIUS_TILES);
  const didMove = moved.x !== enemy.x || moved.y !== enemy.y;
  return {
    ...moved,
    wanderDirection: !didMove && (object.behavior ?? "chaser") === "wanderer"
      ? nextWanderDirection(moved.wanderDirection)
      : moved.wanderDirection,
    direction: directionFromVector(moveX, moveY, enemy.direction),
    moving: didMove,
  };
}

export function stepMaze(
  map: MazeMapSpec,
  state: MazeState,
  input: MazeInput,
  deltaSeconds = MAZE_FIXED_DELTA_SECONDS,
): MazeState {
  if (state.status === "won") return state;
  const inputLength = Math.hypot(input.moveX, input.moveY);
  const normalizedX = inputLength > 1 ? input.moveX / inputLength : input.moveX;
  const normalizedY = inputLength > 1 ? input.moveY / inputLength : input.moveY;
  const spawn = firstSpawn(map);
  const distance = ((spawn.speed ?? MAZE_DEFAULT_PLAYER_SPEED_PX_PER_SECOND) / map.tileSize)
    * deltaSeconds;
  let next: MazeState = {
    ...state,
    tick: state.tick + 1,
    direction: directionFromInput(normalizedX, normalizedY, state.direction),
    moving: Boolean(normalizedX || normalizedY),
  };
  next = moveAxis(map, next, next, "x", normalizedX * distance);
  next = moveAxis(map, next, next, "y", normalizedY * distance);
  next = {
    ...next,
    enemies: next.enemies.map((enemy) => stepEnemy(map, next, enemy, deltaSeconds)),
  };

  const cellX = Math.floor(next.x);
  const cellY = Math.floor(next.y);
  const key = map.objects.find((object) => (
    object.type === "key" && object.x === cellX && object.y === cellY
  ));
  if (key) next = { ...next, collectedKeyId: key.id };
  const exit = map.objects.find((object) => (
    object.type === "exit" && object.x === cellX && object.y === cellY
  ));
  if (exit && exit.requires === next.collectedKeyId) {
    next = { ...next, moving: false, status: "won" };
  }
  return next;
}

export function resolveMazeCamera(map: MazeMapSpec, state: Pick<MazeState, "x" | "y">): MazeCamera {
  const viewportWidth = map.camera.columns * map.tileSize;
  const viewportHeight = map.camera.rows * map.tileSize;
  const worldWidth = map.width * map.tileSize;
  const worldHeight = map.height * map.tileSize;
  return {
    x: clamp(
      state.x * map.tileSize - viewportWidth / 2,
      0,
      Math.max(0, worldWidth - viewportWidth),
    ),
    y: clamp(
      (state.y - 0.375) * map.tileSize - viewportHeight / 2,
      0,
      Math.max(0, worldHeight - viewportHeight),
    ),
  };
}
