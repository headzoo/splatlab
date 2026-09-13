"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { MAP_COMPLETION_DELAY_SECONDS } from "./campaign";
import { drawBossHealthBar } from "./boss-health-bar";
import {
  createInitialState,
  FIXED_DELTA_SECONDS,
  interpolatePlatformerState,
  MAX_CATCH_UP_STEPS,
  MAX_FRAME_DELTA_SECONDS,
  resolveCollectiblePoofFrame,
  resolveEnemyFacingDirection,
  resolveEnemyViewMusicCue,
  resolveExtraLifeFireworkFrame,
  resolveExtraLifeOpacity,
  resolvePlatformSpringCompressionFrame,
  resolvePlatformerCamera,
  snapPlatformerStateToGrid,
  resolveVisualMotionOffset,
  resolveWorldBottomBackgroundOffset,
  stepPlatformer,
  type PlatformerCamera,
} from "./engine";
import type {
  PlatformerInput,
  PlatformerMapSpec,
  PlatformerPhysicsSpec,
  PlatformerState,
  RuntimeEvent,
  WeaponSpec,
} from "./types";
import {
  isCustomizableHumanAsset,
  loadSpriteImage,
  recolorHumanSprite,
} from "@/game/player-appearance";
import type {
  HairColor,
  PlatformerTerrainKind,
  PlayerAssetId,
  SkinTone,
} from "@/lib/game-contract";
import {
  PLATFORMER_OBJECT_TOOLS,
  platformerObjectAtPreviewCell,
  platformerPreviewCellForObject,
  platformerTerrainKindAt,
  type PlatformerEditTool,
  type PlatformerObjectPlacement,
  type PlatformerTerrainStrokeCell,
} from "./map-editing";
import {
  playerAttackEventVisual,
  playerWeaponAttackPose,
} from "./player-attack";
import {
  playerDefeatedEventSheet,
  playerDefeatedEventVisual,
} from "./player-death";
import styles from "./platformer-game.module.css";

type PlatformerGameProps = {
  map: PlatformerMapSpec;
  physics: PlatformerPhysicsSpec;
  weapon: WeaponSpec;
  playerAssetId?: PlayerAssetId;
  skinTone?: SkinTone;
  hairColor?: HairColor;
  className?: string;
  controlRowLeading?: ReactNode;
  autoPlay?: boolean;
  editorTool?: PlatformerEditTool;
  onEditorToolChange?: (tool: PlatformerEditTool) => void;
  onTerrainStroke?: (stroke: readonly PlatformerTerrainStrokeCell[]) => void;
  onObjectPlace?: (placement: PlatformerObjectPlacement) => void;
  selectedObjectId?: string | null;
  onObjectSelect?: (objectId: string | null) => void;
  onComplete?: () => void;
};

type ControlAction = "left" | "right" | "down" | "jump" | "weapon";
type ControlBindings = Record<ControlAction, string[]>;
type CapturingBinding = { action: ControlAction; index: number } | null;
type EditorCell = { x: number; y: number };
type EditorPaintStroke = {
  pointerId: number;
  kind: PlatformerTerrainKind;
  cells: Map<string, PlatformerTerrainStrokeCell>;
  lastCell: EditorCell;
};
type EditorPan = {
  pointerId: number;
  clientX: number;
  clientY: number;
  camera: PlatformerCamera;
};

const CONTROL_BINDINGS_STORAGE_KEY = "splat-lab.game-controls.v1";
const CONTROL_ACTIONS: ControlAction[] = ["left", "right", "down", "jump", "weapon"];
const CONTROL_ACTION_LABELS: Record<ControlAction, string> = {
  left: "Move left",
  right: "Move right",
  down: "Move down",
  jump: "Jump",
  weapon: "Sword",
};
const DEFAULT_CONTROL_BINDINGS: ControlBindings = {
  left: ["a", "ArrowLeft"],
  right: ["d", "ArrowRight"],
  down: ["s", "ArrowDown"],
  jump: [" ", "e", "ArrowUp"],
  weapon: ["x"],
};

function copyDefaultControlBindings(): ControlBindings {
  return {
    left: [...DEFAULT_CONTROL_BINDINGS.left],
    right: [...DEFAULT_CONTROL_BINDINGS.right],
    down: [...DEFAULT_CONTROL_BINDINGS.down],
    jump: [...DEFAULT_CONTROL_BINDINGS.jump],
    weapon: [...DEFAULT_CONTROL_BINDINGS.weapon],
  };
}

function normalizeControlKey(key: string): string | null {
  if (key === " " || key === "Space" || key === "Spacebar") return " ";
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key)) return key;
  if (/^[a-z0-9]$/i.test(key)) return key.toLowerCase();
  return null;
}

function displayControlKey(key: string): string {
  if (key === " ") return "Space";
  if (key === "ArrowLeft") return "←";
  if (key === "ArrowRight") return "→";
  if (key === "ArrowUp") return "↑";
  if (key === "ArrowDown") return "↓";
  return key.toUpperCase();
}

function joinControlKeys(keys: string[]): string {
  const displayed = keys.map(displayControlKey);
  if (displayed.length < 2) return displayed[0] ?? "";
  if (displayed.length === 2) return displayed.join(" or ");
  return `${displayed.slice(0, -1).join(", ")}, or ${displayed.at(-1)}`;
}

function controlSummary(bindings: ControlBindings): string {
  const movePairs = bindings.left.map(
    (left, index) => `${displayControlKey(left)}/${displayControlKey(bindings.right[index] ?? bindings.right[0])}`,
  );
  return `Move: ${movePairs.join(" or ")} · Jump: ${joinControlKeys(bindings.jump)} · Sword: ${joinControlKeys(bindings.weapon)}`;
}

function isControlBindings(value: unknown): value is ControlBindings {
  if (!value || typeof value !== "object") return false;
  const bindings = value as Partial<Record<ControlAction, unknown>>;
  return CONTROL_ACTIONS.every((action) => {
    const keys = bindings[action];
    return Array.isArray(keys) &&
      keys.length === DEFAULT_CONTROL_BINDINGS[action].length &&
      keys.every((key) => typeof key === "string" && normalizeControlKey(key) === key);
  });
}

const assetUrl = (path: string) => `/game-assets/${path}`;

const IMAGE_URLS = {
  greenBackgroundFar: assetUrl("backgrounds/background_neutral_green_hills_castle_far_01.png"),
  greenBackgroundMid: assetUrl("backgrounds/background_neutral_green_hills_waterfalls_mid_01.png"),
  greenBackgroundNear: assetUrl("backgrounds/background_neutral_green_hills_foliage_near_01.png"),
  spaceBackgroundFar: assetUrl("backgrounds/background_space_stars_far_01.png"),
  spaceBackgroundMid: assetUrl("backgrounds/background_space_moon_mid_01.png"),
  spaceBackgroundNear: assetUrl("backgrounds/background_space_station_near_01.png"),
  hauntedBackground: assetUrl("backgrounds/background_haunted_graveyard_01.png"),
  dragonsBackgroundFar: assetUrl("backgrounds/background_dragons_ash_far_01.png"),
  dragonsBackgroundMid: assetUrl("backgrounds/background_dragons_volcano_mid_01.png"),
  dragonsBackgroundNear: assetUrl("backgrounds/background_dragons_ruins_near_01.png"),
  iceBackgroundFar: assetUrl("backgrounds/background_ice_world_mountains_far_01.png"),
  iceBackgroundMid: assetUrl("backgrounds/background_ice_world_glaciers_mid_01.png"),
  iceBackgroundNear: assetUrl("backgrounds/background_ice_world_crystals_near_01.png"),
  greenGround: assetUrl("sprites/neutral_green_hills_platformer_ground_01.png"),
  greenPlatform: assetUrl("sprites/neutral_green_hills_platformer_platform_01.png"),
  greenObstacle: assetUrl("sprites/neutral_green_hills_platformer_obstacle_01.png"),
  greenHazard: assetUrl("sprites/neutral_green_hills_platformer_hazard_01.png"),
  spaceGround: assetUrl("sprites/space_platformer_ground_01.png"),
  spacePlatform: assetUrl("sprites/space_platformer_platform_01.png"),
  spaceObstacle: assetUrl("sprites/space_platformer_obstacle_01.png"),
  spaceHazard: assetUrl("sprites/space_platformer_hazard_01.png"),
  hauntedGround: assetUrl("sprites/haunted_graveyard_platformer_ground_01.png"),
  hauntedPlatform: assetUrl("sprites/haunted_graveyard_platformer_platform_01.png"),
  hauntedObstacle: assetUrl("sprites/haunted_graveyard_platformer_obstacle_01.png"),
  hauntedHazard: assetUrl("sprites/haunted_graveyard_platformer_hazard_01.png"),
  haunted_graveyard_platformer_spring_01: assetUrl("sprites/haunted_graveyard_platformer_spring_01.png"),
  haunted_graveyard_platformer_spring_01_compressed: assetUrl("sprites/haunted_graveyard_platformer_spring_01_compressed.png"),
  dragonsGround: assetUrl("sprites/dragons_emberkeep_platformer_ground_01.png"),
  dragonsPlatform: assetUrl("sprites/dragons_emberkeep_platformer_platform_01.png"),
  dragonsObstacle: assetUrl("sprites/dragons_emberkeep_platformer_obstacle_01.png"),
  dragonsHazard: assetUrl("sprites/dragons_emberkeep_platformer_hazard_01.png"),
  iceGround: assetUrl("sprites/ice_world_platformer_ground_01.png"),
  icePlatform: assetUrl("sprites/ice_world_platformer_platform_01.png"),
  iceObstacle: assetUrl("sprites/ice_world_platformer_obstacle_01.png"),
  iceHazard: assetUrl("sprites/ice_world_platformer_hazard_01.png"),
  ice_world_cooper_01: assetUrl("sprites/ice_world_cooper_01.png"),
  ice_world_human_01: assetUrl("sprites/ice_world_human_01.png"),
  ice_world_girl_01: assetUrl("sprites/ice_world_girl_01.png"),
  ice_world_ghost_01: assetUrl("sprites/ice_world_ghost_01.png"),
  ice_world_robot_01: assetUrl("sprites/ice_world_robot_01.png"),
  ice_world_platformer_spring_01: assetUrl("sprites/ice_world_platformer_spring_01.png"),
  ice_world_platformer_spring_01_compressed: assetUrl("sprites/ice_world_platformer_spring_01_compressed.png"),
  neutral_cooper_01: assetUrl("sprites/neutral_cooper_01.png"),
  neutral_human_01: assetUrl("sprites/neutral_human_01.png"),
  neutral_girl_01: assetUrl("sprites/neutral_girl_01.png"),
  neutral_ghost_01: assetUrl("sprites/neutral_ghost_01.png"),
  neutral_robot_01: assetUrl("sprites/neutral_robot_01.png"),
  haunted_cooper_01: assetUrl("sprites/haunted_cooper_01.png"),
  haunted_human_01: assetUrl("sprites/haunted_human_01.png"),
  haunted_girl_01: assetUrl("sprites/haunted_girl_01.png"),
  haunted_ghost_01: assetUrl("sprites/haunted_ghost_01.png"),
  haunted_robot_01: assetUrl("sprites/haunted_robot_01.png"),
  space_cooper_01: assetUrl("sprites/space_cooper_01.png"),
  space_human_01: assetUrl("sprites/space_human_01.png"),
  space_girl_01: assetUrl("sprites/space_girl_01.png"),
  space_ghost_01: assetUrl("sprites/space_ghost_01.png"),
  space_robot_01: assetUrl("sprites/space_robot_01.png"),
  dragon_cooper_01: assetUrl("sprites/dragon_cooper_01.png"),
  dragon_human_01: assetUrl("sprites/dragon_human_01.png"),
  dragon_girl_01: assetUrl("sprites/dragon_girl_01.png"),
  dragon_ghost_01: assetUrl("sprites/dragon_ghost_01.png"),
  space_cooper_01_attack: assetUrl("sprites/space_cooper_01_attack.png"),
  space_human_01_attack: assetUrl("sprites/space_human_01_attack.png"),
  space_cooper_01_defeated: assetUrl("sprites/space_cooper_01_defeated.png"),
  space_human_01_defeated: assetUrl("sprites/space_human_01_defeated.png"),
  space_ghost_01_defeated: assetUrl("sprites/space_ghost_01_defeated.png"),
  space_robot_01_defeated: assetUrl("sprites/space_robot_01_defeated.png"),
  weapon: assetUrl("sprites/short_sword_v1.png"),
  spaceCoin: assetUrl("sprites/space_platformer_coin_01.png"),
  spaceCoinCollected: assetUrl("sprites/space_platformer_coin_01_collected.png"),
  spaceCheckpoint: assetUrl("sprites/space_platformer_checkpoint_01.png"),
  spaceGoal: assetUrl("sprites/space_platformer_goal_01.png"),
  dragonsCoin: assetUrl("sprites/dragons_emberkeep_platformer_coin_01.png"),
  dragonsCoinCollected: assetUrl("sprites/dragons_emberkeep_platformer_coin_01_collected.png"),
  iceCoin: assetUrl("sprites/ice_world_platformer_coin_01.png"),
  iceCoinCollected: assetUrl("sprites/ice_world_platformer_coin_01_collected.png"),
  dragonsCheckpoint: assetUrl("sprites/dragons_emberkeep_platformer_checkpoint_01.png"),
  dragonsGoal: assetUrl("sprites/dragons_emberkeep_platformer_goal_01.png"),
  hudCoin: assetUrl("sprites/space_platformer_hud_coins_01.png"),
  hudLife: assetUrl("sprites/space_platformer_hud_lives_01.png"),
  victory: assetUrl("sprites/shared_victory_burst_01.png"),
  neutral_zombie_01: assetUrl("sprites/neutral_zombie_01.png"),
  neutral_green_hills_boss_01: assetUrl("sprites/neutral_green_hills_boss_01.png"),
  neutral_green_hills_flying_cooper_01: assetUrl("sprites/neutral_green_hills_flying_cooper_01.png"),
  space_boss_01: assetUrl("sprites/space_boss_01.png"),
  haunted_spirit_orb_01: assetUrl("sprites/haunted_spirit_orb_01.png"),
  haunted_boss_01: assetUrl("sprites/haunted_boss_01.png"),
  haunted_flying_cooper_bat_01: assetUrl("sprites/haunted_flying_cooper_bat_01.png"),
  haunted_tombstone_01: assetUrl("sprites/haunted_tombstone_01.png"),
  haunted_graveyard_flaming_pumpkin_01: assetUrl("sprites/haunted_graveyard_flaming_pumpkin_01.png"),
  dragon_dragon_01: assetUrl("sprites/dragon_dragon_01.png"),
  dragons_emberkeep_fireball_01: assetUrl("sprites/dragons_emberkeep_fireball_01.png"),
  dragons_emberkeep_flying_fireball_01: assetUrl("sprites/dragons_emberkeep_flying_fireball_01.png"),
  dragons_emberkeep_boss_01: assetUrl("sprites/dragons_emberkeep_boss_01.png"),
  ice_world_boss_01: assetUrl("sprites/ice_world_boss_01.png"),
  ice_world_crystal_projectile_01: assetUrl("sprites/ice_world_crystal_projectile_01.png"),
} as const;

