import type { MotionSpec } from "@/game/motion";

export const DEFAULT_ENEMY_SPEED_PX_PER_SECOND = 48;
export const DEFAULT_BOSS_HITS_TO_DEFEAT = 5;
export const DEFAULT_ENEMY_DEFEAT_MODE = "both" as const;

export const ENEMY_SPEED_PRESETS = {
  slow: 32,
  normal: 48,
  fast: 80,
} as const;

export const ENEMY_DEFEAT_MODE_LABELS = {
  stomp: "Jump only",
  weapon: "Weapon only",
  both: "Jump or weapon",
} as const;

export const ENEMY_TRAVEL_OPTIONS = [
  { value: "stationary", label: "Fixed position" },
  { value: "behavior", label: "Follow behavior" },
  { value: "ramming", label: "Ramming charge" },
  { value: "circle", label: "Circle a grid" },
] as const;

export const BODY_MOTION_OPTIONS = [
  { value: "none", label: "None" },
  { value: "bob", label: "Bobbing" },
  { value: "peck", label: "Pecking" },
] as const;

const DEFAULT_BOB_HEIGHT_TILES = 0.15;
const DEFAULT_BOB_PERIOD_MS = 1200;
const DEFAULT_PECK_DISTANCE_TILES = 0.2;
const DEFAULT_PECK_PERIOD_MS = 1400;
export const DEFAULT_RAMMING_DELAY_MS = 1000;
export const DEFAULT_RAMMING_DISTANCE_TILES = 3;
export const DEFAULT_CIRCLE_GRID_SIZE_TILES = 5;
export const DEFAULT_CIRCLE_DIRECTION = "clockwise" as const;
export const DEFAULT_CIRCLE_DURATION_MS = 4000;

export function defaultEnemyMotion(): MotionSpec {
  return {
    version: 1,
    travel: { type: "behavior" },
    visual: { type: "none" },
  };
}

export function defaultRammingTravel(): Extract<MotionSpec["travel"], { type: "ramming" }> {
  return {
    type: "ramming",
    chargeDelayMs: DEFAULT_RAMMING_DELAY_MS,
    distanceTiles: DEFAULT_RAMMING_DISTANCE_TILES,
  };
}

export function defaultCircleTravel(): Extract<MotionSpec["travel"], { type: "circle" }> {
  return {
    type: "circle",
    gridSizeTiles: DEFAULT_CIRCLE_GRID_SIZE_TILES,
    direction: DEFAULT_CIRCLE_DIRECTION,
    durationMs: DEFAULT_CIRCLE_DURATION_MS,
  };
}

export function defaultBobVisual(): Extract<MotionSpec["visual"], { type: "bob" }> {
  return {
    type: "bob",
    heightTiles: DEFAULT_BOB_HEIGHT_TILES,
    periodMs: DEFAULT_BOB_PERIOD_MS,
  };
}

export function defaultPeckVisual(): Extract<MotionSpec["visual"], { type: "peck" }> {
  return {
    type: "peck",
    distanceTiles: DEFAULT_PECK_DISTANCE_TILES,
    periodMs: DEFAULT_PECK_PERIOD_MS,
  };
}

export function enemyMotionFromSettings(
  motion: MotionSpec | undefined,
): MotionSpec {
  return motion ?? defaultEnemyMotion();
}

export function speedPresetForValue(speedPxPerSecond: number | undefined) {
  const speed = speedPxPerSecond ?? DEFAULT_ENEMY_SPEED_PX_PER_SECOND;
  if (speed <= ENEMY_SPEED_PRESETS.slow) return "slow";
  if (speed >= ENEMY_SPEED_PRESETS.fast) return "fast";
  return "normal";
}
