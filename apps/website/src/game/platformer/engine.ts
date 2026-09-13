import type {
  EnemyLaserBeamState,
  EnemyProjectileState,
  EnemyState,
  FlyingObjectState,
  MotionSpec,
  PlatformerInput,
  PlatformerMapObject,
  PlatformerMapSpec,
  PlatformerPhysicsSpec,
  PlatformerState,
  RuntimeEvent,
  StepResult,
  WeaponSpec,
} from "./types";
import { resolveBodyMotionOffset } from "../motion";

export const FIXED_TICK_RATE = 60;
export const FIXED_DELTA_SECONDS = 1 / FIXED_TICK_RATE;
export const MAX_CATCH_UP_STEPS = 5;
export const MAX_FRAME_DELTA_SECONDS = 0.25;
export const BOSS_HIT_REACTION_TICKS = FIXED_TICK_RATE / 2;
export const DEFAULT_DEATH_RESPAWN_DELAY_SECONDS = 2;
export const MINIMUM_DEATH_RESPAWN_DELAY_SECONDS = 0.5;
export const MAXIMUM_DEATH_RESPAWN_DELAY_SECONDS = 10;
export const DEFAULT_GROUND_TRACTION_SCALE = 1;
export const MINIMUM_GROUND_TRACTION_SCALE = 0.05;
export const MAXIMUM_GROUND_TRACTION_SCALE = 2;
export const RAMMING_SPEED_TILES_PER_SECOND = 8;
export const ENEMY_PROJECTILE_SPEED_TILES_PER_SECOND = 4;

const PLAYER_HALF_WIDTH = 16;
const PLAYER_HEIGHT = 48;
const ENEMY_HALF_WIDTH = 16;
const ENEMY_HEIGHT = 48;
const BOSS_HALF_WIDTH = 48;
const BOSS_HEIGHT = 112;
const ENEMY_PROJECTILE_RADIUS = 10;
const DRAGON_MOUTH_FORWARD_OFFSET = 20;
const DRAGON_MOUTH_UP_OFFSET = 28;
const CINDERMAW_ASSET_ID = "dragons_emberkeep_boss_01";
const CINDERMAW_MOUTH_FORWARD_OFFSET = 48;
const CINDERMAW_MOUTH_UP_OFFSET = 55;
const BOSS_THROW_FORWARD_OFFSET = 38;
const BOSS_THROW_UP_OFFSET = 78;
const ORBITAL_SENTINEL_CHEST_UP_OFFSET = 55;
const LASER_BEAM_HALF_HEIGHT = 16;
const COLLISION_SKIN = 0.001;
const CAMERA_HORIZONTAL_ANCHOR = 0.38;
export const DEATH_ANIMATION_TICKS = 24;
export const EXTRA_LIFE_FADE_TICKS = Math.round(FIXED_TICK_RATE * 0.4);
export const EXTRA_LIFE_FIREWORK_FRAME_COUNT = 8;
export const EXTRA_LIFE_FIREWORK_FPS = 8;
export const COLLECTIBLE_POOF_FRAME_COUNT = 4;
export const COLLECTIBLE_POOF_FPS = 12;
export const DEFAULT_PLATFORM_SPRING_LAUNCH_SPEED = 1200;
export const MINIMUM_PLATFORM_SPRING_LAUNCH_SPEED = 800;
export const MAXIMUM_PLATFORM_SPRING_LAUNCH_SPEED = 1600;
export const PLATFORM_SPRING_COMPRESSION_FRAME_COUNT = 4;
export const PLATFORM_SPRING_COMPRESSION_FPS = 12;

type ResolvedPhysics = {
  maximumRunSpeed: number;
  groundAcceleration: number;
  groundDeceleration: number;
  airAcceleration: number;
  gravity: number;
  jumpVelocity: number;
  maximumFallSpeed: number;
};

type RangedAttack = NonNullable<PlatformerMapObject["rangedAttack"]>;
type ProjectileAttack = Exclude<RangedAttack, { type: "laser_beam" }>;
type LaserBeamAttack = Extract<RangedAttack, { type: "laser_beam" }>;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export type PlatformerCamera = { x: number; y: number };

export function resolveEnemyFacingDirection(
  enemy: Pick<EnemyState, "direction">,
) {
  return enemy.direction;
}

export function resolveDeathRespawnDelayTicks(map: PlatformerMapSpec) {
  const configuredSeconds = map.rules?.respawnDelaySeconds;
  const seconds = Number.isFinite(configuredSeconds)
    ? clamp(
        configuredSeconds,
        MINIMUM_DEATH_RESPAWN_DELAY_SECONDS,
        MAXIMUM_DEATH_RESPAWN_DELAY_SECONDS,
      )
    : DEFAULT_DEATH_RESPAWN_DELAY_SECONDS;
  return Math.round(seconds * FIXED_TICK_RATE);
}

export function resolvePlatformerCamera(
  map: PlatformerMapSpec,
  state: Pick<PlatformerState, "x" | "y">,
): PlatformerCamera {
  const viewportWidth = map.camera.columns * map.tileSize;
  const viewportHeight = map.camera.rows * map.tileSize;
  const worldWidth = map.size.columns * map.tileSize;
  const worldHeight = map.size.rows * map.tileSize;
  return {
    x: clamp(
      state.x - viewportWidth * CAMERA_HORIZONTAL_ANCHOR,
      0,
      Math.max(0, worldWidth - viewportWidth),
    ),
    y: clamp(
      state.y - viewportHeight * 0.72,
      0,
      Math.max(0, worldHeight - viewportHeight),
    ),
  };
}

export function snapPlatformerStateToGrid(
  map: PlatformerMapSpec,
  state: PlatformerState,
): PlatformerState {
  const tileSize = map.tileSize;
  const worldWidth = map.size.columns * tileSize;
  const worldHeight = map.size.rows * tileSize;
  const { x, y } = nearestPlayerGridPosition(map, state.x, state.y);
  const footCollision = collisionAt(
    map,
    Math.floor(x / tileSize),
    Math.floor((y + COLLISION_SKIN) / tileSize),
  );

  return {
    ...state,
    x,
    y,
    previousY: y,
    vx: 0,
    vy: 0,
    grounded: footCollision === "solid" || footCollision === "one_way",
    coyoteTicksRemaining: 0,
    jumpBufferTicksRemaining: 0,
    enemies: state.enemies.map((enemy) => {
      const object = map.objects.find((candidate) => candidate.id === enemy.id);
      if (object?.motion?.travel.type === "circle") {
        return {
          ...enemy,
          x: enemy.startX,
          y: enemy.startY,
          circleTicks: 0,
          moving: false,
        };
      }
      const leftTiles = enemy.behavior === "chaser"
        ? enemy.viewLeftTiles
        : enemy.patrolLeftTiles;
      const rightTiles = enemy.behavior === "chaser"
        ? enemy.viewRightTiles
        : enemy.patrolRightTiles;
      return {
        ...enemy,
        x: clamp(
          (Math.round(enemy.x / tileSize - 0.5) + 0.5) * tileSize,
          enemy.startX - leftTiles * tileSize,
          enemy.startX + rightTiles * tileSize,
        ),
        y: clamp(
          Math.round(enemy.y / tileSize) * tileSize,
          ENEMY_HEIGHT,
          worldHeight,
        ),
        moving: false,
      };
    }),
    flyingObjects: state.flyingObjects.map((object) => ({
      ...object,
      x: clamp(
        (Math.round(object.x / tileSize - 0.5) + 0.5) * tileSize,
        tileSize / 2,
        worldWidth - tileSize / 2,
      ),
      y: clamp(
        (Math.round(object.y / tileSize - 0.5) + 0.5) * tileSize,
        tileSize / 2,
        worldHeight - tileSize / 2,
      ),
    })),
  };
}

export function resolveEnemyViewMusicCue(
  map: PlatformerMapSpec,
  state: Pick<PlatformerState, "enemies">,
  camera: PlatformerCamera,
) {
  const viewport = {
    left: camera.x,
    right: camera.x + map.camera.columns * map.tileSize,
    top: camera.y,
    bottom: camera.y + map.camera.rows * map.tileSize,
  };
  const visibleEnemy = state.enemies.find((enemy) => (
    !enemy.defeated &&
    Boolean(enemy.viewMusicCue) &&
    overlaps(enemyBounds(enemy), viewport)
  ));
  return visibleEnemy?.viewMusicCue ?? null;
}