type ImageKey = keyof typeof IMAGE_URLS;

type MapVisualProfile = {
  color: string;
  backgroundLayers: Array<{
    image: ImageKey;
    parallax: number;
    heightRatio: number;
    opacity: number;
    verticalAnchor: "center" | "bottom";
  }>;
  ground: ImageKey;
  platform: ImageKey;
  obstacle: ImageKey;
  hazard: ImageKey;
  hazardColumns: number;
  hazardFrames: number;
  coin: ImageKey;
  coinCollected: ImageKey;
  checkpoint: ImageKey;
  goal: ImageKey;
};

const GREEN_HILLS_VISUALS: MapVisualProfile = {
  color: "#4dbcf2",
  backgroundLayers: [
    { image: "greenBackgroundFar", parallax: 0.1, heightRatio: 1, opacity: 0.78, verticalAnchor: "center" },
    { image: "greenBackgroundMid", parallax: 0.34, heightRatio: 0.94, opacity: 0.88, verticalAnchor: "bottom" },
    { image: "greenBackgroundNear", parallax: 0.66, heightRatio: 0.82, opacity: 0.94, verticalAnchor: "bottom" },
  ],
  ground: "greenGround",
  platform: "greenPlatform",
  obstacle: "greenObstacle",
  hazard: "greenHazard",
  hazardColumns: 2,
  hazardFrames: 4,
  coin: "spaceCoin",
  coinCollected: "spaceCoinCollected",
  checkpoint: "spaceCheckpoint",
  goal: "spaceGoal",
};

const MAP_VISUALS: Record<string, MapVisualProfile> = {
  neutral_green_hills_01: GREEN_HILLS_VISUALS,
  space_orbital_outpost_01: {
    color: "#07091d",
    backgroundLayers: [
      { image: "spaceBackgroundFar", parallax: 0.12, heightRatio: 1, opacity: 0.72, verticalAnchor: "center" },
      { image: "spaceBackgroundMid", parallax: 0.38, heightRatio: 0.94, opacity: 0.86, verticalAnchor: "bottom" },
      { image: "spaceBackgroundNear", parallax: 0.68, heightRatio: 0.82, opacity: 0.92, verticalAnchor: "bottom" },
    ],
    ground: "spaceGround",
    platform: "spacePlatform",
    obstacle: "spaceObstacle",
    hazard: "spaceHazard",
    hazardColumns: 2,
    hazardFrames: 4,
    coin: "spaceCoin",
    coinCollected: "spaceCoinCollected",
    checkpoint: "spaceCheckpoint",
    goal: "spaceGoal",
  },
  haunted_graveyard_01: {
    color: "#17143f",
    backgroundLayers: [
      { image: "hauntedBackground", parallax: 0.24, heightRatio: 1, opacity: 1, verticalAnchor: "bottom" },
    ],
    ground: "hauntedGround",
    platform: "hauntedPlatform",
    obstacle: "hauntedObstacle",
    hazard: "hauntedHazard",
    hazardColumns: 4,
    hazardFrames: 8,
    coin: "spaceCoin",
    coinCollected: "spaceCoinCollected",
    checkpoint: "spaceCheckpoint",
    goal: "spaceGoal",
  },
  dragons_emberkeep_01: {
    color: "#241225",
    backgroundLayers: [
      { image: "dragonsBackgroundFar", parallax: 0.1, heightRatio: 1, opacity: 0.58, verticalAnchor: "center" },
      { image: "dragonsBackgroundMid", parallax: 0.34, heightRatio: 0.94, opacity: 0.88, verticalAnchor: "bottom" },
      { image: "dragonsBackgroundNear", parallax: 0.66, heightRatio: 0.82, opacity: 0.94, verticalAnchor: "bottom" },
    ],
    ground: "dragonsGround",
    platform: "dragonsPlatform",
    obstacle: "dragonsObstacle",
    hazard: "dragonsHazard",
    hazardColumns: 2,
    hazardFrames: 4,
    coin: "dragonsCoin",
    coinCollected: "dragonsCoinCollected",
    checkpoint: "dragonsCheckpoint",
    goal: "dragonsGoal",
  },
  ice_world_01: {
    color: "#bcecff",
    backgroundLayers: [
      { image: "iceBackgroundFar", parallax: 0.1, heightRatio: 1, opacity: 0.78, verticalAnchor: "center" },
      { image: "iceBackgroundMid", parallax: 0.34, heightRatio: 0.94, opacity: 0.88, verticalAnchor: "bottom" },
      { image: "iceBackgroundNear", parallax: 0.66, heightRatio: 0.82, opacity: 0.94, verticalAnchor: "bottom" },
    ],
    ground: "iceGround",
    platform: "icePlatform",
    obstacle: "iceObstacle",
    hazard: "iceHazard",
    hazardColumns: 2,
    hazardFrames: 4,
    coin: "iceCoin",
    coinCollected: "iceCoinCollected",
    checkpoint: "spaceCheckpoint",
    goal: "spaceGoal",
  },
};

const MUSIC_URLS = {
  gameplay: assetUrl("audio/space_basic_v1/gameplay_loop.wav"),
  boss: assetUrl("audio/space_basic_v1/boss_loop.wav"),
} as const;

type RuntimeMusicCue = keyof typeof MUSIC_URLS;

const MUSIC_VOLUME: Record<RuntimeMusicCue, number> = {
  gameplay: 0.32,
  boss: 0.38,
};

const AUDIO_URLS = {
  jump: assetUrl("audio/space_basic_v1/jump.wav"),
  land: assetUrl("audio/space_basic_v1/land.wav"),
  collectible: assetUrl("audio/space_basic_v1/collectible.wav"),
  extra_life: assetUrl("audio/space_basic_v1/collectible.wav"),
  platform_spring: assetUrl("audio/space_basic_v1/jump.wav"),
  checkpoint: assetUrl("audio/space_basic_v1/checkpoint.wav"),
  goal: assetUrl("audio/space_basic_v1/goal.wav"),
  enemy_defeat: assetUrl("audio/space_basic_v1/enemy_defeat.wav"),
  player_damage: assetUrl("audio/space_basic_v1/player_damage.wav"),
  player_death: assetUrl("audio/space_basic_v1/player_death.wav"),
  respawn: assetUrl("audio/space_basic_v1/respawn.wav"),
  weapon_swing: assetUrl("audio/space_basic_v1/weapon_swing.wav"),
  weapon_hit: assetUrl("audio/space_basic_v1/weapon_hit.wav"),
  fire: assetUrl("audio/space_basic_v1/fire.wav"),
} as const;

const AUDIO_VOLUME: Partial<Record<keyof typeof AUDIO_URLS, number>> = {
  jump: 0.38,
  land: 0.3,
  collectible: 0.4,
  extra_life: 0.46,
  platform_spring: 0.46,
  checkpoint: 0.42,
  goal: 0.5,
  enemy_defeat: 0.46,
  player_damage: 0.42,
  player_death: 0.48,
  respawn: 0.36,
  weapon_swing: 0.42,
  weapon_hit: 0.46,
  fire: 0.42,
};

