import type { MotionSpec } from "../motion";

export type MazeDirection = "down" | "left" | "right" | "up";

export type MazeMapObject = {
  id: string;
  type: "player_spawn" | "key" | "exit" | "enemy_spawn" | "hazard" | "obstacle";
  x: number;
  y: number;
  slot?: number;
  requires?: string;
  assetId?: string;
  direction?: MazeDirection;
  speed?: number;
  behavior?: "chaser" | "wanderer";
  detectionRadius?: number;
  wanderRadiusTiles?: number;
  contactDamage?: number;
  target?: "nearest_player";
  motion?: MotionSpec;
};

export type MazeMapSpec = {
  schemaVersion: number;
  id: string;
  revision: number;
  runtime: "top_down_v1";
  tileSize: 64;
  width: number;
  height: number;
  camera: { columns: number; rows: number };
  legend: { "#": "solid_wall"; ".": "floor" };
  presentation: {
    mazeThemeId: string;
    victoryEffectId?: string | null;
  };
  tiles: string[];
  objects: MazeMapObject[];
};

export type MazeInput = {
  moveX: number;
  moveY: number;
  jumpPressed?: boolean;
};

export type MazeJumpState = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  ticksElapsed: number;
  totalTicks: number;
  targetEnemyId: string | null;
};

export type MazeRuntimeEvent = {
  type:
    | "jump"
    | "land"
    | "collectible"
    | "enemy_defeat"
    | "player_death"
    | "respawn"
    | "goal";
};

export type MazeState = {
  tick: number;
  x: number;
  y: number;
  direction: MazeDirection;
  moving: boolean;
  jump: MazeJumpState | null;
  stompGraceTicksRemaining: number;
  deathTicksRemaining: number;
  respawnGraceTicksRemaining: number;
  enemies: MazeEnemyState[];
  collectedKeyId: string | null;
  status: "playing" | "dying" | "won";
};

export type MazeEnemyState = {
  id: string;
  x: number;
  y: number;
  originX: number;
  originY: number;
  direction: MazeDirection;
  wanderDirection: MazeDirection;
  moving: boolean;
  defeated: boolean;
};

export type MazeCamera = { x: number; y: number };