export function resolveWorldBottomBackgroundOffset(
  map: PlatformerMapSpec,
  cameraY: number,
) {
  const viewportHeight = map.camera.rows * map.tileSize;
  const worldHeight = map.size.rows * map.tileSize;
  const bottomCameraY = Math.max(0, worldHeight - viewportHeight);
  return bottomCameraY - cameraY;
}

function interpolateCoordinate(
  previous: number,
  current: number,
  alpha: number,
  maximumContinuousDelta: number,
) {
  if (Math.abs(current - previous) > maximumContinuousDelta) return current;
  return previous + (current - previous) * clamp(alpha, 0, 1);
}

export function interpolatePlatformerState(
  previous: PlatformerState,
  current: PlatformerState,
  alpha: number,
  tileSize: number,
): PlatformerState {
  const maximumContinuousDelta = tileSize / 4;
  const canInterpolatePlayer = previous.status === current.status;
  const previousEnemies = new Map(previous.enemies.map((enemy) => [enemy.id, enemy]));
  const previousFlyingObjects = new Map(
    previous.flyingObjects.map((flyingObject) => [flyingObject.id, flyingObject]),
  );
  const previousProjectiles = new Map(
    previous.projectiles.map((projectile) => [projectile.id, projectile]),
  );
  const previousLaserBeams = new Map(
    previous.laserBeams.map((beam) => [beam.id, beam]),
  );

  return {
    ...current,
    vx: canInterpolatePlayer
      ? previous.vx + (current.vx - previous.vx) * clamp(alpha, 0, 1)
      : current.vx,
    x: canInterpolatePlayer
      ? interpolateCoordinate(previous.x, current.x, alpha, maximumContinuousDelta)
      : current.x,
    y: canInterpolatePlayer
      ? interpolateCoordinate(previous.y, current.y, alpha, maximumContinuousDelta)
      : current.y,
    enemies: current.enemies.map((enemy) => {
      const prior = previousEnemies.get(enemy.id);
      if (!prior || prior.defeated !== enemy.defeated) return enemy;
      return {
        ...enemy,
        x: interpolateCoordinate(prior.x, enemy.x, alpha, maximumContinuousDelta),
        y: interpolateCoordinate(prior.y, enemy.y, alpha, maximumContinuousDelta),
      };
    }),
    projectiles: current.projectiles.map((projectile) => {
      const prior = previousProjectiles.get(projectile.id);
      if (!prior) return projectile;
      return {
        ...projectile,
        x: interpolateCoordinate(prior.x, projectile.x, alpha, maximumContinuousDelta),
        y: interpolateCoordinate(prior.y, projectile.y, alpha, maximumContinuousDelta),
      };
    }),
    laserBeams: current.laserBeams.map((beam) => {
      const prior = previousLaserBeams.get(beam.id);
      if (!prior) return beam;
      return {
        ...beam,
        startX: interpolateCoordinate(prior.startX, beam.startX, alpha, maximumContinuousDelta),
        startY: interpolateCoordinate(prior.startY, beam.startY, alpha, maximumContinuousDelta),
        endX: interpolateCoordinate(prior.endX, beam.endX, alpha, maximumContinuousDelta),
      };
    }),
    flyingObjects: current.flyingObjects.map((flyingObject) => {
      const prior = previousFlyingObjects.get(flyingObject.id);
      if (!prior || prior.phase !== flyingObject.phase) return flyingObject;
      return {
        ...flyingObject,
        x: interpolateCoordinate(
          prior.x,
          flyingObject.x,
          alpha,
          maximumContinuousDelta,
        ),
        y: interpolateCoordinate(
          prior.y,
          flyingObject.y,
          alpha,
          maximumContinuousDelta,
        ),
      };
    }),
  };
}

export function resolveVisualBobOffset(
  motion: MotionSpec | undefined,
  objectId: string,
  tick: number,
  tileSize: number,
) {
  if (!motion || motion.visual.type !== "bob") return 0;
  return resolveVisualMotionOffset(motion, objectId, tick, tileSize).y;
}

export function resolveVisualMotionOffset(
  motion: MotionSpec | undefined,
  objectId: string,
  tick: number,
  tileSize: number,
  direction: "down" | "left" | "right" | "up" = "down",
) {
  return resolveBodyMotionOffset(
    motion?.visual,
    objectId,
    (tick / FIXED_TICK_RATE) * 1000,
    tileSize,
    direction,
  );
}

export function resolveExtraLifeOpacity(
  state: Pick<PlatformerState, "tick" | "extraLifeCollectedAtTick">,
  objectId: string,
) {
  const collectedAtTick = state.extraLifeCollectedAtTick[objectId];
  if (collectedAtTick === undefined) return 1;
  return clamp(1 - (state.tick - collectedAtTick) / EXTRA_LIFE_FADE_TICKS, 0, 1);
}

export function resolveExtraLifeFireworkFrame(
  state: Pick<PlatformerState, "tick" | "extraLifeCollectedAtTick">,
  objectId: string,
) {
  const collectedAtTick = state.extraLifeCollectedAtTick[objectId];
  if (collectedAtTick === undefined) return null;
  const elapsedTicks = state.tick - collectedAtTick;
  if (elapsedTicks < 0) return null;
  const frame = Math.floor((elapsedTicks * EXTRA_LIFE_FIREWORK_FPS) / FIXED_TICK_RATE);
  return frame < EXTRA_LIFE_FIREWORK_FRAME_COUNT ? frame : null;
}

export function resolveCollectiblePoofFrame(
  state: Pick<PlatformerState, "tick" | "collectibleCollectedAtTick">,
  objectId: string,
) {
  const collectedAtTick = state.collectibleCollectedAtTick[objectId];
  if (collectedAtTick === undefined) return null;
  const elapsedTicks = state.tick - collectedAtTick;
  if (elapsedTicks < 0) return null;
  const frame = Math.floor((elapsedTicks * COLLECTIBLE_POOF_FPS) / FIXED_TICK_RATE);
  return frame < COLLECTIBLE_POOF_FRAME_COUNT ? frame : null;
}

export function resolvePlatformSpringCompressionFrame(
  state: Pick<PlatformerState, "tick" | "springCompressedAtTick">,
  objectId: string,
) {
  const compressedAtTick = state.springCompressedAtTick[objectId];
  if (compressedAtTick === undefined) return null;
  const elapsedTicks = state.tick - compressedAtTick;
  if (elapsedTicks < 0) return null;
  const frame = Math.floor(
    (elapsedTicks * PLATFORM_SPRING_COMPRESSION_FPS) / FIXED_TICK_RATE,
  );
  return frame < PLATFORM_SPRING_COMPRESSION_FRAME_COUNT ? frame : null;
}

function moveToward(value: number, target: number, maximumDelta: number) {
  if (value < target) return Math.min(value + maximumDelta, target);
  if (value > target) return Math.max(value - maximumDelta, target);
  return target;
}

export function resolvePhysics(
  physics: PlatformerPhysicsSpec,
  tileSize: number,
  gravityScale = 1,
  groundTractionScale = DEFAULT_GROUND_TRACTION_SCALE,
  maximumRunSpeedPxPerSecond = physics.movement.maximumRunSpeedTilesPerSecond * tileSize,
): ResolvedPhysics {
  const jump = physics.verticalMovement.groundedJump;
  const baseGravity = (2 * jump.jumpHeightTiles * tileSize) / jump.timeToApexSeconds ** 2;
  const traction = Number.isFinite(groundTractionScale)
    ? clamp(
        groundTractionScale,
        MINIMUM_GROUND_TRACTION_SCALE,
        MAXIMUM_GROUND_TRACTION_SCALE,
      )
    : DEFAULT_GROUND_TRACTION_SCALE;

  return {
    maximumRunSpeed: maximumRunSpeedPxPerSecond,
    groundAcceleration:
      maximumRunSpeedPxPerSecond /
      physics.movement.groundTimeToMaximumSpeedSeconds * traction,
    groundDeceleration:
      maximumRunSpeedPxPerSecond /
      physics.movement.groundTimeToStopSeconds * traction,
    airAcceleration:
      maximumRunSpeedPxPerSecond /
      physics.movement.airTimeToMaximumSpeedSeconds,
    gravity: baseGravity * gravityScale,
    jumpVelocity: -baseGravity * jump.timeToApexSeconds,
    maximumFallSpeed: jump.maximumFallSpeedTilesPerSecond * tileSize,
  };
}

