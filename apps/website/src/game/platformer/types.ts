import type { MotionSpec } from "../motion";

export type { MotionSpec } from "../motion";

export type CollisionKind = "none" | "solid" | "one_way" | "hazard";

export type MapLegendEntry = {
  visualSlot: "empty" | "ground" | "platform" | "obstacle" | "hazard";
  collision: CollisionKind;
};

export type PlatformerMapObject = {
  id: string;
  type:
    | "player_spawn"
    | "collectible"
    | "extra_life"
    | "platform_spring"
    | "checkpoint"
    | "goal"
    | "enemy_spawn"
    | "flying_object";
  x: number;
  y: number;
  pointValue?: number;
  role?: "enemy" | "boss";
  viewMusicCue?: string;
  assetId?: string;
  launchSpeedPxPerSecond?: number;
  behavior?: "patroller" | "chaser";
  direction?: "left" | "right";
  patrolLeftTiles?: number;
  patrolRightTiles?: number;
  viewLeftTiles?: number;
  viewRightTiles?: number;
  speedPxPerSecond?: number;
  defeatMode?: "stomp" | "weapon" | "both";
  hitsToDefeat?: number;
  rangedAttack?:
    | {
        type: "fireball";
        projectileAssetId: string;
        rangeTiles: number;
        cooldownMs: number;
        sizeScale?: number;
      }
    | {
        type: "lobbed_projectile";
        projectileAssetId: string;
        rangeTiles: number;
        cooldownMs: number;
        arcHeightTiles: number;
      }
    | {
        type: "laser_beam";
        rangeTiles: number;
        cooldownMs: number;
        chargeMs: number;
        durationMs: number;
      };
  motion?: MotionSpec;
};

export type PlatformerMapSpec = {
  schemaVersion: number;
  id: string;
  revision: number;
  runtime: "platformer_v1";
  tileSize: 64;
  size: { columns: number; rows: number };
  camera: { columns: number; rows: number };
  physics: {
    gravityScale: number;
    groundTractionScale?: number;
  };
  rules: {
    respawnDelaySeconds: number;
  };
  presentation: {
    backgroundId: string;
    victoryEffectId?: string;
    gameOverEffectId?: string;
    hud?: Array<{
      id: string;
      type: "lives" | "coins";
      column: number;
      row: number;
    }>;
  };
  legend: Record<string, MapLegendEntry>;
  layers: Array<{
    id: string;
    rows: string[];
    spriteOverrides?: Array<{
      x: number;
      y: number;
      assetId?: string;
      animationStartFrame?: number;
    }>;
  }>;
  objects: PlatformerMapObject[];
};

export type PlatformerPhysicsSpec = {
  id: string;
  revision: number;
  runtime: "platformer_v1";
  movement: {
    maximumRunSpeedTilesPerSecond: number;
    groundTimeToMaximumSpeedSeconds: number;
    groundTimeToStopSeconds: number;
    airTimeToMaximumSpeedSeconds: number;
  };
  verticalMovement: {
    mode: "grounded_jump" | "flight";
    groundedJump: {
      jumpHeightTiles: number;
      timeToApexSeconds: number;
      maximumFallSpeedTilesPerSecond: number;
      coyoteTimeTicks: number;
      inputBufferTicks: number;
      earlyReleaseVelocityMultiplier: number;
    };
    flight: {
      maximumRiseSpeedTilesPerSecond: number;
      maximumFallSpeedTilesPerSecond: number;
      timeToMaximumSpeedSeconds: number;
      timeToStopSeconds: number;
    };
  };
};

export type PlatformerInput = {
  moveX: number;
  moveY: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
  weaponPressed: boolean;
};