type InputState = {
  left: boolean;
  right: boolean;
  down: boolean;
  jumpHeld: boolean;
  jumpPressed: boolean;
  weaponHeld: boolean;
  weaponPressed: boolean;
};

const emptyInput = (): InputState => ({
  left: false,
  right: false,
  down: false,
  jumpHeld: false,
  jumpPressed: false,
  weaponHeld: false,
  weaponPressed: false,
});

const VICTORY_BURSTS = [
  { delay: 0, x: 0.24, y: 0.28, size: 128 },
  { delay: 0.22, x: 0.52, y: 0.18, size: 144 },
  { delay: 0.46, x: 0.76, y: 0.31, size: 120 },
  { delay: 0.7, x: 0.38, y: 0.46, size: 112 },
  { delay: 0.92, x: 0.66, y: 0.43, size: 136 },
  { delay: 1.28, x: 0.18, y: 0.42, size: 120 },
  { delay: 1.56, x: 0.48, y: 0.26, size: 140 },
  { delay: 1.86, x: 0.81, y: 0.2, size: 128 },
] as const;

const EXTRA_LIFE_FIREWORK_SIZE = 112;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

const EDITOR_TERRAIN_COLORS: Record<PlatformerTerrainKind, string> = {
  empty: "rgb(255 105 94 / 42%)",
  ground: "rgb(40 127 224 / 42%)",
  platform: "rgb(140 220 255 / 48%)",
  obstacle: "rgb(255 201 69 / 46%)",
  hazard: "rgb(238 68 68 / 48%)",
};

const EDITOR_TOOL_LABELS: Record<PlatformerEditTool, string> = {
  select: "Select",
  move: "Move",
  erase: "Erase",
  ground: "Ground",
  platform: "Platform",
  obstacle: "Obstacle",
  hazard: "Hazard",
  spawn: "Spawn",
  coin: "Coin",
  extra_life: "Extra life",
  platform_spring: "Platform spring",
  enemy: "Enemy",
  boss: "Boss",
  flying_object: "Flying object",
  checkpoint: "Checkpoint",
  goal: "Goal",
};

function editorPaintKind(
  tool: PlatformerEditTool | undefined,
): PlatformerTerrainKind | null {
  if (!tool || tool === "select" || tool === "move") return null;
  if (PLATFORMER_OBJECT_TOOLS.includes(tool as (typeof PLATFORMER_OBJECT_TOOLS)[number])) {
    return null;
  }
  return tool === "erase"
    ? "empty"
    : tool as Exclude<PlatformerTerrainKind, "empty">;
}

function clampEditorCamera(
  map: PlatformerMapSpec,
  camera: PlatformerCamera,
): PlatformerCamera {
  const viewportWidth = map.camera.columns * map.tileSize;
  const viewportHeight = map.camera.rows * map.tileSize;
  return {
    x: clamp(
      camera.x,
      0,
      Math.max(0, map.size.columns * map.tileSize - viewportWidth),
    ),
    y: clamp(
      camera.y,
      0,
      Math.max(0, map.size.rows * map.tileSize - viewportHeight),
    ),
  };
}

function cellsAlongLine(from: EditorCell, to: EditorCell): EditorCell[] {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const steps = Math.max(Math.abs(deltaX), Math.abs(deltaY));
  if (steps === 0) return [to];

  const cells = new Map<string, EditorCell>();
  for (let step = 0; step <= steps; step += 1) {
    const x = Math.round(from.x + (deltaX * step) / steps);
    const y = Math.round(from.y + (deltaY * step) / steps);
    cells.set(`${x}:${y}`, { x, y });
  }
  return [...cells.values()];
}

function drawEditorOverlay(
  context: CanvasRenderingContext2D,
  map: PlatformerMapSpec,
  camera: PlatformerCamera,
  cursor: EditorCell | null,
  selected: EditorCell | null,
  pending: ReadonlyMap<string, PlatformerTerrainStrokeCell>,
) {
  const viewportWidth = map.camera.columns * map.tileSize;
  const viewportHeight = map.camera.rows * map.tileSize;
  const firstColumn = Math.max(0, Math.floor(camera.x / map.tileSize));
  const lastColumn = Math.min(
    map.size.columns,
    Math.ceil((camera.x + viewportWidth) / map.tileSize),
  );
  const firstRow = Math.max(0, Math.floor(camera.y / map.tileSize));
  const lastRow = Math.min(
    map.size.rows,
    Math.ceil((camera.y + viewportHeight) / map.tileSize),
  );

  context.save();
  context.strokeStyle = "rgb(255 255 255 / 28%)";
  context.lineWidth = 1;
  context.beginPath();
  for (let column = firstColumn; column <= lastColumn; column += 1) {
    const x = column * map.tileSize - camera.x;
    context.moveTo(x, 0);
    context.lineTo(x, viewportHeight);
  }
  for (let row = firstRow; row <= lastRow; row += 1) {
    const y = row * map.tileSize - camera.y;
    context.moveTo(0, y);
    context.lineTo(viewportWidth, y);
  }
  context.stroke();

  for (const cell of pending.values()) {
    const x = cell.x * map.tileSize - camera.x;
    const y = cell.y * map.tileSize - camera.y;
    context.fillStyle = EDITOR_TERRAIN_COLORS[cell.kind];
    context.fillRect(x + 2, y + 2, map.tileSize - 4, map.tileSize - 4);
    if (cell.kind === "empty") {
      context.strokeStyle = "rgb(255 255 255 / 88%)";
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(x + 18, y + 18);
      context.lineTo(x + map.tileSize - 18, y + map.tileSize - 18);
      context.moveTo(x + map.tileSize - 18, y + 18);
      context.lineTo(x + 18, y + map.tileSize - 18);
      context.stroke();
    }
  }

  if (selected) {
    context.strokeStyle = "#ffd52e";
    context.lineWidth = 5;
    context.strokeRect(
      selected.x * map.tileSize - camera.x + 3,
      selected.y * map.tileSize - camera.y + 3,
      map.tileSize - 6,
      map.tileSize - 6,
    );
  }

  if (cursor) {
    context.strokeStyle = "rgb(255 255 255 / 95%)";
    context.lineWidth = 3;
    context.setLineDash([8, 5]);
    context.strokeRect(
      cursor.x * map.tileSize - camera.x + 2,
      cursor.y * map.tileSize - camera.y + 2,
      map.tileSize - 4,
      map.tileSize - 4,
    );
  }
  context.restore();
}

function drawSheetFrame(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource | undefined,
  columns: number,
  frameWidth: number,
  frameHeight: number,
  frameIndex: number,
  x: number,
  y: number,
  width = frameWidth,
  height = frameHeight,
) {
  if (!image) return false;
  const column = frameIndex % columns;
  const row = Math.floor(frameIndex / columns);
  context.drawImage(
    image,
    column * frameWidth,
    row * frameHeight,
    frameWidth,
    frameHeight,
    x,
    y,
    width,
    height,
  );
  return true;
}

function drawRepeatedBackground(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | undefined,
  cameraX: number,
  viewportWidth: number,
  viewportHeight: number,
  parallax: number,
  heightRatio: number,
  opacity: number,
  verticalAnchor: "center" | "bottom",
  verticalOffset = 0,
) {
  if (!image) return;
  const height = viewportHeight * heightRatio;
  const width = height * (image.naturalWidth / image.naturalHeight);
  const offset = -((cameraX * parallax) % width);
  const anchoredY = verticalAnchor === "bottom"
    ? viewportHeight - height
    : (viewportHeight - height) / 2;
  const y = anchoredY + verticalOffset;
  context.save();
  context.globalAlpha = opacity;
  for (let x = offset - width; x < viewportWidth + width; x += width) {
    context.drawImage(image, x, y, width, height);
  }
  context.restore();
}

function drawWeaponFrame(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | undefined,
  weapon: WeaponSpec,
  playerAssetId: PlayerAssetId,
  state: PlatformerState,
  frame: number,
  layer: "behind" | "front",
) {
  if (!image) return;
  const pose = playerWeaponAttackPose(weapon, playerAssetId, state.facing, frame);
  if (!pose || pose.layer !== layer) return;

  context.save();
  context.translate(state.x + pose.offsetX, state.y + pose.offsetY);
  context.rotate((pose.rotationDegrees * Math.PI) / 180);
  context.drawImage(image, -weapon.visual.grip.x, -weapon.visual.grip.y, 64, 64);
  context.restore();
}

function drawVictoryFireworks(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | undefined,
  map: PlatformerMapSpec,
  state: PlatformerState,
  elapsedSeconds: number | null,
) {
  if (
    !image ||
    state.status !== "won" ||
    map.presentation.victoryEffectId !== "shared_victory_burst_01" ||
    elapsedSeconds === null
  ) return;
  const viewportWidth = map.camera.columns * map.tileSize;
  const viewportHeight = map.camera.rows * map.tileSize;
  for (const burst of VICTORY_BURSTS) {
    const localSeconds = elapsedSeconds - burst.delay;
    const frame = Math.floor(localSeconds * 8);
    if (frame < 0 || frame >= 8) continue;
    drawSheetFrame(
      context,
      image,
      4,
      64,
      64,
      frame,
      viewportWidth * burst.x - burst.size / 2,
      viewportHeight * burst.y - burst.size / 2,
      burst.size,
      burst.size,
    );
  }
}

function drawExtraLifeFireworks(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | undefined,
  map: PlatformerMapSpec,
  state: PlatformerState,
) {
  if (!image) return;
  for (const object of map.objects) {
    if (object.type !== "extra_life") continue;
    const frame = resolveExtraLifeFireworkFrame(state, object.id);
    if (frame === null) continue;
    const centerX = (object.x + 0.5) * map.tileSize;
    const centerY = (object.y + 0.5) * map.tileSize;
    drawSheetFrame(
      context,
      image,
      4,
      64,
      64,
      frame,
      centerX - EXTRA_LIFE_FIREWORK_SIZE / 2,
      centerY - EXTRA_LIFE_FIREWORK_SIZE / 2,
      EXTRA_LIFE_FIREWORK_SIZE,
      EXTRA_LIFE_FIREWORK_SIZE,
    );
  }
}

function drawHud(
  context: CanvasRenderingContext2D,
  map: PlatformerMapSpec,
  state: PlatformerState,
  images: Partial<Record<ImageKey, HTMLImageElement>>,
) {
  const totalCoins = map.objects.filter((object) => object.type === "collectible").length;
  context.save();
  context.font = "800 22px Nunito, sans-serif";
  context.textBaseline = "middle";
  for (const entry of map.presentation.hud ?? []) {
    const x = entry.column * map.tileSize;
    const y = entry.row * map.tileSize;
    context.fillStyle = "rgb(7 20 63 / 84%)";
    context.beginPath();
    context.roundRect(x + 4, y + 8, 124, 48, 12);
    context.fill();
    const image = entry.type === "lives" ? images.hudLife : images.hudCoin;
    if (image) context.drawImage(image, x, y, 64, 64);
    context.fillStyle = "#fff";
    const value = entry.type === "lives"
      ? `× ${state.lives}`
      : `${state.collectedIds.length} / ${totalCoins}`;
    context.fillText(value, x + 64, y + 33);
  }
  context.restore();
}