function terrainRows(map: PlatformerMapSpec) {
  return map.layers.find((layer) => layer.id === "terrain")?.rows ?? [];
}

function collisionAt(map: PlatformerMapSpec, column: number, row: number) {
  if (column < 0 || column >= map.size.columns || row < 0 || row >= map.size.rows) {
    return "none";
  }
  const symbol = terrainRows(map)[row]?.[column] ?? ".";
  return map.legend[symbol]?.collision ?? "none";
}

function isSolid(map: PlatformerMapSpec, column: number, row: number) {
  return collisionAt(map, column, row) === "solid";
}

function platformSpringAt(
  map: PlatformerMapSpec,
  column: number,
  row: number,
) {
  return map.objects.find((object) => (
    object.type === "platform_spring"
    && Math.floor(object.x) === column
    && Math.floor(object.y) === row
  ));
}

function isSolidCell(map: PlatformerMapSpec, column: number, row: number) {
  return isSolid(map, column, row) || Boolean(platformSpringAt(map, column, row));
}

function nearestPlayerGridPosition(
  map: PlatformerMapSpec,
  currentX: number,
  currentY: number,
) {
  const candidates: Array<{ x: number; y: number; distance: number }> = [];
  for (let row = 1; row <= map.size.rows; row += 1) {
    const y = row * map.tileSize;
    for (let column = 0; column < map.size.columns; column += 1) {
      const x = (column + 0.5) * map.tileSize;
      candidates.push({
        x,
        y,
        distance: (x - currentX) ** 2 + (y - currentY) ** 2,
      });
    }
  }
  candidates.sort((left, right) => left.distance - right.distance);
  return candidates.find(({ x, y }) => {
    const leftColumn = Math.floor((x - PLAYER_HALF_WIDTH + COLLISION_SKIN) / map.tileSize);
    const rightColumn = Math.floor((x + PLAYER_HALF_WIDTH - COLLISION_SKIN) / map.tileSize);
    const topRow = Math.floor((y - PLAYER_HEIGHT + COLLISION_SKIN) / map.tileSize);
    const bottomRow = Math.floor((y - COLLISION_SKIN) / map.tileSize);
    for (let row = topRow; row <= bottomRow; row += 1) {
      for (let column = leftColumn; column <= rightColumn; column += 1) {
        const collision = collisionAt(map, column, row);
        if (collision === "solid" || collision === "one_way") return false;
      }
    }
    return true;
  }) ?? {
    x: clamp(currentX, map.tileSize / 2, map.size.columns * map.tileSize - map.tileSize / 2),
    y: clamp(currentY, map.tileSize, map.size.rows * map.tileSize),
  };
}

function resolveHorizontal(
  map: PlatformerMapSpec,
  x: number,
  y: number,
  dx: number,
  halfWidth = PLAYER_HALF_WIDTH,
  height = PLAYER_HEIGHT,
) {
  if (dx === 0) return { position: x, hit: false };
  const tileSize = map.tileSize;
  let nextX = x + dx;
  const topRow = Math.floor((y - height + COLLISION_SKIN) / tileSize);
  const bottomRow = Math.floor((y - COLLISION_SKIN) / tileSize);

  if (dx > 0) {
    const previousColumn = Math.floor((x + halfWidth - COLLISION_SKIN) / tileSize);
    const nextColumn = Math.floor((nextX + halfWidth - COLLISION_SKIN) / tileSize);
    for (let column = previousColumn + 1; column <= nextColumn; column += 1) {
      for (let row = topRow; row <= bottomRow; row += 1) {
        if (isSolidCell(map, column, row)) {
          nextX = column * tileSize - halfWidth - COLLISION_SKIN;
          return { position: nextX, hit: true };
        }
      }
    }
  } else {
    const previousColumn = Math.floor((x - halfWidth + COLLISION_SKIN) / tileSize);
    const nextColumn = Math.floor((nextX - halfWidth + COLLISION_SKIN) / tileSize);
    for (let column = previousColumn - 1; column >= nextColumn; column -= 1) {
      for (let row = topRow; row <= bottomRow; row += 1) {
        if (isSolidCell(map, column, row)) {
          nextX = (column + 1) * tileSize + halfWidth + COLLISION_SKIN;
          return { position: nextX, hit: true };
        }
      }
    }
  }

  return { position: nextX, hit: false };
}

function resolveVertical(
  map: PlatformerMapSpec,
  x: number,
  y: number,
  dy: number,
) {
  if (dy === 0) return { position: y, hit: false, grounded: false, springId: null };
  const tileSize = map.tileSize;
  let nextY = y + dy;
  const leftColumn = Math.floor((x - PLAYER_HALF_WIDTH + COLLISION_SKIN) / tileSize);
  const rightColumn = Math.floor((x + PLAYER_HALF_WIDTH - COLLISION_SKIN) / tileSize);

  if (dy > 0) {
    const previousRow = Math.floor((y - COLLISION_SKIN) / tileSize);
    const nextRow = Math.floor((nextY - COLLISION_SKIN) / tileSize);
    for (let row = previousRow + 1; row <= nextRow; row += 1) {
      for (let column = leftColumn; column <= rightColumn; column += 1) {
        const spring = platformSpringAt(map, column, row);
        const collision = collisionAt(map, column, row);
        const tileTop = row * tileSize;
        const blocks =
          Boolean(spring) ||
          collision === "solid" ||
          (collision === "one_way" && y <= tileTop + COLLISION_SKIN);
        if (blocks) {
          nextY = tileTop - COLLISION_SKIN;
          return {
            position: nextY,
            hit: true,
            grounded: !spring,
            springId: spring?.id ?? null,
          };
        }
      }
    }
  } else {
    const previousTop = y - PLAYER_HEIGHT;
    const nextTop = nextY - PLAYER_HEIGHT;
    const previousRow = Math.floor((previousTop + COLLISION_SKIN) / tileSize);
    const nextRow = Math.floor((nextTop + COLLISION_SKIN) / tileSize);
    for (let row = previousRow - 1; row >= nextRow; row -= 1) {
      for (let column = leftColumn; column <= rightColumn; column += 1) {
        if (isSolidCell(map, column, row)) {
          nextY = (row + 1) * tileSize + PLAYER_HEIGHT + COLLISION_SKIN;
          return { position: nextY, hit: true, grounded: false, springId: null };
        }
      }
    }
  }

  return { position: nextY, hit: false, grounded: false, springId: null };
}

function spawnPosition(map: PlatformerMapSpec, object: PlatformerMapObject) {
  return {
    x: (object.x + 0.5) * map.tileSize,
    y: (object.y + 1) * map.tileSize,
  };
}

function createEnemy(map: PlatformerMapSpec, object: PlatformerMapObject): EnemyState {
  const position = spawnPosition(map, object);
  return {
    id: object.id,
    role: object.role === "boss" ? "boss" : "enemy",
    viewMusicCue: object.viewMusicCue,
    assetId: object.assetId ?? "neutral_ghost_01",
    behavior: object.behavior ?? "patroller",
    direction: object.direction ?? "left",
    x: position.x,
    y: position.y,
    startX: position.x,
    startY: position.y,
    circleTicks: 0,
    speed: object.speedPxPerSecond ?? 48,
    patrolLeftTiles: object.patrolLeftTiles ?? 2,
    patrolRightTiles: object.patrolRightTiles ?? 2,
    viewLeftTiles: object.viewLeftTiles ?? 0,
    viewRightTiles: object.viewRightTiles ?? 0,
    pointValue: object.pointValue ?? 0,
    defeatMode: object.defeatMode ?? "both",
    hitsRemaining: object.hitsToDefeat ?? 1,
    hitReactionTicksRemaining: 0,
    ramPhase: "idle",
    ramArmed: true,
    ramDirection: object.direction ?? "left",
    ramWindupTicksRemaining: 0,
    ramDistanceRemaining: 0,
    nextRangedAttackTick: object.rangedAttack
      ? Math.max(1, Math.round((object.rangedAttack.cooldownMs / 1000) * FIXED_TICK_RATE))
      : null,
    moving: false,
    defeated: false,
  };
}

function enemyCollisionDimensions(enemy: EnemyState) {
  return enemy.role === "boss"
    ? { halfWidth: BOSS_HALF_WIDTH, height: BOSS_HEIGHT }
    : { halfWidth: ENEMY_HALF_WIDTH, height: ENEMY_HEIGHT };
}