export type WeaponSpec = {
  id: string;
  mechanics: {
    damage: number;
    reachTiles: number;
    attackDurationMs: number;
    activeStartMs: number;
    activeEndMs: number;
    cooldownMs: number;
    knockbackTiles: number;
  };
  visual: {
    spriteAssetId: string;
    attackEventId: string;
    grip: { x: number; y: number };
    characters: Record<
      string,
      {
        directions: Record<
          "left" | "right",
          Array<{
            offsetX: number;
            offsetY: number;
            rotationDegrees: number;
            layer: "behind" | "front";
          }>
        >;
      }
    >;
  };
};

export type EnemyState = {
  id: string;
  role: "enemy" | "boss";
  viewMusicCue?: string;
  assetId: string;
  behavior: "patroller" | "chaser";
  direction: "left" | "right";
  x: number;
  y: number;
  startX: number;
  startY: number;
  circleTicks: number;
  speed: number;
  patrolLeftTiles: number;
  patrolRightTiles: number;
  viewLeftTiles: number;
  viewRightTiles: number;
  pointValue: number;
  defeatMode: "stomp" | "weapon" | "both";
  hitsRemaining: number;
  hitReactionTicksRemaining: number;
  ramPhase: "idle" | "windup" | "charge";
  ramArmed: boolean;
  ramDirection: "left" | "right";
  ramWindupTicksRemaining: number;
  ramDistanceRemaining: number;
  nextRangedAttackTick: number | null;
  moving: boolean;
  defeated: boolean;
};

export type EnemyProjectileState = {
  id: string;
  enemyId: string;
  assetId: string;
  attackType: "fireball" | "lobbed_projectile";
  direction: "left" | "right";
  sizeScale: number;
  spawnTick: number;
  ageTicks: number;
  durationTicks: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  arcHeight: number;
  x: number;
  y: number;
};

export type EnemyLaserBeamState = {
  id: string;
  enemyId: string;
  direction: "left" | "right";
  spawnTick: number;
  ageTicks: number;
  chargeTicks: number;
  durationTicks: number;
  rangePixels: number;
  startX: number;
  startY: number;
  endX: number;
};

export type FlyingObjectState = {
  id: string;
  assetId: string;
  phase: "waiting" | "active" | "complete";
  startTick: number | null;
  startCameraX: number;
  startCameraY: number;
  x: number;
  y: number;
};

export type RuntimeEvent =
  | { type: "jump" }
  | { type: "land" }
  | { type: "collectible"; objectId: string }
  | { type: "extra_life"; objectId: string }
  | { type: "platform_spring"; objectId: string }
  | { type: "checkpoint"; objectId: string }
  | { type: "enemy_defeat"; objectId: string }
  | { type: "weapon_swing" }
  | { type: "weapon_hit"; objectId: string }
  | { type: "fire"; objectId: string }
  | { type: "player_damage" }
  | { type: "player_death" }
  | { type: "respawn" }
  | { type: "goal"; objectId: string }
  | { type: "game_over" };

export type PlatformerState = {
  tick: number;
  x: number;
  y: number;
  previousY: number;
  vx: number;
  vy: number;
  grounded: boolean;
  facing: "left" | "right";
  coyoteTicksRemaining: number;
  jumpBufferTicksRemaining: number;
  jumpReleaseArmed: boolean;
  jumpCutApplied: boolean;
  attackTicksRemaining: number;
  attackCooldownTicksRemaining: number;
  attackHitIds: string[];
  deathTicksRemaining: number;
  deathTicksTotal: number;
  deathAnimationTicksTotal: number;
  spawnX: number;
  spawnY: number;
  latestCheckpointId: string | null;
  checkpointX: number;
  checkpointY: number;
  collectedIds: string[];
  collectibleCollectedAtTick: Record<string, number>;
  extraLifeCollectedAtTick: Record<string, number>;
  springCompressedAtTick: Record<string, number>;
  score: number;
  lives: number;
  status: "playing" | "dying" | "won" | "game_over";
  enemies: EnemyState[];
  projectiles: EnemyProjectileState[];
  laserBeams: EnemyLaserBeamState[];
  flyingObjects: FlyingObjectState[];
};

export type StepResult = {
  state: PlatformerState;
  events: RuntimeEvent[];
};
