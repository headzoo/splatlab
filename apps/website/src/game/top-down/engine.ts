import type {
  MazeCamera,
  MazeDirection,
  MazeEnemyState,
  MazeInput,
  MazeMapObject,
  MazeMapSpec,
  MazeRuntimeEvent,
  MazeState,
} from "./types";

export const MAZE_FIXED_TICK_RATE = 60;
export const MAZE_FIXED_DELTA_SECONDS = 1 / MAZE_FIXED_TICK_RATE;
export const MAZE_MAX_CATCH_UP_STEPS = 5;
export const MAZE_MAX_FRAME_DELTA_SECONDS = 0.25;
export const MAZE_DEFAULT_PLAYER_SPEED_PX_PER_SECOND = 224;
export const MAZE_DEFAULT_ENEMY_SPEED_PX_PER_SECOND = 70;
export const MAZE_JUMP_DURATION_TICKS = Math.round(0.42 * MAZE_FIXED_TICK_RATE);
export const MAZE_DEATH_DURATION_TICKS = Math.ceil(0.68 * MAZE_FIXED_TICK_RATE);
export const MAZE_RESPAWN_GRACE_TICKS = Math.ceil(0.85 * MAZE_FIXED_TICK_RATE);

const PLAYER_RADIUS_TILES = 0.28;
const ENEMY_RADIUS_TILES = 0.27;
const ENEMY_CONTACT_DISTANCE_TILES = 0.52;
const STOMP_RADIUS_TILES = 0.86;
const STOMP_FORWARD_REACH_TILES = 1.5;
const STOMP_LATERAL_GRACE_TILES = 0.72;
const STOMP_LANDING_GRACE_TICKS = Math.ceil(0.26 * MAZE_FIXED_TICK_RATE);

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
    defeated: false,
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
    jump: null,
    stompGraceTicksRemaining: 0,
    deathTicksRemaining: 0,
    respawnGraceTicksRemaining: 0,
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
  if (originalEnemy.defeated) return originalEnemy;
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

function hazardAt(map: MazeMapSpec, x: number, y: number) {
  return map.objects.some((object) => (
    object.type === "hazard" && object.x === x && object.y === y
  ));
}

function enemyAt(
  state: MazeState,
  x: number,
  y: number,
  excludedEnemyId: string | null = null,
) {
  return state.enemies.some((enemy) => (
    enemy.id !== excludedEnemyId
    && !enemy.defeated
    && Math.floor(enemy.x) === x
    && Math.floor(enemy.y) === y
  ));
}

function beginJump(map: MazeMapSpec, state: MazeState): MazeState {
  const vector = directionVector(state.direction);
  const startCell = { x: Math.floor(state.x), y: Math.floor(state.y) };
  const crossedCell = {
    x: startCell.x + vector.x,
    y: startCell.y + vector.y,
  };
  const targetEnemy = state.enemies
    .filter((enemy) => !enemy.defeated)
    .map((enemy) => {
      const differenceX = enemy.x - state.x;
      const differenceY = enemy.y - state.y;
      return {
        enemy,
        forwardDistance: differenceX * vector.x + differenceY * vector.y,
        lateralDistance: Math.abs(differenceX * vector.y - differenceY * vector.x),
      };
    })
    .filter((candidate) => (
      candidate.forwardDistance > 0.1
      && candidate.forwardDistance <= STOMP_FORWARD_REACH_TILES
      && candidate.lateralDistance <= STOMP_LATERAL_GRACE_TILES
    ))
    .sort((left, right) => (
      left.forwardDistance - right.forwardDistance
      || left.lateralDistance - right.lateralDistance
    ))[0]?.enemy ?? null;
  const canCross = hazardAt(map, crossedCell.x, crossedCell.y) || Boolean(targetEnemy);
  const landingCell = canCross
    ? { x: startCell.x + vector.x * 2, y: startCell.y + vector.y * 2 }
    : crossedCell;
  const landingX = landingCell.x + 0.5;
  const landingY = landingCell.y + 0.875;
  const blocked = hazardAt(map, landingCell.x, landingCell.y)
    || enemyAt(state, landingCell.x, landingCell.y, targetEnemy?.id ?? null)
    || !canOccupy(map, state, landingX, landingY);

  return {
    ...state,
    moving: true,
    jump: {
      startX: state.x,
      startY: state.y,
      endX: blocked ? state.x : landingX,
      endY: blocked ? state.y : landingY,
      ticksElapsed: 0,
      totalTicks: MAZE_JUMP_DURATION_TICKS,
      targetEnemyId: blocked ? null : targetEnemy?.id ?? null,
    },
  };
}