function enemyBounds(enemy: EnemyState) {
  const { halfWidth, height } = enemyCollisionDimensions(enemy);
  return {
    left: enemy.x - halfWidth,
    right: enemy.x + halfWidth,
    top: enemy.y - height,
    bottom: enemy.y,
  };
}

function resolveEnemyKnockback(
  map: PlatformerMapSpec,
  enemy: EnemyState,
  distance: number,
) {
  const { halfWidth, height } = enemyCollisionDimensions(enemy);
  const horizontal = resolveHorizontal(
    map,
    enemy.x,
    enemy.y,
    distance,
    halfWidth,
    height,
  );
  return clamp(
    horizontal.position,
    halfWidth,
    map.size.columns * map.tileSize - halfWidth,
  );
}

function resolveBossDirectionAfterWeaponHit(
  enemy: EnemyState,
  attackerX: number,
) {
  if (enemy.role !== "boss" || Math.abs(attackerX - enemy.x) <= COLLISION_SKIN) {
    return enemy.direction;
  }
  return attackerX < enemy.x ? "left" : "right";
}

export function createInitialState(map: PlatformerMapSpec): PlatformerState {
  const spawn = map.objects.find((object) => object.type === "player_spawn");
  if (!spawn) throw new Error(`Map ${map.id} does not contain a player spawn.`);
  const position = spawnPosition(map, spawn);

  return {
    tick: 0,
    x: position.x,
    y: position.y,
    previousY: position.y,
    vx: 0,
    vy: 0,
    grounded: true,
    facing: "right",
    coyoteTicksRemaining: 0,
    jumpBufferTicksRemaining: 0,
    jumpReleaseArmed: true,
    jumpCutApplied: false,
    attackTicksRemaining: 0,
    attackCooldownTicksRemaining: 0,
    attackHitIds: [],
    deathTicksRemaining: 0,
    deathTicksTotal: resolveDeathRespawnDelayTicks(map),
    deathAnimationTicksTotal: DEATH_ANIMATION_TICKS,
    spawnX: position.x,
    spawnY: position.y,
    latestCheckpointId: null,
    checkpointX: position.x,
    checkpointY: position.y,
    collectedIds: [],
    collectibleCollectedAtTick: {},
    extraLifeCollectedAtTick: {},
    springCompressedAtTick: {},
    score: 0,
    lives: 3,
    status: "playing",
    enemies: map.objects
      .filter((object) => object.type === "enemy_spawn")
      .map((object) => createEnemy(map, object)),
    projectiles: [],
    laserBeams: [],
    flyingObjects: map.objects
      .filter((object) => object.type === "flying_object")
      .map((object): FlyingObjectState => ({
        id: object.id,
        assetId: object.assetId ?? "neutral_green_hills_flying_cooper_01",
        phase: "waiting",
        startTick: null,
        startCameraX: 0,
        startCameraY: 0,
        x: (object.x + 0.5) * map.tileSize,
        y: (object.y + 0.5) * map.tileSize,
      })),
  };
}