function drawWorld(
  context: CanvasRenderingContext2D,
  map: PlatformerMapSpec,
  state: PlatformerState,
  camera: PlatformerCamera,
  images: Partial<Record<ImageKey, HTMLImageElement>>,
  elapsedSeconds: number,
  weapon: WeaponSpec,
  playerAssetId: PlayerAssetId,
  playerImage: CanvasImageSource | undefined,
  victoryElapsedSeconds: number | null,
) {
  const viewportWidth = map.camera.columns * map.tileSize;
  const viewportHeight = map.camera.rows * map.tileSize;
  const cameraX = camera.x;
  const cameraY = camera.y;
  const foregroundVerticalOffset = resolveWorldBottomBackgroundOffset(map, cameraY);
  const visuals = MAP_VISUALS[map.presentation.backgroundId] ?? GREEN_HILLS_VISUALS;

  context.clearRect(0, 0, viewportWidth, viewportHeight);
  context.fillStyle = visuals.color;
  context.fillRect(0, 0, viewportWidth, viewportHeight);
  visuals.backgroundLayers.forEach((layer, index) => {
    drawRepeatedBackground(
      context,
      images[layer.image],
      cameraX,
      viewportWidth,
      viewportHeight,
      layer.parallax,
      layer.heightRatio,
      layer.opacity,
      layer.verticalAnchor,
      index === visuals.backgroundLayers.length - 1 ? foregroundVerticalOffset : 0,
    );
  });

  context.save();
  context.translate(-cameraX, -cameraY);
  const terrain = map.layers.find((layer) => layer.id === "terrain");
  const overrides = new Map(
    (terrain?.spriteOverrides ?? []).map((override) => [`${override.x},${override.y}`, override]),
  );
  const firstColumn = Math.max(0, Math.floor(cameraX / map.tileSize) - 1);
  const lastColumn = Math.min(map.size.columns - 1, Math.ceil((cameraX + viewportWidth) / map.tileSize) + 1);
  const firstRow = Math.max(0, Math.floor(cameraY / map.tileSize) - 1);
  const lastRow = Math.min(map.size.rows - 1, Math.ceil((cameraY + viewportHeight) / map.tileSize) + 1);

  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const symbol = terrain?.rows[row]?.[column] ?? ".";
      const slot = map.legend[symbol]?.visualSlot;
      if (!slot || slot === "empty") continue;
      const x = column * map.tileSize;
      const y = row * map.tileSize;
      const overrideAssetId = overrides.get(`${column},${row}`)?.assetId as ImageKey | undefined;
      if (slot === "hazard") {
        const startFrame = overrides.get(`${column},${row}`)?.animationStartFrame ?? 1;
        const frame = (startFrame - 1 + Math.floor(elapsedSeconds * 8)) % visuals.hazardFrames;
        drawSheetFrame(context, images[visuals.hazard], visuals.hazardColumns, 64, 64, frame, x, y);
      } else {
        const imageKey = slot === "ground"
          ? visuals.ground
          : slot === "platform"
            ? visuals.platform
            : overrideAssetId ?? visuals.obstacle;
        const image = images[imageKey];
        if (imageKey === "haunted_tombstone_01" && image) {
          context.drawImage(image, x, y - 32, map.tileSize, 96);
        } else if (image) {
          context.drawImage(image, x, y, map.tileSize, map.tileSize);
        }
      }
    }
  }

  const animationFrame = Math.floor(elapsedSeconds * 8) % 4;
  for (const object of map.objects) {
    const x = object.x * map.tileSize;
    const y = object.y * map.tileSize;
    if (object.type === "collectible") {
      const poofFrame = resolveCollectiblePoofFrame(state, object.id);
      if (poofFrame !== null) {
        drawSheetFrame(
          context,
          images[visuals.coinCollected],
          2,
          64,
          64,
          poofFrame,
          x,
          y,
        );
      } else if (!state.collectedIds.includes(object.id)) {
        drawSheetFrame(context, images[visuals.coin], 2, 64, 64, animationFrame, x, y);
      }
    } else if (object.type === "extra_life") {
      const opacity = resolveExtraLifeOpacity(state, object.id);
      if (opacity > 0 && images.hudLife) {
        context.save();
        context.globalAlpha = opacity;
        context.drawImage(images.hudLife, x, y, 64, 64);
        context.restore();
      }
    } else if (object.type === "platform_spring") {
      const compressionFrame = resolvePlatformSpringCompressionFrame(state, object.id);
      const defaultImage = images[object.assetId as ImageKey]
        ?? images.ice_world_platformer_spring_01;
      const compressedImage = images[`${object.assetId}_compressed` as ImageKey]
        ?? images.ice_world_platformer_spring_01_compressed;
      if (compressionFrame === null) {
        if (defaultImage) context.drawImage(defaultImage, x, y, 64, 64);
      } else {
        drawSheetFrame(
          context,
          compressedImage,
          2,
          64,
          64,
          compressionFrame,
          x,
          y,
        );
      }
    } else if (object.type === "checkpoint") {
      drawSheetFrame(context, images[visuals.checkpoint], 2, 64, 64, animationFrame, x, y);
    } else if (object.type === "goal") {
      drawSheetFrame(context, images[visuals.goal], 2, 64, 96, animationFrame, x, y - 32, 64, 96);
    }
  }

  drawExtraLifeFireworks(context, images.victory, map, state);

  for (const flyingObject of state.flyingObjects) {
    if (flyingObject.phase !== "active") continue;
    const object = map.objects.find((candidate) => candidate.id === flyingObject.id);
    const flyingImage = images[flyingObject.assetId as ImageKey]
      ?? images.neutral_green_hills_flying_cooper_01;
    const travelsRight = object?.motion?.travel.type === "viewport_arc"
      && object.motion.travel.entryEdge === "left";
    const visualOffset = resolveVisualMotionOffset(
      object?.motion,
      flyingObject.id,
      state.tick,
      map.tileSize,
      travelsRight ? "right" : "left",
    );
    const flyingFrame = Math.floor((state.tick * 8) / 60) % 4;
    if (travelsRight) {
      context.save();
      context.translate(flyingObject.x + visualOffset.x, flyingObject.y + visualOffset.y);
      context.scale(-1, 1);
      drawSheetFrame(
        context,
        flyingImage,
        2,
        64,
        64,
        flyingFrame,
        -32,
        -32,
      );
      context.restore();
    } else {
      drawSheetFrame(
        context,
        flyingImage,
        2,
        64,
        64,
        flyingFrame,
        flyingObject.x + visualOffset.x - 32,
        flyingObject.y + visualOffset.y - 32,
      );
    }
  }

  for (const enemy of state.enemies) {
    if (enemy.defeated) continue;
    const isBoss = enemy.role === "boss";
    const blinkHidden =
      isBoss &&
      enemy.hitReactionTicksRemaining > 0 &&
      Math.floor(enemy.hitReactionTicksRemaining / 3) % 2 === 0;
    const image = images[enemy.assetId as ImageKey] ?? images.neutral_ghost_01;
    const object = map.objects.find((candidate) => candidate.id === enemy.id);
    const visualOffset = resolveVisualMotionOffset(
      object?.motion,
      enemy.id,
      state.tick,
      map.tileSize,
      enemy.direction,
    );
    if (isBoss) {
      if (!blinkHidden) {
        const facing = resolveEnemyFacingDirection(enemy);
        const row = facing === "left" ? 0 : 1;
        const column = enemy.moving ? animationFrame + 1 : 0;
        drawSheetFrame(context, image, 5, 128, 128, row * 5 + column, enemy.x + visualOffset.x - 64, enemy.y + visualOffset.y - 120, 128, 128);
      }
    } else if (enemy.assetId === "haunted_spirit_orb_01") {
      drawSheetFrame(
        context,
        image,
        2,
        48,
        48,
        animationFrame,
        enemy.x + visualOffset.x - 32,
        enemy.y + visualOffset.y - 56,
        64,
        64,
      );
    } else {
      const row = enemy.direction === "left" ? 1 : 2;
      const column = enemy.moving ? animationFrame + 1 : 0;
      drawSheetFrame(context, image, 5, 64, 64, row * 5 + column, enemy.x + visualOffset.x - 32, enemy.y + visualOffset.y - 56);
    }
    if (isBoss) drawBossHealthBar(context, enemy, object, map.tileSize);
  }

  for (const beam of state.laserBeams) {
    const charging = beam.ageTicks < beam.chargeTicks;
    const chargeProgress = clamp(beam.ageTicks / beam.chargeTicks, 0, 1);
    const chargeFrame = Math.min(5, Math.floor(chargeProgress * 6));
    const pulse = (Math.sin((state.tick - beam.spawnTick) * 0.9) + 1) / 2;
    context.save();
    context.lineCap = "round";
    context.globalCompositeOperation = "lighter";
    context.shadowColor = "#11cfff";
    if (charging) {
      const radius = 5 + chargeFrame * 2.4;
      context.shadowBlur = 10 + chargeFrame * 4 + pulse * 5;
      context.fillStyle = `rgb(20 191 255 / ${0.42 + chargeFrame * 0.08})`;
      context.beginPath();
      context.arc(beam.startX, beam.startY, radius + pulse * 1.5, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = `rgb(187 247 255 / ${0.5 + pulse * 0.35})`;
      context.lineWidth = 2 + chargeFrame * 0.45;
      context.beginPath();
      context.arc(beam.startX, beam.startY, radius + 5 + pulse * 3, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = "#effeff";
      context.beginPath();
      context.arc(beam.startX, beam.startY, Math.max(2, radius * 0.38), 0, Math.PI * 2);
      context.fill();
      context.restore();
      continue;
    }
    context.shadowBlur = 16 + pulse * 8;
    context.strokeStyle = `rgb(25 159 255 / ${0.38 + pulse * 0.18})`;
    context.lineWidth = 26 + pulse * 6;
    context.beginPath();
    context.moveTo(beam.startX, beam.startY);
    context.lineTo(beam.endX, beam.startY);
    context.stroke();
    context.shadowBlur = 8 + pulse * 5;
    context.strokeStyle = "#16d9ff";
    context.lineWidth = 10 + pulse * 3;
    context.stroke();
    context.shadowBlur = 3;
    context.strokeStyle = "#e7fdff";
    context.lineWidth = 4;
    context.stroke();
    context.fillStyle = "#baf8ff";
    context.beginPath();
    context.arc(beam.startX, beam.startY, 7 + pulse * 2, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  for (const projectile of state.projectiles) {
    const image = images[projectile.assetId as ImageKey];
    const projectileFrame = Math.floor(((state.tick - projectile.spawnTick) * 10) / 60) % 4;
    context.save();
    context.translate(projectile.x, projectile.y);
    if (projectile.direction === "left") context.scale(-1, 1);
    const projectileSize = 64 * projectile.sizeScale;
    drawSheetFrame(
      context,
      image,
      2,
      64,
      64,
      projectileFrame,
      -projectileSize / 2,
      -projectileSize / 2,
      projectileSize,
      projectileSize,
    );
    context.restore();
  }

  const playerSpawn = map.objects.find((object) => object.type === "player_spawn");
  const playerVisualOffset = resolveVisualMotionOffset(
    playerSpawn?.motion,
    playerSpawn?.id ?? "player",
    state.tick,
    map.tileSize,
    state.facing,
  );
  const visualPlayerState = {
    ...state,
    x: state.x + playerVisualOffset.x,
    y: state.y + playerVisualOffset.y,
  };
  let playerDrawn = false;
  if (state.status === "dying") {
    const elapsedDeathTicks = state.deathTicksTotal - state.deathTicksRemaining;
    const eventVisual = playerDefeatedEventVisual(
      playerAssetId,
      state.facing,
      elapsedDeathTicks * FIXED_DELTA_SECONDS * 1000,
    );
    if (eventVisual) {
      const { eventSheet } = eventVisual;
      playerDrawn = drawSheetFrame(
        context,
        images[eventSheet.imageAssetId],
        eventSheet.columns,
        eventSheet.frameWidth,
        eventSheet.frameHeight,
        eventVisual.frameIndex,
        visualPlayerState.x - eventSheet.anchor.x,
        visualPlayerState.y - eventSheet.anchor.y,
      );
      if (!playerDrawn) {
        playerDrawn = drawSheetFrame(
          context,
          playerImage,
          5,
          64,
          64,
          (state.facing === "left" ? 1 : 2) * 5,
          visualPlayerState.x - 32,
          visualPlayerState.y - 56,
        );
      }
    } else {
      // Keep characters without compatible event art visible in their base
      // pose. This is the safe no-animation fallback, not a fabricated motion.
      playerDrawn = drawSheetFrame(
        context,
        playerImage,
        5,
        64,
        64,
        (state.facing === "left" ? 1 : 2) * 5,
        visualPlayerState.x - 32,
        visualPlayerState.y - 56,
      );
    }
  } else if (state.attackTicksRemaining > 0) {
    const durationTicks = Math.max(
      1,
      Math.round((weapon.mechanics.attackDurationMs / 1000) * 60),
    );
    const elapsedAttackTicks = durationTicks - state.attackTicksRemaining;
    const attackFrame = clamp(Math.floor((elapsedAttackTicks * 4) / durationTicks), 0, 3);
    const attackVisual = playerAttackEventVisual(
      playerAssetId,
      state.facing,
      elapsedAttackTicks * FIXED_DELTA_SECONDS * 1000,
    );
    drawWeaponFrame(context, images.weapon, weapon, playerAssetId, visualPlayerState, attackFrame, "behind");
    playerDrawn = attackVisual
      ? drawSheetFrame(
          context,
          images[attackVisual.eventSheet.imageAssetId],
          attackVisual.eventSheet.columns,
          attackVisual.eventSheet.frameWidth,
          attackVisual.eventSheet.frameHeight,
          attackVisual.frameIndex,
          visualPlayerState.x - attackVisual.eventSheet.anchor.x,
          visualPlayerState.y - attackVisual.eventSheet.anchor.y,
        )
      : drawSheetFrame(
          context,
          playerImage,
          5,
          64,
          64,
          (state.facing === "left" ? 1 : 2) * 5 + attackFrame + 1,
          visualPlayerState.x - 32,
          visualPlayerState.y - 56,
        );
    drawWeaponFrame(context, images.weapon, weapon, playerAssetId, visualPlayerState, attackFrame, "front");
  } else {
    const playerRow = state.facing === "left" ? 1 : 2;
    const playerColumn = Math.abs(state.vx) < 1 ? 0 : animationFrame + 1;
    playerDrawn = drawSheetFrame(
      context,
      playerImage,
      5,
      64,
      64,
      playerRow * 5 + playerColumn,
      visualPlayerState.x - 32,
      visualPlayerState.y - 56,
    );
  }
  if (!playerDrawn) {
    context.fillStyle = "#fff";
    context.fillRect(state.x - 16, state.y - 48, 32, 48);
  }
  context.restore();
  drawVictoryFireworks(context, images.victory, map, state, victoryElapsedSeconds);
  drawHud(context, map, state, images);
}

class RuntimeAudio {
  private music = new Map<RuntimeMusicCue, HTMLAudioElement>();
  private activeMusicCue: RuntimeMusicCue | null = null;
  private muted = false;

  setMuted(muted: boolean) {
    this.muted = muted;
    for (const music of this.music.values()) music.muted = muted;
  }

  startMusic(cue: RuntimeMusicCue = "gameplay") {
    if (this.activeMusicCue !== cue) {
      if (this.activeMusicCue) this.music.get(this.activeMusicCue)?.pause();
      this.activeMusicCue = cue;
    }
    let music = this.music.get(cue);
    if (!music) {
      music = new Audio(MUSIC_URLS[cue]);
      music.loop = true;
      music.volume = MUSIC_VOLUME[cue];
      this.music.set(cue, music);
    }
    music.muted = this.muted;
    if (music.paused) void music.play().catch(() => undefined);
  }

  pauseMusic() {
    if (this.activeMusicCue) this.music.get(this.activeMusicCue)?.pause();
    this.activeMusicCue = null;
  }

  play(event: RuntimeEvent["type"]) {
    if (this.muted || event === "game_over") return;
    const url = AUDIO_URLS[event as keyof typeof AUDIO_URLS];
    if (!url) return;
    const effect = new Audio(url);
    effect.volume = AUDIO_VOLUME[event as keyof typeof AUDIO_URLS] ?? 0.4;
    void effect.play().catch(() => undefined);
  }
}

function resolveRuntimeMusicCue(cue: string | null): RuntimeMusicCue {
  return cue === "boss" ? "boss" : "gameplay";
}

function normalizeInput(input: InputState): PlatformerInput {
  return {
    moveX: Number(input.right) - Number(input.left),
    moveY: Number(input.down) - Number(input.jumpHeld),
    jumpPressed: input.jumpPressed,
    jumpHeld: input.jumpHeld,
    weaponPressed: input.weaponPressed,
  };
}

export function PlatformerGame({
  map,
  physics,
  weapon,
  playerAssetId = "neutral_cooper_01",
  skinTone = "skin_04",
  hairColor = "hair_03",
  className,
  controlRowLeading,
  autoPlay = false,
  editorTool,
  onEditorToolChange,
  onTerrainStroke,
  onObjectPlace,
  selectedObjectId,
  onObjectSelect,
  onComplete,
}: PlatformerGameProps) {
  const initialState = useMemo(() => createInitialState(map), [map]);
  const [terminalStatus, setTerminalStatus] = useState<"playing" | "won" | "game_over">("playing");
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [assetsReady, setAssetsReady] = useState(false);
  const [controlBindings, setControlBindings] = useState<ControlBindings>(copyDefaultControlBindings);
  const [capturingBinding, setCapturingBinding] = useState<CapturingBinding>(null);
  const [controlError, setControlError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<HTMLDivElement>(null);
  const controlsDialogRef = useRef<HTMLDialogElement>(null);
  const srStatusRef = useRef<HTMLParagraphElement>(null);
  const stateRef = useRef(initialState);
  const previousStateRef = useRef(initialState);
  const cameraRef = useRef<PlatformerCamera | null>(null);
  const editorCameraRef = useRef<PlatformerCamera | null>(null);
  const editorCursorRef = useRef<EditorCell | null>(
    map.objects.find((object) => object.type === "player_spawn") ?? { x: 0, y: 0 },
  );
  const editorHoverRef = useRef<EditorCell | null>(null);
  const editorSelectionRef = useRef<EditorCell | null>(null);
  const editorStrokeRef = useRef<EditorPaintStroke | null>(null);
  const editorPanRef = useRef<EditorPan | null>(null);
  const renderedMapRef = useRef(map);
  const previousEditorToolRef = useRef(editorTool);
  const victoryStartedAtRef = useRef<number | null>(null);
  const completionNotifiedRef = useRef(false);
  const autoPlayStartedRef = useRef(false);
  const inputRef = useRef<InputState>(emptyInput());
  const imagesRef = useRef<Partial<Record<ImageKey, HTMLImageElement>>>({});
  const playerImageRef = useRef<CanvasImageSource | null>(null);
  const audioRef = useRef<RuntimeAudio | null>(null);

  const syncRuntimeDom = useCallback((state: PlatformerState) => {
    const game = gameRef.current;
    if (game) {
      game.dataset.playerX = state.x.toFixed(2);
      game.dataset.playerY = state.y.toFixed(2);
      game.dataset.runtimeState = state.status;
      game.dataset.runtimeTick = String(state.tick);
      game.dataset.attackTicks = String(state.attackTicksRemaining);
      game.dataset.deathTicks = String(state.deathTicksRemaining);
      const defeatedEventSheet = state.status === "dying"
        ? playerDefeatedEventSheet(playerAssetId)
        : null;
      if (defeatedEventSheet) {
        game.dataset.playerEventSheet = defeatedEventSheet.imageAssetId;
      } else {
        delete game.dataset.playerEventSheet;
      }
      if (cameraRef.current) {
        game.dataset.cameraX = cameraRef.current.x.toFixed(2);
        game.dataset.cameraY = cameraRef.current.y.toFixed(2);
      }
    }

    const announcement = state.status === "dying"
      ? `Cooper was defeated. ${state.lives} lives remaining.`
      : state.status === "playing"
        ? `${state.lives} lives and ${state.collectedIds.length} coins collected.`
        : state.status === "won"
          ? "Level complete!"
          : "Game over — reset to try again";
    const srStatus = srStatusRef.current;
    if (srStatus && srStatus.textContent !== announcement) {
      srStatus.textContent = announcement;
    }
  }, [playerAssetId]);

  useEffect(() => {
    audioRef.current = new RuntimeAudio();
    const savedMuted = window.localStorage.getItem("splat-lab.game-audio-muted.v1") === "true";
    audioRef.current.setMuted(savedMuted);
    const syncPreference = window.setTimeout(() => setMuted(savedMuted), 0);
    return () => {
      window.clearTimeout(syncPreference);
      audioRef.current?.pauseMusic();
    };
  }, []);

  useEffect(() => {
    const savedBindings = window.localStorage.getItem(CONTROL_BINDINGS_STORAGE_KEY);
    if (!savedBindings) return;
    const syncPreference = window.setTimeout(() => {
      try {
        const parsed: unknown = JSON.parse(savedBindings);
        if (isControlBindings(parsed)) setControlBindings(parsed);
      } catch {
        // Ignore malformed local preferences and retain the documented defaults.
      }
    }, 0);
    return () => window.clearTimeout(syncPreference);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await Promise.all(
        (Object.entries(IMAGE_URLS) as Array<[ImageKey, string]>).map(
          async ([key, url]) => {
            const image = await loadSpriteImage(url);
            if (image) imagesRef.current[key] = image;
          },
        ),
      );

      const basePlayerImage = imagesRef.current[playerAssetId];
      if (basePlayerImage && isCustomizableHumanAsset(playerAssetId)) {
        const [skinMask, hairMask] = await Promise.all([
          loadSpriteImage(assetUrl(`sprite-masks/${playerAssetId}-skin-mask.png`)),
          loadSpriteImage(assetUrl(`sprite-masks/${playerAssetId}-hair-mask.png`)),
        ]);
        playerImageRef.current = skinMask && hairMask
          ? recolorHumanSprite(
              basePlayerImage,
              skinMask,
              hairMask,
              skinTone,
              hairColor,
            )
          : basePlayerImage;
      } else {
        playerImageRef.current = basePlayerImage ?? null;
      }

      if (!cancelled) setAssetsReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [hairColor, playerAssetId, skinTone]);

  const render = useCallback((elapsedSeconds: number, renderedState = stateRef.current) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const logicalWidth = map.camera.columns * map.tileSize;
    const logicalHeight = map.camera.rows * map.tileSize;
    const runtimeCamera = resolvePlatformerCamera(map, renderedState);
    const camera = editorTool && !playing
      ? clampEditorCamera(map, editorCameraRef.current ?? runtimeCamera)
      : runtimeCamera;
    if (editorTool && !playing) editorCameraRef.current = camera;
    cameraRef.current = camera;
    context.setTransform(canvas.width / logicalWidth, 0, 0, canvas.height / logicalHeight, 0, 0);
    context.imageSmoothingEnabled = true;
    drawWorld(
      context,
      map,
      renderedState,
      camera,
      imagesRef.current,
      elapsedSeconds,
      weapon,
      playerAssetId,
      playerImageRef.current ?? imagesRef.current[playerAssetId],
      victoryStartedAtRef.current === null
        ? null
        : elapsedSeconds - victoryStartedAtRef.current,
    );
    if (editorTool && !playing) {
      const selectedObject = selectedObjectId
        ? map.objects.find((object) => object.id === selectedObjectId)
        : null;
      drawEditorOverlay(
        context,
        map,
        camera,
        editorHoverRef.current ?? editorCursorRef.current,
        selectedObject
          ? platformerPreviewCellForObject(map, renderedState, selectedObject)
          : editorSelectionRef.current,
        editorStrokeRef.current?.cells ?? new Map(),
      );
    }
  }, [editorTool, map, playerAssetId, playing, selectedObjectId, weapon]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeCanvas = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const targetWidth = Math.max(1, Math.round(bounds.width * ratio));
      const targetHeight = Math.max(1, Math.round(bounds.height * ratio));
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        render(performance.now() / 1000);
      }
    };
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(canvas);
    resizeCanvas();
    return () => observer.disconnect();
  }, [render]);

  useEffect(() => {
    render(performance.now() / 1000);
  }, [assetsReady, render]);

  useEffect(() => {
    if (renderedMapRef.current === map) return;
    renderedMapRef.current = map;
    const nextState = createInitialState(map);
    stateRef.current = nextState;
    previousStateRef.current = nextState;
    editorCameraRef.current = clampEditorCamera(
      map,
      editorCameraRef.current ?? resolvePlatformerCamera(map, nextState),
    );
    editorSelectionRef.current = null;
    editorStrokeRef.current = null;
    editorPanRef.current = null;
    victoryStartedAtRef.current = null;
    completionNotifiedRef.current = false;
    inputRef.current = emptyInput();
    setTerminalStatus("playing");
    setPlaying(false);
    audioRef.current?.pauseMusic();
    syncRuntimeDom(nextState);
    render(performance.now() / 1000, nextState);
  }, [map, render, syncRuntimeDom]);

  useEffect(() => {
    if (previousEditorToolRef.current === editorTool) return;
    previousEditorToolRef.current = editorTool;
    editorSelectionRef.current = null;
    editorStrokeRef.current = null;
    editorPanRef.current = null;
    inputRef.current = emptyInput();
    if (editorTool) {
      editorCameraRef.current = clampEditorCamera(
        map,
        cameraRef.current ?? resolvePlatformerCamera(map, stateRef.current),
      );
      audioRef.current?.pauseMusic();
      const stopPlayback = window.setTimeout(() => setPlaying(false), 0);
      render(performance.now() / 1000);
      return () => window.clearTimeout(stopPlayback);
    }
    render(performance.now() / 1000);
  }, [editorTool, map, render]);

  useEffect(() => {
    if (!playing) return;
    let animationFrame = 0;
    let previousTime = performance.now();
    let accumulator = 0;
    let previousDomSyncTime = previousTime;
    let previousDomStatus = stateRef.current.status;

    const frame = (time: number) => {
      const frameDelta = Math.min((time - previousTime) / 1000, MAX_FRAME_DELTA_SECONDS);
      previousTime = time;
      accumulator += frameDelta;
      let steps = 0;
      while (
        accumulator >= FIXED_DELTA_SECONDS &&
        steps < MAX_CATCH_UP_STEPS &&
        stateRef.current.status !== "won"
      ) {
        const input = normalizeInput(inputRef.current);
        inputRef.current.jumpPressed = false;
        inputRef.current.weaponPressed = false;
        previousStateRef.current = stateRef.current;
        const result = stepPlatformer(map, physics, stateRef.current, input, weapon);
        stateRef.current = result.state;
        for (const event of result.events) audioRef.current?.play(event.type);
        accumulator -= FIXED_DELTA_SECONDS;
        steps += 1;
        if (result.state.status === "won") {
          victoryStartedAtRef.current ??= time / 1000;
          break;
        }
        if (result.state.status === "game_over") {
          syncRuntimeDom(stateRef.current);
          setTerminalStatus("game_over");
          setPlaying(false);
          audioRef.current?.pauseMusic();
          break;
        }
      }
      if (steps === MAX_CATCH_UP_STEPS) accumulator = 0;
      if (
        time - previousDomSyncTime >= 100 ||
        stateRef.current.status !== previousDomStatus
      ) {
        syncRuntimeDom(stateRef.current);
        previousDomSyncTime = time;
        previousDomStatus = stateRef.current.status;
      }
      const interpolationAlpha = accumulator / FIXED_DELTA_SECONDS;
      const activeCamera = resolvePlatformerCamera(map, stateRef.current);
      audioRef.current?.startMusic(resolveRuntimeMusicCue(
        resolveEnemyViewMusicCue(map, stateRef.current, activeCamera),
      ));
      render(
        time / 1000,
        interpolatePlatformerState(
          previousStateRef.current,
          stateRef.current,
          interpolationAlpha,
          map.tileSize,
        ),
      );
      const victoryElapsedSeconds = victoryStartedAtRef.current === null
        ? 0
        : time / 1000 - victoryStartedAtRef.current;
      const fireworksPlaying =
        stateRef.current.status === "won" &&
        victoryElapsedSeconds < MAP_COMPLETION_DELAY_SECONDS;
      if (
        stateRef.current.status === "playing" ||
        stateRef.current.status === "dying" ||
        fireworksPlaying
      ) {
        animationFrame = requestAnimationFrame(frame);
      } else if (stateRef.current.status === "won") {
        syncRuntimeDom(stateRef.current);
        setTerminalStatus("won");
        setPlaying(false);
        audioRef.current?.pauseMusic();
        if (!completionNotifiedRef.current) {
          completionNotifiedRef.current = true;
          onComplete?.();
        }
      }
    };
    animationFrame = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationFrame);
  }, [map, onComplete, physics, playing, render, syncRuntimeDom, weapon]);

  useEffect(() => {
    const gameHasFocus = () =>
      controlsDialogRef.current?.open !== true &&
      gameRef.current?.contains(document.activeElement) === true;
    const keyAction = (key: string) => {
      const normalizedKey = normalizeControlKey(key);
      if (!normalizedKey) return null;
      if (controlBindings.left.includes(normalizedKey)) return "left";
      if (controlBindings.right.includes(normalizedKey)) return "right";
      if (controlBindings.down.includes(normalizedKey)) return "down";
      if (controlBindings.jump.includes(normalizedKey)) return "jump";
      if (controlBindings.weapon.includes(normalizedKey)) return "weapon";
      return null;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (editorTool && !playing) return;
      const action = keyAction(event.key);
      if (!action || !gameHasFocus()) return;
      event.preventDefault();
      if (action === "jump") {
        if (!inputRef.current.jumpHeld) inputRef.current.jumpPressed = true;
        inputRef.current.jumpHeld = true;
      } else if (action === "weapon") {
        if (!inputRef.current.weaponHeld) inputRef.current.weaponPressed = true;
        inputRef.current.weaponHeld = true;
      } else {
        inputRef.current[action] = true;
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const action = keyAction(event.key);
      if (!action) return;
      if (action === "jump") inputRef.current.jumpHeld = false;
      else if (action === "weapon") inputRef.current.weaponHeld = false;
      else inputRef.current[action] = false;
    };
    const clearInput = () => {
      inputRef.current = emptyInput();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearInput);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearInput);
    };
  }, [controlBindings, editorTool, playing]);

  const start = useCallback(() => {
    editorStrokeRef.current = null;
    editorPanRef.current = null;
    if (stateRef.current.status === "won" || stateRef.current.status === "game_over") {
      stateRef.current = createInitialState(map);
      cameraRef.current = null;
      setTerminalStatus("playing");
    }
    victoryStartedAtRef.current = null;
    completionNotifiedRef.current = false;
    previousStateRef.current = stateRef.current;
    syncRuntimeDom(stateRef.current);
    setPlaying(true);
    const camera = resolvePlatformerCamera(map, stateRef.current);
    audioRef.current?.startMusic(resolveRuntimeMusicCue(
      resolveEnemyViewMusicCue(map, stateRef.current, camera),
    ));
    canvasRef.current?.focus();
  }, [map, syncRuntimeDom]);

  const announceEditor = (message: string) => {
    if (srStatusRef.current) srStatusRef.current.textContent = message;
  };

  const editorCellFromClientPoint = (
    clientX: number,
    clientY: number,
  ): EditorCell | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    if (
      bounds.width <= 0 ||
      bounds.height <= 0 ||
      clientX < bounds.left ||
      clientX > bounds.right ||
      clientY < bounds.top ||
      clientY > bounds.bottom
    ) {
      return null;
    }
    const camera = editorCameraRef.current
      ?? cameraRef.current
      ?? resolvePlatformerCamera(map, stateRef.current);
    const viewportWidth = map.camera.columns * map.tileSize;
    const viewportHeight = map.camera.rows * map.tileSize;
    const x = Math.floor(
      (camera.x + ((clientX - bounds.left) / bounds.width) * viewportWidth) /
        map.tileSize,
    );
    const y = Math.floor(
      (camera.y + ((clientY - bounds.top) / bounds.height) * viewportHeight) /
        map.tileSize,
    );
    if (x < 0 || y < 0 || x >= map.size.columns || y >= map.size.rows) {
      return null;
    }
    return { x, y };
  };

  const keepEditorCellVisible = (cell: EditorCell) => {
    const viewportWidth = map.camera.columns * map.tileSize;
    const viewportHeight = map.camera.rows * map.tileSize;
    const current = editorCameraRef.current
      ?? cameraRef.current
      ?? resolvePlatformerCamera(map, stateRef.current);
    let x = current.x;
    let y = current.y;
    const cellLeft = cell.x * map.tileSize;
    const cellRight = cellLeft + map.tileSize;
    const cellTop = cell.y * map.tileSize;
    const cellBottom = cellTop + map.tileSize;
    if (cellLeft < x) x = cellLeft;
    else if (cellRight > x + viewportWidth) x = cellRight - viewportWidth;
    if (cellTop < y) y = cellTop;
    else if (cellBottom > y + viewportHeight) y = cellBottom - viewportHeight;
    editorCameraRef.current = clampEditorCamera(map, { x, y });
  };

  const addCellsToEditorStroke = (
    stroke: EditorPaintStroke,
    nextCell: EditorCell,
  ) => {
    for (const cell of cellsAlongLine(stroke.lastCell, nextCell)) {
      stroke.cells.set(`${cell.x}:${cell.y}`, { ...cell, kind: stroke.kind });
    }
    stroke.lastCell = nextCell;
    editorCursorRef.current = nextCell;
    editorHoverRef.current = nextCell;
    render(performance.now() / 1000);
  };

  const handleEditorPointerDown = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (!editorTool || playing) {
      event.currentTarget.focus();
      return;
    }

    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    inputRef.current = emptyInput();

    if (editorTool === "move") {
      const camera = editorCameraRef.current
        ?? cameraRef.current
        ?? resolvePlatformerCamera(map, stateRef.current);
      editorPanRef.current = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        camera,
      };
      event.currentTarget.dataset.panning = "true";
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    const cell = editorCellFromClientPoint(event.clientX, event.clientY);
    if (!cell) return;
    editorCursorRef.current = cell;
    editorHoverRef.current = cell;

    if (editorTool === "select") {
      const object = platformerObjectAtPreviewCell(
        map,
        stateRef.current,
        cell.x,
        cell.y,
      );
      if (object) {
        editorSelectionRef.current = cell;
        onObjectSelect?.(object.id);
        announceEditor(`Selected ${object.id} at column ${cell.x + 1}, row ${cell.y + 1}.`);
        render(performance.now() / 1000);
        return;
      }
      const kind = platformerTerrainKindAt(map, cell.x, cell.y);
      editorSelectionRef.current = kind === "empty" ? null : cell;
      onObjectSelect?.(null);
      announceEditor(
        kind === "empty"
          ? `Column ${cell.x + 1}, row ${cell.y + 1} is empty.`
          : `Selected ${kind} at column ${cell.x + 1}, row ${cell.y + 1}.`,
      );
      render(performance.now() / 1000);
      return;
    }

    if (PLATFORMER_OBJECT_TOOLS.includes(editorTool as (typeof PLATFORMER_OBJECT_TOOLS)[number])) {
      onObjectPlace?.({
        id: `build-${editorTool}-${Date.now().toString(36)}`,
        x: cell.x,
        y: cell.y,
        kind: editorTool as PlatformerObjectPlacement["kind"],
      });
      editorSelectionRef.current = cell;
      announceEditor(`Added ${EDITOR_TOOL_LABELS[editorTool]} at column ${cell.x + 1}, row ${cell.y + 1}.`);
      return;
    }

    const kind = editorPaintKind(editorTool);
    if (!kind) return;
    editorSelectionRef.current = null;
    const stroke: EditorPaintStroke = {
      pointerId: event.pointerId,
      kind,
      cells: new Map(),
      lastCell: cell,
    };
    editorStrokeRef.current = stroke;
    addCellsToEditorStroke(stroke, cell);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleEditorPointerMove = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (!editorTool || playing) return;
    const pan = editorPanRef.current;
    if (pan?.pointerId === event.pointerId) {
      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      const viewportWidth = map.camera.columns * map.tileSize;
      const viewportHeight = map.camera.rows * map.tileSize;
      editorCameraRef.current = clampEditorCamera(map, {
        x: pan.camera.x -
          ((event.clientX - pan.clientX) / Math.max(1, bounds.width)) * viewportWidth,
        y: pan.camera.y -
          ((event.clientY - pan.clientY) / Math.max(1, bounds.height)) * viewportHeight,
      });
      editorHoverRef.current = null;
      render(performance.now() / 1000);
      return;
    }

    const cell = editorCellFromClientPoint(event.clientX, event.clientY);
    const stroke = editorStrokeRef.current;
    if (stroke?.pointerId === event.pointerId && cell) {
      event.preventDefault();
      addCellsToEditorStroke(stroke, cell);
      return;
    }
    editorHoverRef.current = cell;
    if (cell) editorCursorRef.current = cell;
    render(performance.now() / 1000);
  };

  const finishEditorPointer = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    const pan = editorPanRef.current;
    if (pan?.pointerId === event.pointerId) {
      editorPanRef.current = null;
      delete event.currentTarget.dataset.panning;
      announceEditor("Map moved. Choose a block to keep building.");
    }

    const stroke = editorStrokeRef.current;
    if (stroke?.pointerId === event.pointerId) {
      const cells = [...stroke.cells.values()];
      editorStrokeRef.current = null;
      if (cells.length > 0) {
        onTerrainStroke?.(cells);
        const label = stroke.kind === "empty" ? "block" : stroke.kind;
        announceEditor(
          stroke.kind === "empty"
            ? `Erased ${cells.length} ${cells.length === 1 ? "block" : "blocks"}.`
            : `Added ${cells.length} ${label} ${cells.length === 1 ? "block" : "blocks"}.`,
        );
      }
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    render(performance.now() / 1000);
  };

  const handleEditorPointerLeave = () => {
    if (editorPanRef.current || editorStrokeRef.current) return;
    editorHoverRef.current = null;
    render(performance.now() / 1000);
  };

  const startFromCanvas = useCallback(() => {
    if (!assetsReady) return;
    if (!playing) {
      start();
      return;
    }
    canvasRef.current?.focus();
  }, [assetsReady, playing, start]);

  const handleCanvasKeyDown = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    if (editorTool && !playing) {
      const arrowDelta: Record<string, EditorCell> = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
      };
      const delta = arrowDelta[event.key];
      if (delta) {
        event.preventDefault();
        inputRef.current = emptyInput();
        if (editorTool === "move") {
          const camera = editorCameraRef.current
            ?? cameraRef.current
            ?? resolvePlatformerCamera(map, stateRef.current);
          editorCameraRef.current = clampEditorCamera(map, {
            x: camera.x + delta.x * map.tileSize,
            y: camera.y + delta.y * map.tileSize,
          });
          announceEditor("Map moved one block.");
        } else {
          const current = editorCursorRef.current ?? { x: 0, y: 0 };
          const next = {
            x: clamp(current.x + delta.x, 0, map.size.columns - 1),
            y: clamp(current.y + delta.y, 0, map.size.rows - 1),
          };
          editorCursorRef.current = next;
          editorHoverRef.current = null;
          keepEditorCellVisible(next);
          announceEditor(`Column ${next.x + 1}, row ${next.y + 1}.`);
        }
        render(performance.now() / 1000);
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        inputRef.current = emptyInput();
        const cell = editorCursorRef.current;
        if (!cell || editorTool === "move") return;
        if (editorTool === "select") {
          const object = platformerObjectAtPreviewCell(
            map,
            stateRef.current,
            cell.x,
            cell.y,
          );
          if (object) {
            editorSelectionRef.current = cell;
            onObjectSelect?.(object.id);
            announceEditor(`Selected ${object.id} at column ${cell.x + 1}, row ${cell.y + 1}.`);
            render(performance.now() / 1000);
            return;
          }
          const kind = platformerTerrainKindAt(map, cell.x, cell.y);
          editorSelectionRef.current = kind === "empty" ? null : cell;
          onObjectSelect?.(null);
          announceEditor(
            kind === "empty"
              ? `Column ${cell.x + 1}, row ${cell.y + 1} is empty.`
              : `Selected ${kind} at column ${cell.x + 1}, row ${cell.y + 1}.`,
          );
        } else if (PLATFORMER_OBJECT_TOOLS.includes(editorTool as (typeof PLATFORMER_OBJECT_TOOLS)[number])) {
          onObjectPlace?.({
            id: `build-${editorTool}-${Date.now().toString(36)}`,
            x: cell.x,
            y: cell.y,
            kind: editorTool as PlatformerObjectPlacement["kind"],
          });
          editorSelectionRef.current = cell;
          announceEditor(`Added ${EDITOR_TOOL_LABELS[editorTool]} at column ${cell.x + 1}, row ${cell.y + 1}.`);
        } else {
          const kind = editorPaintKind(editorTool);
          if (kind) {
            onTerrainStroke?.([{ ...cell, kind }]);
            announceEditor(
              kind === "empty"
                ? `Erased block at column ${cell.x + 1}, row ${cell.y + 1}.`
                : `Added ${kind} at column ${cell.x + 1}, row ${cell.y + 1}.`,
            );
          }
        }
        render(performance.now() / 1000);
        return;
      }
      return;
    }

    if (event.key !== "Enter" || playing) return;
    event.preventDefault();
    startFromCanvas();
  };

  useEffect(() => {
    if (!autoPlay || !assetsReady || autoPlayStartedRef.current) return;
    autoPlayStartedRef.current = true;
    start();
  }, [assetsReady, autoPlay, start]);

  const pause = () => {
    const snappedState = snapPlatformerStateToGrid(map, stateRef.current);
    stateRef.current = snappedState;
    editorCameraRef.current = clampEditorCamera(
      map,
      resolvePlatformerCamera(map, snappedState),
    );
    setPlaying(false);
    previousStateRef.current = snappedState;
    inputRef.current = emptyInput();
    syncRuntimeDom(snappedState);
    audioRef.current?.pauseMusic();
    render(performance.now() / 1000, snappedState);
  };

  const togglePlayback = () => {
    if (playing) {
      pause();
      return;
    }
    start();
  };

  const reset = () => {
    pause();
    victoryStartedAtRef.current = null;
    completionNotifiedRef.current = false;
    stateRef.current = createInitialState(map);
    previousStateRef.current = stateRef.current;
    cameraRef.current = null;
    editorCameraRef.current = resolvePlatformerCamera(map, stateRef.current);
    setTerminalStatus("playing");
    syncRuntimeDom(stateRef.current);
    render(performance.now() / 1000);
    canvasRef.current?.focus();
  };

  const toggleMuted = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    audioRef.current?.setMuted(nextMuted);
    window.localStorage.setItem("splat-lab.game-audio-muted.v1", String(nextMuted));
  };

  const setPointerInput = (action: "left" | "right" | "jump" | "weapon", active: boolean) => {
    if (action === "jump") {
      if (active && !inputRef.current.jumpHeld) inputRef.current.jumpPressed = true;
      inputRef.current.jumpHeld = active;
    } else if (action === "weapon") {
      if (active && !inputRef.current.weaponHeld) inputRef.current.weaponPressed = true;
      inputRef.current.weaponHeld = active;
    } else {
      inputRef.current[action] = active;
    }
    canvasRef.current?.focus();
  };

  const showControlsDialog = () => {
    inputRef.current = emptyInput();
    setCapturingBinding(null);
    setControlError("");
    controlsDialogRef.current?.showModal();
  };

  const closeControlsDialog = () => {
    setCapturingBinding(null);
    setControlError("");
    controlsDialogRef.current?.close();
  };

  const captureControlKey = (event: ReactKeyboardEvent<HTMLDialogElement>) => {
    if (!capturingBinding) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      setCapturingBinding(null);
      setControlError("");
      return;
    }
    const nextKey = normalizeControlKey(event.key);
    if (!nextKey) {
      setControlError("Choose a letter, number, arrow key, or Space.");
      return;
    }
    const duplicateAction = CONTROL_ACTIONS.find((action) =>
      controlBindings[action].some(
        (key, index) =>
          key === nextKey &&
          (action !== capturingBinding.action || index !== capturingBinding.index),
      ),
    );
    if (duplicateAction) {
      setControlError(`${displayControlKey(nextKey)} is already assigned to ${CONTROL_ACTION_LABELS[duplicateAction].toLowerCase()}.`);
      return;
    }
    const nextBindings: ControlBindings = {
      ...controlBindings,
      [capturingBinding.action]: controlBindings[capturingBinding.action].map((key, index) =>
        index === capturingBinding.index ? nextKey : key,
      ),
    };
    setControlBindings(nextBindings);
    window.localStorage.setItem(CONTROL_BINDINGS_STORAGE_KEY, JSON.stringify(nextBindings));
    setCapturingBinding(null);
    setControlError("");
  };

  const resetControlBindings = () => {
    const defaults = copyDefaultControlBindings();
    setControlBindings(defaults);
    window.localStorage.setItem(CONTROL_BINDINGS_STORAGE_KEY, JSON.stringify(defaults));
    setCapturingBinding(null);
    setControlError("");
  };

  const controls = controlSummary(controlBindings);
  const building = Boolean(editorTool);
  const editing = building && !playing;
  const editorInstruction = editorTool
    ? editorTool === "move"
      ? "Drag the map to move around"
      : editorTool === "select"
        ? "Click a block to select it"
        : editorTool === "erase"
          ? "Click or drag to erase blocks"
          : PLATFORMER_OBJECT_TOOLS.includes(editorTool as (typeof PLATFORMER_OBJECT_TOOLS)[number])
            ? `Click to add ${EDITOR_TOOL_LABELS[editorTool].toLowerCase()}`
            : `Click or drag to add ${editorTool} blocks`
    : "";

  const statusMessage =
    terminalStatus === "won"
      ? playing ? null : "Level complete!"
      : terminalStatus === "game_over"
        ? "Game over — reset to try again"
        : !assetsReady
          ? "Loading level…"
          : editing
            ? null
          : !playing
            ? `Click the map or press Play, then use ${controls.replace("Move: ", "")}`
            : null;

  return (
    <div
      className={`${styles.game} ${className ?? ""}`}
      ref={gameRef}
      data-player={playerAssetId}
      data-skin-tone={isCustomizableHumanAsset(playerAssetId) ? skinTone : undefined}
      data-hair-color={isCustomizableHumanAsset(playerAssetId) ? hairColor : undefined}
      data-player-x={initialState.x.toFixed(2)}
      data-player-y={initialState.y.toFixed(2)}
      data-runtime-state={initialState.status}
      data-runtime-tick={initialState.tick}
      data-attack-ticks={initialState.attackTicksRemaining}
      data-death-ticks={initialState.deathTicksRemaining}
      data-editor-mode={editing ? "true" : undefined}
    >
      <div className={`${styles.toolbar} ${building ? styles.editorToolbar : ""}`} aria-label={building ? "Build instructions" : "Game playback controls"}>
        {!building ? (
          <div className={styles.buttonGroup}>
            <button className={styles.playbackButton} type="button" onClick={togglePlayback} disabled={!assetsReady}>
              {playing ? "Ⅱ Pause" : "▶ Play"}
            </button>
            <button type="button" onClick={reset}>
              ↻ Reset
            </button>
            <button type="button" onClick={toggleMuted} aria-pressed={muted}>
              {muted ? "🔇 Muted" : "🔊 Sound"}
            </button>
          </div>
        ) : null}
        <p className={styles.controlHint}>
          {editing ? `Build mode · ${editorInstruction}` : controls}
        </p>
      </div>

      <div className={styles.stage}>
        <canvas
          className={styles.canvas}
          ref={canvasRef}
          tabIndex={0}
          aria-label={
            editing
              ? `Editable ${map.id} platformer map. ${editorInstruction}. Use arrow keys to move the editing cursor and Enter or Space to use the selected tool.`
              : `Playable ${map.id} platformer. ${controls.replaceAll(" · ", ". ")}.`
          }
          data-editor-tool={editing ? editorTool : undefined}
          onClick={editorTool ? () => canvasRef.current?.focus() : startFromCanvas}
          onKeyDown={handleCanvasKeyDown}
          onPointerDown={handleEditorPointerDown}
          onPointerMove={handleEditorPointerMove}
          onPointerUp={finishEditorPointer}
          onPointerCancel={finishEditorPointer}
          onPointerLeave={handleEditorPointerLeave}
        />
        {editing ? (
          <div className={styles.editorBadge} aria-hidden="true">
            <span>Build mode</span>
            <strong>{editorTool ? EDITOR_TOOL_LABELS[editorTool] : "Select"}</strong>
          </div>
        ) : null}
        {statusMessage ? (
          <div className={styles.stageMessage} aria-hidden="true">
            <strong>{statusMessage}</strong>
          </div>
        ) : null}
      </div>

      <div className={`${styles.controlRow} ${building ? styles.editorControlRow : ""}`}>
        {controlRowLeading}
        {building ? (
          <div className={styles.buildPlaybackControls} aria-label="Game playback controls">
            <button type="button" onClick={reset} aria-label="Reset game" title="Reset game">
              ↻ Reset
            </button>
            <button
              className={styles.buildPlaybackButton}
              type="button"
              onClick={togglePlayback}
              disabled={!assetsReady}
              aria-label={playing ? "Pause game" : "Test game"}
              title={playing ? "Pause game" : "Test game"}
            >
              <span
                className={`${styles.playbackIcon} ${playing ? styles.pauseIcon : styles.playIcon}`}
                aria-hidden="true"
              >
                {playing ? "Ⅱ" : "▶"}
              </span>
            </button>
            <button
              type="button"
              onClick={toggleMuted}
              aria-label={muted ? "Turn sound on" : "Mute sound"}
              title={muted ? "Turn sound on" : "Mute sound"}
              aria-pressed={muted}
            >
              {muted ? "🔇 Muted" : "🔊 Sound"}
            </button>
          </div>
        ) : null}
        <div
          className={`${styles.touchControls} ${editing ? styles.editorControls : ""}`}
          aria-label={editing ? "Map control tools" : "On-screen movement controls"}
        >
          {editing ? (
            <>
            <button
              type="button"
              aria-pressed={editorTool === "select"}
              title="Select a block on the map"
              onClick={() => onEditorToolChange?.("select")}
            >
              ↖ Select
            </button>
            <button
              type="button"
              aria-pressed={editorTool === "move"}
              title="Drag the map to see another area"
              onClick={() => onEditorToolChange?.("move")}
            >
              ✋ Move
            </button>
            <button
              type="button"
              aria-pressed={editorTool === "erase"}
              title="Drag across blocks to erase them"
              onClick={() => onEditorToolChange?.("erase")}
            >
              × Erase
            </button>
            </>
          ) : (
            <>
              <button
                className={styles.keyboardButton}
                type="button"
                aria-label="Change movement keys"
                title="Change movement keys"
                onClick={showControlsDialog}
              >
                <span aria-hidden="true">⌨</span>
              </button>
              <button
                type="button"
                onPointerDown={() => setPointerInput("left", true)}
                onPointerUp={() => setPointerInput("left", false)}
                onPointerCancel={() => setPointerInput("left", false)}
                onPointerLeave={() => setPointerInput("left", false)}
              >
                ← Left
              </button>
              <button
                type="button"
                onPointerDown={() => setPointerInput("right", true)}
                onPointerUp={() => setPointerInput("right", false)}
                onPointerCancel={() => setPointerInput("right", false)}
                onPointerLeave={() => setPointerInput("right", false)}
              >
                Right →
              </button>
              <button
                className={styles.jumpButton}
                type="button"
                onPointerDown={() => setPointerInput("jump", true)}
                onPointerUp={() => setPointerInput("jump", false)}
                onPointerCancel={() => setPointerInput("jump", false)}
                onPointerLeave={() => setPointerInput("jump", false)}
              >
                ↑ Jump
              </button>
              <button
                className={styles.weaponButton}
                type="button"
                onPointerDown={() => setPointerInput("weapon", true)}
                onPointerUp={() => setPointerInput("weapon", false)}
                onPointerCancel={() => setPointerInput("weapon", false)}
                onPointerLeave={() => setPointerInput("weapon", false)}
              >
                X Sword
              </button>
            </>
          )}
        </div>
      </div>
      <dialog
        className={styles.controlsDialog}
        ref={controlsDialogRef}
        aria-labelledby="controls-dialog-title"
        onKeyDown={captureControlKey}
        onClose={() => {
          setCapturingBinding(null);
          setControlError("");
        }}
        onCancel={(event) => {
          if (!capturingBinding) return;
          event.preventDefault();
          setCapturingBinding(null);
          setControlError("");
        }}
      >
        <button
          className={styles.dialogCloseButton}
          type="button"
          aria-label="Close movement key settings"
          onClick={closeControlsDialog}
        >
          ×
        </button>
        <header className={styles.dialogHeading}>
          <span aria-hidden="true">⌨</span>
          <div>
            <h2 id="controls-dialog-title">Change movement keys</h2>
            <p>Select a key below, then press its replacement.</p>
          </div>
        </header>
        <div className={styles.bindingList}>
          {CONTROL_ACTIONS.map((action) => (
            <section className={styles.bindingRow} key={action} aria-labelledby={`binding-${action}`}>
              <h3 id={`binding-${action}`}>{CONTROL_ACTION_LABELS[action]}</h3>
              <div className={styles.bindingKeys}>
                {controlBindings[action].map((key, index) => {
                  const isCapturing =
                    capturingBinding?.action === action && capturingBinding.index === index;
                  return (
                    <button
                      className={isCapturing ? styles.capturingKey : ""}
                      type="button"
                      key={`${action}-${index}`}
                      aria-pressed={isCapturing}
                      aria-label={`Change ${CONTROL_ACTION_LABELS[action].toLowerCase()} key ${displayControlKey(key)}`}
                      onClick={() => {
                        setCapturingBinding({ action, index });
                        setControlError("");
                      }}
                    >
                      {isCapturing ? "Press a key…" : displayControlKey(key)}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <p className={styles.controlError} role="status" aria-live="polite">
          {controlError || (capturingBinding ? "Waiting for a new key…" : "")}
        </p>
        <footer className={styles.dialogActions}>
          <button type="button" onClick={resetControlBindings}>Reset defaults</button>
          <button className={styles.doneButton} type="button" onClick={closeControlsDialog}>Done</button>
        </footer>
      </dialog>
      <p className={styles.srStatus} aria-live="polite" ref={srStatusRef}>
        {`${initialState.lives} lives and ${initialState.collectedIds.length} coins collected.`}
      </p>
    </div>
  );
}