function defeatEnemiesNearPlayer(
  state: MazeState,
  events: MazeRuntimeEvent[],
): MazeState {
  let defeatedAny = false;
  const enemies = state.enemies.map((enemy) => {
    if (enemy.defeated || Math.hypot(state.x - enemy.x, state.y - enemy.y) > STOMP_RADIUS_TILES) {
      return enemy;
    }
    defeatedAny = true;
    return { ...enemy, moving: false, defeated: true };
  });
  if (defeatedAny) events.push({ type: "enemy_defeat" });
  return defeatedAny ? { ...state, enemies } : state;
}

function defeatEnemyById(
  state: MazeState,
  enemyId: string,
  events: MazeRuntimeEvent[],
): MazeState {
  const enemy = state.enemies.find((candidate) => candidate.id === enemyId);
  if (!enemy || enemy.defeated) return state;
  events.push({ type: "enemy_defeat" });
  return {
    ...state,
    enemies: state.enemies.map((candidate) => candidate.id === enemyId
      ? { ...candidate, moving: false, defeated: true }
      : candidate),
  };
}

function stepJump(state: MazeState, events: MazeRuntimeEvent[]): MazeState {
  const jump = state.jump;
  if (!jump) return state;
  const ticksElapsed = Math.min(jump.totalTicks, jump.ticksElapsed + 1);
  const progress = ticksElapsed / jump.totalTicks;
  let next: MazeState = {
    ...state,
    x: jump.startX + (jump.endX - jump.startX) * progress,
    y: jump.startY + (jump.endY - jump.startY) * progress,
    jump: { ...jump, ticksElapsed },
  };
  next = defeatEnemiesNearPlayer(next, events);
  if (jump.targetEnemyId && progress >= 0.3) {
    next = defeatEnemyById(next, jump.targetEnemyId, events);
    if (next.jump) next = { ...next, jump: { ...next.jump, targetEnemyId: null } };
  }
  if (ticksElapsed < jump.totalTicks) return next;
  events.push({ type: "land" });
  return {
    ...next,
    x: jump.endX,
    y: jump.endY,
    moving: false,
    jump: null,
    stompGraceTicksRemaining: STOMP_LANDING_GRACE_TICKS,
  };
}

function startPlayerDeath(state: MazeState, events: MazeRuntimeEvent[]): MazeState {
  if (state.respawnGraceTicksRemaining > 0 || state.status === "dying") return state;
  events.push({ type: "player_death" });
  return {
    ...state,
    moving: false,
    jump: null,
    deathTicksRemaining: MAZE_DEATH_DURATION_TICKS,
    status: "dying",
  };
}

function respawnPlayer(map: MazeMapSpec, state: MazeState): MazeState {
  const spawn = firstSpawn(map);
  return {
    ...state,
    x: spawn.x + 0.5,
    y: spawn.y + 0.875,
    direction: "down",
    moving: false,
    jump: null,
    stompGraceTicksRemaining: 0,
    deathTicksRemaining: 0,
    respawnGraceTicksRemaining: MAZE_RESPAWN_GRACE_TICKS,
    enemies: map.objects
      .filter((object) => object.type === "enemy_spawn")
      .map(createEnemyState),
    collectedKeyId: null,
    status: "playing",
  };
}