function overlaps(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function playerBounds(state: PlatformerState) {
  return {
    left: state.x - PLAYER_HALF_WIDTH,
    right: state.x + PLAYER_HALF_WIDTH,
    top: state.y - PLAYER_HEIGHT,
    bottom: state.y,
  };
}

function objectBounds(map: PlatformerMapSpec, object: PlatformerMapObject) {
  const tile = map.tileSize;
  const centerX = (object.x + 0.5) * tile;
  const centerY = (object.y + 0.5) * tile;
  if (object.type === "collectible" || object.type === "extra_life") {
    return { left: centerX - 16, right: centerX + 16, top: centerY - 16, bottom: centerY + 16 };
  }
  if (object.type === "checkpoint") {
    return { left: centerX - 16, right: centerX + 16, top: object.y * tile, bottom: (object.y + 1) * tile };
  }
  if (object.type === "goal") {
    return { left: centerX - 24, right: centerX + 24, top: object.y * tile, bottom: (object.y + 1) * tile };
  }
  return { left: object.x * tile, right: (object.x + 1) * tile, top: object.y * tile, bottom: (object.y + 1) * tile };
}

function beginDeath(
  map: PlatformerMapSpec,
  state: PlatformerState,
  events: RuntimeEvent[],
): PlatformerState {
  const lives = state.lives - 1;
  const respawnDelayTicks = resolveDeathRespawnDelayTicks(map);
  events.push({ type: "player_damage" });
  events.push({ type: "player_death" });
  return {
    ...state,
    vx: 0,
    vy: 0,
    grounded: false,
    coyoteTicksRemaining: 0,
    jumpBufferTicksRemaining: 0,
    jumpReleaseArmed: true,
    jumpCutApplied: false,
    attackTicksRemaining: 0,
    attackHitIds: [],
    projectiles: [],
    deathTicksRemaining: respawnDelayTicks,
    deathTicksTotal: respawnDelayTicks,
    deathAnimationTicksTotal: DEATH_ANIMATION_TICKS,
    lives: Math.max(0, lives),
    status: "dying",
  };
}

function advanceDeath(state: PlatformerState): StepResult {
  const events: RuntimeEvent[] = [];
  const laserBeams = state.laserBeams
    .map((beam) => ({ ...beam, ageTicks: beam.ageTicks + 1 }))
    .filter((beam) => beam.ageTicks < beam.chargeTicks + beam.durationTicks);
  if (state.deathTicksRemaining > 1) {
    return {
      state: {
        ...state,
        tick: state.tick + 1,
        deathTicksRemaining: state.deathTicksRemaining - 1,
        laserBeams,
      },
      events,
    };
  }
  if (state.lives <= 0) {
    events.push({ type: "game_over" });
    return {
      state: {
        ...state,
        tick: state.tick + 1,
        deathTicksRemaining: 0,
        laserBeams,
        status: "game_over",
      },
      events,
    };
  }
  events.push({ type: "respawn" });
  return {
    state: {
      ...state,
      tick: state.tick + 1,
      x: state.checkpointX,
      y: state.checkpointY,
      previousY: state.checkpointY,
      vx: 0,
      vy: 0,
      grounded: true,
      deathTicksRemaining: 0,
      laserBeams: [],
      status: "playing",
    },
    events,
  };
}

function playerIsInRammingView(
  map: PlatformerMapSpec,
  state: PlatformerState,
  enemy: EnemyState,
) {
  const leftRange = enemy.behavior === "chaser"
    ? enemy.viewLeftTiles
    : enemy.patrolLeftTiles;
  const rightRange = enemy.behavior === "chaser"
    ? enemy.viewRightTiles
    : enemy.patrolRightTiles;
  const insideBehaviorArea = state.x >= enemy.startX - leftRange * map.tileSize
    && state.x <= enemy.startX + rightRange * map.tileSize;
  if (!insideBehaviorArea) return false;
  const player = playerBounds(state);
  const bounds = enemyBounds(enemy);
  const verticallyVisible = player.top < bounds.bottom && player.bottom > bounds.top;
  if (!verticallyVisible) return false;
  return enemy.direction === "right"
    ? state.x > enemy.x + COLLISION_SKIN
    : state.x < enemy.x - COLLISION_SKIN;
}

function playerIsInChaserView(
  map: PlatformerMapSpec,
  state: PlatformerState,
  enemy: EnemyState,
) {
  const horizontallyVisible = state.x >= enemy.startX - enemy.viewLeftTiles * map.tileSize
    && state.x <= enemy.startX + enemy.viewRightTiles * map.tileSize;
  if (!horizontallyVisible) return false;
  const player = playerBounds(state);
  const bounds = enemyBounds(enemy);
  return player.top < bounds.bottom && player.bottom > bounds.top;
}

function updateRammingEnemy(
  map: PlatformerMapSpec,
  state: PlatformerState,
  enemy: EnemyState,
  travel: Extract<MotionSpec["travel"], { type: "ramming" }>,
) {
  if (enemy.ramPhase === "windup") {
    const ramWindupTicksRemaining = Math.max(0, enemy.ramWindupTicksRemaining - 1);
    return {
      handled: true,
      enemy: {
        ...enemy,
        ramPhase: ramWindupTicksRemaining === 0 ? "charge" as const : "windup" as const,
        ramWindupTicksRemaining,
        moving: false,
      },
    };
  }

  if (enemy.ramPhase === "charge") {
    const direction = enemy.ramDirection === "left" ? -1 : 1;
    const maximumStep = RAMMING_SPEED_TILES_PER_SECOND * map.tileSize * FIXED_DELTA_SECONDS;
    const requestedDistance = Math.min(enemy.ramDistanceRemaining, maximumStep);
    const x = resolveEnemyKnockback(map, enemy, direction * requestedDistance);
    const distanceMoved = Math.abs(x - enemy.x);
    const ramDistanceRemaining = Math.max(0, enemy.ramDistanceRemaining - distanceMoved);
    const blocked = distanceMoved + COLLISION_SKIN < requestedDistance;
    const complete = blocked || ramDistanceRemaining <= COLLISION_SKIN;
    return {
      handled: true,
      enemy: {
        ...enemy,
        x,
        direction: enemy.ramDirection,
        ramPhase: complete ? "idle" as const : "charge" as const,
        ramWindupTicksRemaining: 0,
        ramDistanceRemaining: complete ? 0 : ramDistanceRemaining,
        moving: distanceMoved > COLLISION_SKIN,
      },
    };
  }

  const triggerActive = playerIsInRammingView(map, state, enemy);
  if (!triggerActive) {
    return {
      handled: false,
      enemy: enemy.ramArmed ? enemy : { ...enemy, ramArmed: true },
    };
  }
  if (!enemy.ramArmed) return { handled: false, enemy };
  return {
    handled: true,
    enemy: {
      ...enemy,
      ramPhase: "windup" as const,
      ramArmed: false,
      ramDirection: enemy.direction,
      ramWindupTicksRemaining: Math.max(
        1,
        Math.round((travel.chargeDelayMs / 1000) * FIXED_TICK_RATE),
      ),
      ramDistanceRemaining: travel.distanceTiles * map.tileSize,
      moving: false,
    },
  };
}

function updateEnemies(map: PlatformerMapSpec, state: PlatformerState) {
  return state.enemies.map((storedEnemy) => {
    let enemy = storedEnemy;
    if (enemy.defeated) return enemy;
    if (enemy.hitReactionTicksRemaining > 0) {
      return {
        ...enemy,
        hitReactionTicksRemaining: enemy.hitReactionTicksRemaining - 1,
        moving: false,
      };
    }
    const object = map.objects.find((candidate) => candidate.id === enemy.id);
    const travel = object?.motion?.travel;
    if (travel?.type === "circle") {
      const durationTicks = Math.max(
        1,
        Math.round((travel.durationMs / 1000) * FIXED_TICK_RATE),
      );
      const circleTicks = (enemy.circleTicks + 1) % durationTicks;
      const radius = ((travel.gridSizeTiles - 1) / 2) * map.tileSize;
      const spin = travel.direction === "clockwise" ? 1 : -1;
      const angle = Math.PI / 2 + spin * Math.PI * 2 * (circleTicks / durationTicks);
      const x = enemy.startX + Math.cos(angle) * radius;
      const y = enemy.startY - radius + Math.sin(angle) * radius;
      const horizontalDelta = x - enemy.x;
      return {
        ...enemy,
        x,
        y,
        circleTicks,
        direction: Math.abs(horizontalDelta) <= COLLISION_SKIN
          ? enemy.direction
          : horizontalDelta < 0 ? "left" : "right",
        moving: true,
      };
    }
    if (travel?.type === "ramming") {
      const result = updateRammingEnemy(map, state, enemy, travel);
      if (result.handled) return result.enemy;
      enemy = result.enemy;
    } else if (travel && travel.type !== "behavior") {
      return { ...enemy, moving: false };
    }
    let direction = enemy.direction;
    const playerInChaserView = enemy.behavior === "chaser"
      && playerIsInChaserView(map, state, enemy);
    const patrolling = enemy.behavior === "patroller" || !playerInChaserView;
    const leftRange = enemy.behavior === "chaser"
      ? enemy.viewLeftTiles
      : enemy.patrolLeftTiles;
    const rightRange = enemy.behavior === "chaser"
      ? enemy.viewRightTiles
      : enemy.patrolRightTiles;
    const minimumX = enemy.startX - leftRange * map.tileSize;
    const maximumX = enemy.startX + rightRange * map.tileSize;
    const startedInsidePatrol = enemy.x >= minimumX && enemy.x <= maximumX;
    if (playerInChaserView) direction = state.x < enemy.x ? "left" : "right";
    if (patrolling && enemy.x < minimumX) direction = "right";
    if (patrolling && enemy.x > maximumX) direction = "left";

    const velocity = direction === "left" ? -enemy.speed : enemy.speed;
    let nextX = enemy.x + velocity * FIXED_DELTA_SECONDS;
    if (
      patrolling &&
      startedInsidePatrol &&
      (nextX < minimumX || nextX > maximumX)
    ) {
      direction = direction === "left" ? "right" : "left";
      nextX = clamp(nextX, minimumX, maximumX);
    }

    const { halfWidth, height } = enemyCollisionDimensions(enemy);
    const rowTop = Math.floor((enemy.y - height + COLLISION_SKIN) / map.tileSize);
    const rowBottom = Math.floor((enemy.y - COLLISION_SKIN) / map.tileSize);
    const leadingX = nextX + (direction === "right" ? halfWidth : -halfWidth);
    const column = Math.floor(leadingX / map.tileSize);
    for (let row = rowTop; row <= rowBottom; row += 1) {
      if (isSolid(map, column, row)) {
        direction = direction === "left" ? "right" : "left";
        nextX = enemy.x;
        break;
      }
    }

    return { ...enemy, x: nextX, direction, moving: Math.abs(nextX - enemy.x) > 0.001 };
  });
}

function quadraticBezier(start: number, control: number, end: number, progress: number) {
  const inverse = 1 - progress;
  return inverse * inverse * start + 2 * inverse * progress * control + progress * progress * end;
}

export function resolveEnemyProjectilePosition(
  projectile: Pick<
    EnemyProjectileState,
    "ageTicks" | "durationTicks" | "startX" | "startY" | "targetX" | "targetY" | "arcHeight"
  >,
) {
  const progress = clamp(projectile.ageTicks / projectile.durationTicks, 0, 1);
  const middleX = (projectile.startX + projectile.targetX) / 2;
  const middleY = (projectile.startY + projectile.targetY) / 2;
  return {
    x: quadraticBezier(projectile.startX, middleX, projectile.targetX, progress),
    y: quadraticBezier(
      projectile.startY,
      middleY - projectile.arcHeight * 2,
      projectile.targetY,
      progress,
    ),
  };
}

function playerInsideEnemyBehaviorView(
  map: PlatformerMapSpec,
  state: PlatformerState,
  enemy: EnemyState,
) {
  const leftRange = enemy.behavior === "chaser"
    ? enemy.viewLeftTiles
    : enemy.patrolLeftTiles;
  const rightRange = enemy.behavior === "chaser"
    ? enemy.viewRightTiles
    : enemy.patrolRightTiles;
  return state.x >= enemy.startX - leftRange * map.tileSize
    && state.x <= enemy.startX + rightRange * map.tileSize;
}

function playerInsideRangedAttackView(
  map: PlatformerMapSpec,
  state: PlatformerState,
  enemy: EnemyState,
  attack: RangedAttack,
) {
  const maximumDistance = attack.rangeTiles * map.tileSize;
  const horizontallyInRange = Math.abs(state.x - enemy.x) <= maximumDistance;
  const ahead = enemy.direction === "left"
    ? state.x < enemy.x - COLLISION_SKIN
    : state.x > enemy.x + COLLISION_SKIN;
  if (!horizontallyInRange || !ahead) return false;

  if (attack.type === "lobbed_projectile") {
    return playerInsideEnemyBehaviorView(map, state, enemy);
  }

  const startY = enemy.y - (
    attack.type === "laser_beam"
      ? ORBITAL_SENTINEL_CHEST_UP_OFFSET
      : attack.type === "fireball" && enemy.assetId === CINDERMAW_ASSET_ID
        ? CINDERMAW_MOUTH_UP_OFFSET
        : DRAGON_MOUTH_UP_OFFSET
  );
  const player = playerBounds(state);
  const halfHeight = attack.type === "laser_beam"
    ? LASER_BEAM_HALF_HEIGHT
    : ENEMY_PROJECTILE_RADIUS * (
        attack.type === "fireball" ? attack.sizeScale ?? 1 : 1
      );
  const insideVerticalLane = startY + halfHeight > player.top
    && startY - halfHeight < player.bottom;
  return insideVerticalLane && (
    attack.type !== "laser_beam" || playerInsideEnemyBehaviorView(map, state, enemy)
  );
}

function createEnemyProjectile(
  map: PlatformerMapSpec,
  state: PlatformerState,
  enemy: EnemyState,
  attack: ProjectileAttack,
): EnemyProjectileState {
  const direction = enemy.direction;
  const directionMultiplier = direction === "left" ? -1 : 1;
  const lobbed = attack.type === "lobbed_projectile";
  const cindermawFireball = attack.type === "fireball"
    && enemy.assetId === CINDERMAW_ASSET_ID;
  const sizeScale = attack.type === "fireball" ? attack.sizeScale ?? 1 : 1;
  const startX = enemy.x + directionMultiplier * (
    lobbed
      ? BOSS_THROW_FORWARD_OFFSET
      : cindermawFireball
        ? CINDERMAW_MOUTH_FORWARD_OFFSET
        : DRAGON_MOUTH_FORWARD_OFFSET
  );
  const startY = enemy.y - (
    lobbed
      ? BOSS_THROW_UP_OFFSET
      : cindermawFireball
        ? CINDERMAW_MOUTH_UP_OFFSET
        : DRAGON_MOUTH_UP_OFFSET
  );
  const targetX = lobbed
    ? state.x
    : startX + directionMultiplier * attack.rangeTiles * map.tileSize;
  const targetY = lobbed ? state.y - PLAYER_HEIGHT / 2 : startY;
  const travelDistance = lobbed
    ? Math.max(map.tileSize * 2, Math.abs(targetX - startX))
    : attack.rangeTiles * map.tileSize;
  const durationTicks = Math.max(
    1,
    Math.round(
      travelDistance
        / (ENEMY_PROJECTILE_SPEED_TILES_PER_SECOND * map.tileSize)
        * FIXED_TICK_RATE,
    ),
  );
  const projectile: EnemyProjectileState = {
    id: `${enemy.id}:${state.tick}`,
    enemyId: enemy.id,
    assetId: attack.projectileAssetId,
    attackType: attack.type,
    direction,
    sizeScale,
    spawnTick: state.tick,
    ageTicks: 0,
    durationTicks,
    startX,
    startY,
    targetX,
    targetY,
    arcHeight: lobbed ? attack.arcHeightTiles * map.tileSize : 0,
    x: startX,
    y: startY,
  };
  return projectile;
}

export function resolveLaserBeamEndX(
  map: PlatformerMapSpec,
  startX: number,
  startY: number,
  direction: "left" | "right",
  rangePixels: number,
) {
  const step = direction === "left" ? -1 : 1;
  const worldWidth = map.size.columns * map.tileSize;
  const unclippedEndX = startX + step * rangePixels;
  const targetX = clamp(unclippedEndX, 0, worldWidth);
  const row = Math.floor(startY / map.tileSize);
  const startColumn = Math.floor(startX / map.tileSize);
  const targetColumn = Math.floor(clamp(targetX, 0, worldWidth - COLLISION_SKIN) / map.tileSize);

  for (
    let column = startColumn + step;
    step < 0 ? column >= targetColumn : column <= targetColumn;
    column += step
  ) {
    if (!isSolid(map, column, row)) continue;
    return step < 0
      ? (column + 1) * map.tileSize + COLLISION_SKIN
      : column * map.tileSize - COLLISION_SKIN;
  }
  return targetX;
}

function createEnemyLaserBeam(
  map: PlatformerMapSpec,
  state: PlatformerState,
  enemy: EnemyState,
  attack: LaserBeamAttack,
): EnemyLaserBeamState {
  const startX = enemy.x;
  const startY = enemy.y - ORBITAL_SENTINEL_CHEST_UP_OFFSET;
  const rangePixels = attack.rangeTiles * map.tileSize;
  return {
    id: `${enemy.id}:laser:${state.tick}`,
    enemyId: enemy.id,
    direction: enemy.direction,
    spawnTick: state.tick,
    ageTicks: 0,
    chargeTicks: Math.max(1, Math.round((attack.chargeMs / 1000) * FIXED_TICK_RATE)),
    durationTicks: Math.max(1, Math.round((attack.durationMs / 1000) * FIXED_TICK_RATE)),
    rangePixels,
    startX,
    startY,
    endX: startX,
  };
}

function laserBeamTouchesPlayer(beam: EnemyLaserBeamState, state: PlatformerState) {
  const player = playerBounds(state);
  const left = Math.min(beam.startX, beam.endX);
  const right = Math.max(beam.startX, beam.endX);
  return right > player.left
    && left < player.right
    && beam.startY + LASER_BEAM_HALF_HEIGHT > player.top
    && beam.startY - LASER_BEAM_HALF_HEIGHT < player.bottom;
}

function projectileTouchesPlayer(projectile: EnemyProjectileState, state: PlatformerState) {
  const player = playerBounds(state);
  const radius = ENEMY_PROJECTILE_RADIUS * projectile.sizeScale;
  return projectile.x + radius > player.left
    && projectile.x - radius < player.right
    && projectile.y + radius > player.top
    && projectile.y - radius < player.bottom;
}

function updateEnemyProjectiles(
  map: PlatformerMapSpec,
  state: PlatformerState,
  events: RuntimeEvent[],
) {
  let enemies = state.enemies;
  const projectiles: EnemyProjectileState[] = [];
  const laserBeams: EnemyLaserBeamState[] = [];

  for (const stored of state.projectiles) {
    const projectile = { ...stored, ageTicks: stored.ageTicks + 1 };
    const position = resolveEnemyProjectilePosition(projectile);
    projectile.x = position.x;
    projectile.y = position.y;
    if (
      projectile.x < 0
      || projectile.x >= map.size.columns * map.tileSize
      || projectile.y < 0
      || projectile.y >= map.size.rows * map.tileSize
    ) continue;
    if (
      projectile.attackType === "fireball"
      && isSolid(
        map,
        Math.floor(projectile.x / map.tileSize),
        Math.floor(projectile.y / map.tileSize),
      )
    ) continue;
    if (projectileTouchesPlayer(projectile, state)) {
      return beginDeath(map, { ...state, enemies, projectiles: [], laserBeams: [] }, events);
    }
    if (projectile.ageTicks >= projectile.durationTicks) continue;
    projectiles.push(projectile);
  }

  for (const stored of state.laserBeams) {
    const enemy = enemies.find((candidate) => candidate.id === stored.enemyId);
    if (!enemy || enemy.defeated) continue;
    const startX = enemy.x;
    const startY = enemy.y - ORBITAL_SENTINEL_CHEST_UP_OFFSET;
    const beam: EnemyLaserBeamState = {
      ...stored,
      ageTicks: stored.ageTicks + 1,
      startX,
      startY,
      endX: stored.ageTicks + 1 >= stored.chargeTicks
        ? resolveLaserBeamEndX(
            map,
            startX,
            startY,
            stored.direction,
            stored.rangePixels,
          )
        : startX,
    };
    const firing = beam.ageTicks >= beam.chargeTicks;
    if (beam.ageTicks >= beam.chargeTicks + beam.durationTicks) continue;
    if (beam.ageTicks === beam.chargeTicks) {
      events.push({ type: "fire", objectId: enemy.id });
    }
    if (firing && laserBeamTouchesPlayer(beam, state)) {
      return beginDeath(map, { ...state, enemies, projectiles: [], laserBeams: [beam] }, events);
    }
    laserBeams.push(beam);
  }

  for (const enemy of enemies) {
    if (
      enemy.defeated
      || enemy.hitReactionTicksRemaining > 0
      || enemy.nextRangedAttackTick === null
      || state.tick < enemy.nextRangedAttackTick
    ) continue;
    const object = map.objects.find((candidate) => candidate.id === enemy.id);
    const attack = object?.rangedAttack;
    if (!attack || !playerInsideRangedAttackView(map, state, enemy, attack)) continue;
    if (attack.type === "laser_beam") {
      laserBeams.push(createEnemyLaserBeam(map, state, enemy, attack));
    } else {
      projectiles.push(createEnemyProjectile(map, state, enemy, attack));
    }
    if (attack.type !== "laser_beam") {
      events.push({ type: "fire", objectId: enemy.id });
    }
    const cooldownTicks = Math.max(
      1,
      Math.round((attack.cooldownMs / 1000) * FIXED_TICK_RATE),
    );
    enemies = enemies.map((candidate) => (
      candidate.id === enemy.id
        ? { ...candidate, nextRangedAttackTick: state.tick + cooldownTicks }
        : candidate
    ));
  }

  return { ...state, enemies, projectiles, laserBeams };
}

function updateFlyingObjects(map: PlatformerMapSpec, state: PlatformerState) {
  const camera = resolvePlatformerCamera(map, state);
  const viewportWidth = map.camera.columns * map.tileSize;

  return state.flyingObjects.map((flyingObject) => {
    const object = map.objects.find((candidate) => candidate.id === flyingObject.id);
    if (!object) return { ...flyingObject, phase: "complete" as const };
    const travel = object.motion?.travel;
    if (!travel || travel.type !== "viewport_arc") {
      return {
        ...flyingObject,
        phase: "active" as const,
        x: (object.x + 0.5) * map.tileSize,
        y: (object.y + 0.5) * map.tileSize,
      };
    }

    let next = flyingObject;
    const markerX = object.x * map.tileSize;
    if (next.phase === "waiting" && camera.x + viewportWidth >= markerX) {
      next = {
        ...next,
        phase: "active",
        startTick: state.tick,
        startCameraX: camera.x,
        startCameraY: camera.y,
      };
    }
    if (next.phase !== "active" || next.startTick === null) return next;

    const durationTicks = Math.max(
      1,
      Math.round((travel.durationMs / 1000) * FIXED_TICK_RATE),
    );
    const progress = clamp((state.tick - next.startTick) / durationTicks, 0, 1);
    const padding = travel.offscreenPaddingTiles * map.tileSize + map.tileSize / 2;
    const viewportLeft = next.startCameraX;
    const viewportRight = next.startCameraX + viewportWidth;
    const startX = travel.entryEdge === "right" ? viewportRight + padding : viewportLeft - padding;
    const endX = travel.exitEdge === "right" ? viewportRight + padding : viewportLeft - padding;
    const startY = next.startCameraY + (travel.entryRow + 0.5) * map.tileSize;
    const endY = next.startCameraY + (travel.exitRow + 0.5) * map.tileSize;
    const middleX = (startX + endX) / 2;
    const middleY = (startY + endY) / 2;
    const archDirection = travel.archDirection === "up" ? -1 : 1;
    const controlY = middleY + archDirection * travel.archHeightTiles * map.tileSize * 2;

    return {
      ...next,
      phase: progress >= 1 ? "complete" as const : "active" as const,
      x: quadraticBezier(startX, middleX, endX, progress),
      y: quadraticBezier(startY, controlY, endY, progress),
    };
  });
}

function processTriggers(
  map: PlatformerMapSpec,
  state: PlatformerState,
  events: RuntimeEvent[],
) {
  if (state.y > map.size.rows * map.tileSize + map.tileSize) return beginDeath(map, state, events);
  const bounds = playerBounds(state);

  for (let row = 0; row < map.size.rows; row += 1) {
    for (let column = 0; column < map.size.columns; column += 1) {
      if (collisionAt(map, column, row) !== "hazard") continue;
      if (overlaps(bounds, {
        left: column * map.tileSize,
        right: (column + 1) * map.tileSize,
        top: row * map.tileSize,
        bottom: (row + 1) * map.tileSize,
      })) return beginDeath(map, state, events);
    }
  }

  const goal = map.objects.find(
    (object) => object.type === "goal" && overlaps(bounds, objectBounds(map, object)),
  );
  const livingBoss = state.enemies.some((enemy) => enemy.role === "boss" && !enemy.defeated);
  if (goal && !livingBoss) {
    events.push({ type: "goal", objectId: goal.id });
    return { ...state, vx: 0, vy: 0, status: "won" as const };
  }

  let next = state;
  const checkpoint = map.objects.find(
    (object) => object.type === "checkpoint" && overlaps(bounds, objectBounds(map, object)),
  );
  if (checkpoint && checkpoint.id !== state.latestCheckpointId) {
    const position = spawnPosition(map, checkpoint);
    next = {
      ...next,
      latestCheckpointId: checkpoint.id,
      checkpointX: position.x,
      checkpointY: position.y,
    };
    events.push({ type: "checkpoint", objectId: checkpoint.id });
  }

  for (const object of map.objects) {
    if (
      object.type !== "extra_life" ||
      next.extraLifeCollectedAtTick[object.id] !== undefined ||
      !overlaps(bounds, objectBounds(map, object))
    ) continue;
    next = {
      ...next,
      lives: next.lives + 1,
      extraLifeCollectedAtTick: {
        ...next.extraLifeCollectedAtTick,
        [object.id]: next.tick,
      },
    };
    events.push({ type: "extra_life", objectId: object.id });
  }

  for (const object of map.objects) {
    if (
      object.type !== "collectible" ||
      next.collectedIds.includes(object.id) ||
      !overlaps(bounds, objectBounds(map, object))
    ) continue;
    next = {
      ...next,
      collectedIds: [...next.collectedIds, object.id],
      collectibleCollectedAtTick: {
        ...next.collectibleCollectedAtTick,
        [object.id]: next.tick,
      },
      score: next.score + (object.pointValue ?? 1),
    };
    events.push({ type: "collectible", objectId: object.id });
  }

  return next;
}

function completeBossOnlyMapIfCleared(
  map: PlatformerMapSpec,
  state: PlatformerState,
) {
  const hasGoal = map.objects.some((object) => object.type === "goal");
  const bosses = state.enemies.filter((enemy) => enemy.role === "boss");
  if (hasGoal || bosses.length === 0 || bosses.some((boss) => !boss.defeated)) return state;
  return { ...state, vx: 0, vy: 0, status: "won" as const };
}

function processEnemyContact(
  map: PlatformerMapSpec,
  state: PlatformerState,
  events: RuntimeEvent[],
) {
  const player = playerBounds(state);
  for (const enemy of state.enemies) {
    if (enemy.defeated) continue;
    const bounds = enemyBounds(enemy);
    if (!overlaps(player, bounds)) continue;
    const previousBottom = state.previousY;
    const isStomp =
      state.vy > 0 &&
      previousBottom <= bounds.top + 8 &&
      enemy.defeatMode !== "weapon";
    if (isStomp) {
      const hitsRemaining = enemy.role === "boss"
        ? Math.max(0, enemy.hitsRemaining - 1)
        : 0;
      const defeated = hitsRemaining === 0;
      if (defeated) events.push({ type: "enemy_defeat", objectId: enemy.id });
      const next = {
        ...state,
        vy: -380,
        grounded: false,
        score: state.score + (defeated ? enemy.pointValue : 0),
        enemies: state.enemies.map((candidate) =>
          candidate.id === enemy.id
            ? {
                ...candidate,
                hitsRemaining,
                hitReactionTicksRemaining:
                  candidate.role === "boss" && !defeated ? BOSS_HIT_REACTION_TICKS : 0,
                ramPhase: "idle" as const,
                ramArmed: false,
                ramWindupTicksRemaining: 0,
                ramDistanceRemaining: 0,
                moving: false,
                defeated,
              }
            : candidate,
        ),
      };
      return completeBossOnlyMapIfCleared(map, next);
    }
    return beginDeath(map, state, events);
  }
  return state;
}

function processWeaponContact(
  map: PlatformerMapSpec,
  weapon: WeaponSpec | undefined,
  state: PlatformerState,
  events: RuntimeEvent[],
) {
  if (!weapon || state.attackTicksRemaining <= 0) return state;
  const durationTicks = Math.max(1, Math.round((weapon.mechanics.attackDurationMs / 1000) * FIXED_TICK_RATE));
  const elapsedTicks = durationTicks - state.attackTicksRemaining;
  const activeStartTick = Math.floor((weapon.mechanics.activeStartMs / 1000) * FIXED_TICK_RATE);
  const activeEndTick = Math.ceil((weapon.mechanics.activeEndMs / 1000) * FIXED_TICK_RATE);
  if (elapsedTicks < activeStartTick || elapsedTicks > activeEndTick) return state;

  const reach = weapon.mechanics.reachTiles * map.tileSize;
  const attackBounds = state.facing === "right"
    ? { left: state.x, right: state.x + PLAYER_HALF_WIDTH + reach, top: state.y - PLAYER_HEIGHT, bottom: state.y }
    : { left: state.x - PLAYER_HALF_WIDTH - reach, right: state.x, top: state.y - PLAYER_HEIGHT, bottom: state.y };

  for (const enemy of state.enemies) {
    if (
      enemy.defeated ||
      enemy.defeatMode === "stomp" ||
      state.attackHitIds.includes(enemy.id)
    ) continue;
    if (!overlaps(attackBounds, enemyBounds(enemy))) continue;
    const hitsRemaining = Math.max(0, enemy.hitsRemaining - weapon.mechanics.damage);
    const defeated = hitsRemaining === 0;
    events.push({ type: "weapon_hit", objectId: enemy.id });
    if (defeated) events.push({ type: "enemy_defeat", objectId: enemy.id });
    const knockback = weapon.mechanics.knockbackTiles * map.tileSize;
    const knockbackDirection = enemy.x >= state.x ? 1 : -1;
    const next = {
      ...state,
      score: state.score + (defeated ? enemy.pointValue : 0),
      attackHitIds: [...state.attackHitIds, enemy.id],
      enemies: state.enemies.map((candidate) =>
        candidate.id === enemy.id
          ? {
              ...candidate,
              x: resolveEnemyKnockback(map, candidate, knockbackDirection * knockback),
              direction: resolveBossDirectionAfterWeaponHit(candidate, state.x),
              hitsRemaining,
              hitReactionTicksRemaining:
                candidate.role === "boss" && !defeated ? BOSS_HIT_REACTION_TICKS : 0,
              ramPhase: "idle" as const,
              ramArmed: false,
              ramWindupTicksRemaining: 0,
              ramDistanceRemaining: 0,
              moving: false,
              defeated,
            }
          : candidate,
      ),
    };
    return completeBossOnlyMapIfCleared(map, next);
  }
  return state;
}

export function stepPlatformer(
  map: PlatformerMapSpec,
  physicsSpec: PlatformerPhysicsSpec,
  current: PlatformerState,
  input: PlatformerInput,
  weapon?: WeaponSpec,
): StepResult {
  if (current.status === "dying") return advanceDeath(current);
  if (current.status !== "playing") return { state: current, events: [] };
  const events: RuntimeEvent[] = [];
  const spawn = map.objects.find((object) => object.type === "player_spawn");
  const physics = resolvePhysics(
    physicsSpec,
    map.tileSize,
    map.physics?.gravityScale ?? 1,
    map.physics?.groundTractionScale ?? DEFAULT_GROUND_TRACTION_SCALE,
    spawn?.speedPxPerSecond,
  );
  const jump = physicsSpec.verticalMovement.groundedJump;
  const moveX = clamp(input.moveX, -1, 1);
  let state: PlatformerState = {
    ...current,
    tick: current.tick + 1,
    previousY: current.y,
    facing: moveX < 0 ? "left" : moveX > 0 ? "right" : current.facing,
    attackTicksRemaining: Math.max(0, current.attackTicksRemaining - 1),
    attackCooldownTicksRemaining: Math.max(0, current.attackCooldownTicksRemaining - 1),
  };

  if (weapon && input.weaponPressed && current.attackCooldownTicksRemaining === 0) {
    state.attackTicksRemaining = Math.max(
      1,
      Math.round((weapon.mechanics.attackDurationMs / 1000) * FIXED_TICK_RATE),
    );
    state.attackCooldownTicksRemaining = Math.max(
      1,
      Math.round((weapon.mechanics.cooldownMs / 1000) * FIXED_TICK_RATE),
    );
    state.attackHitIds = [];
    events.push({ type: "weapon_swing" });
  }

  if (physicsSpec.verticalMovement.mode === "flight") {
    const flight = physicsSpec.verticalMovement.flight;
    const targetVx = moveX * physics.maximumRunSpeed;
    const targetVy =
      input.moveY < 0
        ? -flight.maximumRiseSpeedTilesPerSecond * map.tileSize
        : input.moveY > 0
          ? flight.maximumFallSpeedTilesPerSecond * map.tileSize
          : 0;
    const horizontalRate = physics.airAcceleration * FIXED_DELTA_SECONDS;
    const verticalMaximum = Math.max(
      flight.maximumRiseSpeedTilesPerSecond,
      flight.maximumFallSpeedTilesPerSecond,
    ) * map.tileSize;
    const verticalTime = targetVy === 0 ? flight.timeToStopSeconds : flight.timeToMaximumSpeedSeconds;
    state.vx = moveToward(state.vx, targetVx, horizontalRate);
    state.vy = moveToward(state.vy, targetVy, (verticalMaximum / verticalTime) * FIXED_DELTA_SECONDS);
    state.grounded = false;
    state.coyoteTicksRemaining = 0;
    state.jumpBufferTicksRemaining = 0;
  } else {
    state.jumpBufferTicksRemaining = input.jumpPressed
      ? jump.inputBufferTicks
      : Math.max(0, state.jumpBufferTicksRemaining - 1);
    state.coyoteTicksRemaining = state.grounded
      ? jump.coyoteTimeTicks
      : Math.max(0, state.coyoteTicksRemaining - 1);
    if (!input.jumpHeld) state.jumpReleaseArmed = true;

    const targetVx = moveX * physics.maximumRunSpeed;
    const acceleration = state.grounded
      ? moveX === 0
        ? physics.groundDeceleration
        : physics.groundAcceleration
      : physics.airAcceleration;
    state.vx = moveToward(state.vx, targetVx, acceleration * FIXED_DELTA_SECONDS);

    if (
      state.jumpBufferTicksRemaining > 0 &&
      state.coyoteTicksRemaining > 0 &&
      state.jumpReleaseArmed
    ) {
      state.vy = physics.jumpVelocity;
      state.grounded = false;
      state.jumpBufferTicksRemaining = 0;
      state.coyoteTicksRemaining = 0;
      state.jumpReleaseArmed = false;
      state.jumpCutApplied = false;
      events.push({ type: "jump" });
    }

    if (!input.jumpHeld && state.vy < 0 && !state.jumpCutApplied) {
      state.vy *= jump.earlyReleaseVelocityMultiplier;
      state.jumpCutApplied = true;
    }
  }

  const horizontal = resolveHorizontal(map, state.x, state.y, state.vx * FIXED_DELTA_SECONDS);
  state.x = horizontal.position;
  if (horizontal.hit) state.vx = 0;

  let dy: number;
  if (physicsSpec.verticalMovement.mode === "flight") {
    dy = state.vy * FIXED_DELTA_SECONDS;
  } else {
    dy =
      state.vy * FIXED_DELTA_SECONDS +
      0.5 * physics.gravity * FIXED_DELTA_SECONDS ** 2;
    state.vy = Math.min(
      state.vy + physics.gravity * FIXED_DELTA_SECONDS,
      physics.maximumFallSpeed,
    );
  }
  const wasGrounded = state.grounded;
  const vertical = resolveVertical(map, state.x, state.y, dy);
  state.y = vertical.position;
  state.grounded = vertical.grounded;
  if (vertical.springId) {
    const spring = map.objects.find((object) => object.id === vertical.springId);
    const launchSpeed = clamp(
      spring?.launchSpeedPxPerSecond ?? DEFAULT_PLATFORM_SPRING_LAUNCH_SPEED,
      MINIMUM_PLATFORM_SPRING_LAUNCH_SPEED,
      MAXIMUM_PLATFORM_SPRING_LAUNCH_SPEED,
    );
    state.vy = -launchSpeed;
    state.grounded = false;
    state.coyoteTicksRemaining = 0;
    state.jumpBufferTicksRemaining = 0;
    state.jumpReleaseArmed = false;
    state.jumpCutApplied = true;
    state.springCompressedAtTick = {
      ...state.springCompressedAtTick,
      [vertical.springId]: state.tick,
    };
    events.push({ type: "platform_spring", objectId: vertical.springId });
  } else if (vertical.hit) {
    state.vy = 0;
  }
  if (!wasGrounded && state.grounded) events.push({ type: "land" });

  state.enemies = updateEnemies(map, state);
  state.flyingObjects = updateFlyingObjects(map, state);
  state = processTriggers(map, state, events);
  if (state.status === "playing") state = processWeaponContact(map, weapon, state, events);
  if (state.status === "playing") state = updateEnemyProjectiles(map, state, events);
  if (state.status === "playing") state = processEnemyContact(map, state, events);
  return { state, events };
}