function stepTriggers(
  map: MazeMapSpec,
  state: MazeState,
  events: MazeRuntimeEvent[],
): MazeState {
  if (state.jump || state.status !== "playing") return state;
  const cellX = Math.floor(state.x);
  const cellY = Math.floor(state.y);
  let next = state;
  if (!next.collectedKeyId) {
    const key = map.objects.find((object) => (
      object.type === "key" && object.x === cellX && object.y === cellY
    ));
    if (key) {
      next = { ...next, collectedKeyId: key.id };
      events.push({ type: "collectible" });
    }
  }
  if (hazardAt(map, cellX, cellY)) return startPlayerDeath(next, events);

  for (const enemy of next.enemies) {
    if (enemy.defeated) continue;
    const distance = Math.hypot(next.x - enemy.x, next.y - enemy.y);
    if (next.stompGraceTicksRemaining > 0 && distance <= STOMP_RADIUS_TILES) {
      next = defeatEnemiesNearPlayer(next, events);
      continue;
    }
    if (distance < ENEMY_CONTACT_DISTANCE_TILES) return startPlayerDeath(next, events);
  }

  const exit = map.objects.find((object) => (
    object.type === "exit" && object.x === cellX && object.y === cellY
  ));
  if (exit && exit.requires === next.collectedKeyId) {
    events.push({ type: "goal" });
    return { ...next, moving: false, status: "won" };
  }
  return next;
}

export type MazeStepResult = {
  state: MazeState;
  events: MazeRuntimeEvent[];
};

export function stepMazeWithEvents(
  map: MazeMapSpec,
  state: MazeState,
  input: MazeInput,
  deltaSeconds = MAZE_FIXED_DELTA_SECONDS,
): MazeStepResult {
  const events: MazeRuntimeEvent[] = [];
  if (state.status === "won") return { state, events };
  if (state.status === "dying") {
    const deathTicksRemaining = Math.max(0, state.deathTicksRemaining - 1);
    const next = { ...state, tick: state.tick + 1, deathTicksRemaining };
    if (deathTicksRemaining > 0) return { state: next, events };
    events.push({ type: "respawn" });
    return { state: respawnPlayer(map, next), events };
  }
  const inputLength = Math.hypot(input.moveX, input.moveY);
  const normalizedX = inputLength > 1 ? input.moveX / inputLength : input.moveX;
  const normalizedY = inputLength > 1 ? input.moveY / inputLength : input.moveY;
  const spawn = firstSpawn(map);
  const distance = ((spawn.speed ?? MAZE_DEFAULT_PLAYER_SPEED_PX_PER_SECOND) / map.tileSize)
    * deltaSeconds;
  const directionLocked = Boolean(state.jump || input.jumpPressed);
  let next: MazeState = {
    ...state,
    tick: state.tick + 1,
    stompGraceTicksRemaining: Math.max(0, state.stompGraceTicksRemaining - 1),
    respawnGraceTicksRemaining: Math.max(0, state.respawnGraceTicksRemaining - 1),
    direction: directionLocked
      ? state.direction
      : directionFromInput(normalizedX, normalizedY, state.direction),
    moving: directionLocked || Boolean(normalizedX || normalizedY),
  };
  if (next.jump) {
    next = stepJump(next, events);
  } else if (input.jumpPressed) {
    next = beginJump(map, next);
    events.push({ type: "jump" });
  } else {
    next = moveAxis(map, next, next, "x", normalizedX * distance);
    next = moveAxis(map, next, next, "y", normalizedY * distance);
  }
  next = {
    ...next,
    enemies: next.enemies.map((enemy) => stepEnemy(map, next, enemy, deltaSeconds)),
  };
  next = stepTriggers(map, next, events);
  return { state: next, events };
}

export function stepMaze(
  map: MazeMapSpec,
  state: MazeState,
  input: MazeInput,
  deltaSeconds = MAZE_FIXED_DELTA_SECONDS,
): MazeState {
  return stepMazeWithEvents(map, state, input, deltaSeconds).state;
}

export function resolveMazeJumpVisualOffset(state: MazeState) {
  if (!state.jump) return 0;
  const progress = state.jump.ticksElapsed / state.jump.totalTicks;
  return -4 * progress * (1 - progress) * 0.72;
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
