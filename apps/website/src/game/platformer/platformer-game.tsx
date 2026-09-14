"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";

import {
  assetUrl,
  collectedCoinAssetId,
  hazardSheetForAssetId,
  imageKeyForAssetId,
  IMAGE_URLS,
  loadingBackdrop,
  resolveMapVisuals,
  type ImageKey,
} from "./art-catalog";
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
  clampEditorCamera,
  editorHeroCell,
  editorHeroPlacementForCell,
  editorViewportForScale,
  translateHeroWithEditorCamera,
  withEditorSessionSpawn,
  resolveEditorPlaySpawn,
  snapPlatformerStateToGrid,
  resolveVisualMotionOffset,
  resolveWorldBottomBackgroundOffset,
  stepPlatformer,
  viewportPixelSize,
  zoomEditorCamera,
  type PlatformerCamera,
  type PlatformerViewport,
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
  fullscreenButtonLabel,
  useGameFullscreen,
} from "@/game/fullscreen";
import { GameLoadingOverlay } from "@/game/game-loading-overlay";
import {
  isCustomizableHumanAsset,
  loadSpriteImage,
  recolorHumanSprite,
} from "@/game/player-appearance";
import {
  createSpritePreloader,
  spritePreloadTotal,
} from "@/game/sprite-preload";
import type {
  HairColor,
  PlatformerObjectKind,
  PlatformerTerrainKind,
  PlayerAssetId,
  SkinTone,
} from "@/lib/game-contract";
import {
  applyPlatformerEditorSelectionClick,
  clampPlatformerSelectionDelta,
  EMPTY_PLATFORMER_EDITOR_SELECTION,
  isPlatformerObjectTool,
  objectPlacementsFromStroke,
  platformerEditorCursor,
  platformerEditorHitAtCell,
  platformerEditorSelectionCells,
  platformerEditorSelectionHasCell,
  platformerHudAtViewportCell,
  platformerSelectionWithoutObject,
  platformerTerrainKindAt,
  platformerUnselectableHeroId,
  type PlatformerEditTool,
  type PlatformerEditorSelection,
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
import {
  CanvasScreenshotMenu,
  type CanvasScreenshotMenuHandle,
} from "../canvas-screenshot-menu";
import {
  createCanvasThumbnailDataUrl,
  type GameThumbnailCapture,
} from "../canvas-screenshot";
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
  levelLabel?: string;
  completionMessage?: string;
  autoPlay?: boolean;
  hideEditorLabels?: boolean;
  startOverlayTitle?: string;
  onStartOverlayDismiss?: () => void;
  onThumbnailCaptureReady?: (capture: GameThumbnailCapture | null) => void;
  onUpdateThumbnail?: () => Promise<void>;
  editorTool?: PlatformerEditTool;
  onEditorToolChange?: (tool: PlatformerEditTool) => void;
  onTerrainStroke?: (stroke: readonly PlatformerTerrainStrokeCell[]) => void;
  onObjectPlace?: (placements: readonly PlatformerObjectPlacement[]) => void;
  editorSelection?: PlatformerEditorSelection;
  onEditorSelectionChange?: (selection: PlatformerEditorSelection) => void;
  onEditorSelectionMove?: (
    dx: number,
    dy: number,
    selection: PlatformerEditorSelection,
  ) => void;
  onPlayingChange?: (playing: boolean) => void;
  onComplete?: (livesRemaining: number) => void;
  editorZoomScale?: number;
  mapAreaRef?: RefObject<HTMLDivElement | null>;
};

type ControlAction = "left" | "right" | "down" | "jump" | "weapon";
type ControlBindings = Record<ControlAction, string[]>;
type CapturingBinding = { action: ControlAction; index: number } | null;
type EditorCell = { x: number; y: number };
type EditorPaintStroke = {
  pointerId: number;
  objectKind: PlatformerObjectKind | null;
  terrainKind: PlatformerTerrainKind | null;
  cells: Map<string, EditorCell>;
  lastCell: EditorCell;
};
type EditorPan = {
  pointerId: number;
  clientX: number;
  clientY: number;
  camera: PlatformerCamera;
  hero: { x: number; y: number };
};
type EditorMoveStroke = {
  pointerId: number;
  origin: EditorCell;
  originCells: readonly EditorCell[];
  selection: PlatformerEditorSelection;
  delta: { dx: number; dy: number };
  clickUnselects: boolean;
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

const EDITOR_OBJECT_COLOR = "rgb(50 121 213 / 46%)";

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
  if (!tool || tool === "select" || tool === "move" || isPlatformerObjectTool(tool)) {
    return null;
  }
  return tool === "erase"
    ? "empty"
    : tool as Exclude<PlatformerTerrainKind, "empty">;
}

function playerSpawnCell(map: PlatformerMapSpec) {
  const spawn = map.objects.find((object) => object.type === "player_spawn");
  return spawn ? { id: spawn.id, x: spawn.x, y: spawn.y } : null;
}

function samePlayerSpawn(left: PlatformerMapSpec, right: PlatformerMapSpec) {
  const previous = playerSpawnCell(left);
  const next = playerSpawnCell(right);
  return previous?.id === next?.id && previous?.x === next?.x && previous?.y === next?.y;
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
  selected: readonly EditorCell[],
  pending: ReadonlyMap<string, EditorCell>,
  pendingTerrainKind: PlatformerTerrainKind | null,
  viewport: PlatformerViewport = map.camera,
) {
  const { width: viewportWidth, height: viewportHeight } = viewportPixelSize(
    map,
    viewport,
  );
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
    context.fillStyle = pendingTerrainKind
      ? EDITOR_TERRAIN_COLORS[pendingTerrainKind]
      : EDITOR_OBJECT_COLOR;
    context.fillRect(x + 2, y + 2, map.tileSize - 4, map.tileSize - 4);
    if (pendingTerrainKind === "empty") {
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

  for (const cell of selected) {
    context.strokeStyle = "#ffd52e";
    context.lineWidth = 5;
    context.strokeRect(
      cell.x * map.tileSize - camera.x + 3,
      cell.y * map.tileSize - camera.y + 3,
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
  viewport: PlatformerViewport = map.camera,
) {
  const { width: viewportWidth, height: viewportHeight } = viewportPixelSize(
    map,
    viewport,
  );
  const cameraX = camera.x;
  const cameraY = camera.y;
  const foregroundVerticalOffset = resolveWorldBottomBackgroundOffset(
    map,
    cameraY,
    viewport,
  );
  const visuals = resolveMapVisuals(map.presentation);

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
      // A tile painted from another world names its own art here, so one level
      // can show Graveyard ground beside its own.
      const overrideAssetId = overrides.get(`${column},${row}`)?.assetId;
      const overrideKey = imageKeyForAssetId(overrideAssetId)
        ?? (overrideAssetId as ImageKey | undefined);
      if (slot === "hazard") {
        const startFrame = overrides.get(`${column},${row}`)?.animationStartFrame ?? 1;
        // Hazard sheets disagree about their layout, so a borrowed spike reads
        // its own geometry rather than the level's.
        const sheet = hazardSheetForAssetId(overrideAssetId)
          ?? { columns: visuals.hazardColumns, frames: visuals.hazardFrames };
        const frame = (startFrame - 1 + Math.floor(elapsedSeconds * 8)) % sheet.frames;
        drawSheetFrame(
          context,
          images[overrideKey ?? visuals.hazard],
          sheet.columns,
          64,
          64,
          frame,
          x,
          y,
        );
      } else {
        const imageKey = slot === "ground"
          ? overrideKey ?? visuals.ground
          : slot === "platform"
            ? overrideKey ?? visuals.platform
            : overrideKey ?? visuals.obstacle;
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
    // A pickup placed from another world names its own art, so a level can hold
    // Graveyard coins beside its own.
    const objectKey = imageKeyForAssetId(object.assetId);
    if (object.type === "collectible") {
      const poofFrame = resolveCollectiblePoofFrame(state, object.id);
      if (poofFrame !== null) {
        const collectedKey = object.assetId
          ? imageKeyForAssetId(collectedCoinAssetId(object.assetId))
          : undefined;
        drawSheetFrame(
          context,
          images[collectedKey ?? visuals.coinCollected],
          2,
          64,
          64,
          poofFrame,
          x,
          y,
        );
      } else if (!state.collectedIds.includes(object.id)) {
        drawSheetFrame(context, images[objectKey ?? visuals.coin], 2, 64, 64, animationFrame, x, y);
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
      drawSheetFrame(
        context,
        images[objectKey ?? visuals.checkpoint],
        2,
        64,
        64,
        animationFrame,
        x,
        y,
      );
    } else if (object.type === "goal") {
      drawSheetFrame(
        context,
        images[objectKey ?? visuals.goal],
        2,
        64,
        96,
        animationFrame,
        x,
        y - 32,
        64,
        96,
      );
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
  levelLabel,
  completionMessage = "Level complete!",
  autoPlay = false,
  hideEditorLabels = false,
  startOverlayTitle,
  onStartOverlayDismiss,
  onThumbnailCaptureReady,
  onUpdateThumbnail,
  editorTool,
  onEditorToolChange,
  onTerrainStroke,
  onObjectPlace,
  editorSelection = EMPTY_PLATFORMER_EDITOR_SELECTION,
  onEditorSelectionChange,
  onEditorSelectionMove,
  onPlayingChange,
  onComplete,
  editorZoomScale = 1,
  mapAreaRef,
}: PlatformerGameProps) {
  const initialState = useMemo(() => createInitialState(map), [map]);
  const editorViewport = useMemo(
    () => editorViewportForScale(map, editorZoomScale),
    [editorZoomScale, map],
  );
  const [terminalStatus, setTerminalStatus] = useState<"playing" | "won" | "game_over">("playing");
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [assetsReady, setAssetsReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [controlBindings, setControlBindings] = useState<ControlBindings>(copyDefaultControlBindings);
  const [capturingBinding, setCapturingBinding] = useState<CapturingBinding>(null);
  const [controlError, setControlError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screenshotMenuRef = useRef<CanvasScreenshotMenuHandle>(null);
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
  const editorStrokeRef = useRef<EditorPaintStroke | null>(null);
  const editorObjectSeqRef = useRef(0);
  const editorPanRef = useRef<EditorPan | null>(null);
  const editorMoveRef = useRef<EditorMoveStroke | null>(null);
  const sessionSpawnRef = useRef<{ x: number; y: number } | null>(null);
  const pausedFromPlayRef = useRef(false);
  const renderedMapRef = useRef(map);
  const previousEditorToolRef = useRef(editorTool);
  const previousEditorZoomRef = useRef(editorZoomScale);
  const victoryStartedAtRef = useRef<number | null>(null);
  const completionNotifiedRef = useRef(false);
  const autoPlayStartedRef = useRef(false);
  const inputRef = useRef<InputState>(emptyInput());
  const imagesRef = useRef<Partial<Record<ImageKey, HTMLImageElement>>>({});
  const playerImageRef = useRef<CanvasImageSource | null>(null);
  const audioRef = useRef<RuntimeAudio | null>(null);
  const fullscreen = useGameFullscreen(gameRef);

  const backdrop = useMemo(
    () => loadingBackdrop(map.presentation),
    [map.presentation],
  );
  const backdropImageUrl = backdrop.imageUrl;

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
          ? completionMessage
          : "Game over — reset to try again";
    const srStatus = srStatusRef.current;
    if (srStatus && srStatus.textContent !== announcement) {
      srStatus.textContent = announcement;
    }
  }, [completionMessage, playerAssetId]);

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
    setLoadProgress(0);

    void (async () => {
      const sheets = Object.entries(IMAGE_URLS) as Array<[ImageKey, string]>;
      const track = createSpritePreloader(
        spritePreloadTotal({ sheetCount: sheets.length, playerAssetId }),
        (fraction) => {
          if (!cancelled) setLoadProgress(fraction);
        },
      );
      const loadSheet = async ([key, url]: [ImageKey, string]) => {
        const image = await track(url);
        if (image) imagesRef.current[key] = image;
      };

      // The loading screen shows the furthest background, so it is fetched
      // first rather than queued behind a hundred sprites on a slow line.
      const backdropSheet = sheets.find(([, url]) => url === backdropImageUrl);
      if (backdropSheet) await loadSheet(backdropSheet);
      await Promise.all(
        sheets.filter((sheet) => sheet !== backdropSheet).map(loadSheet),
      );

      const basePlayerImage = imagesRef.current[playerAssetId];
      if (basePlayerImage && isCustomizableHumanAsset(playerAssetId)) {
        const [skinMask, hairMask] = await Promise.all([
          track(assetUrl(`sprite-masks/${playerAssetId}-skin-mask.png`)),
          track(assetUrl(`sprite-masks/${playerAssetId}-hair-mask.png`)),
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
  }, [backdropImageUrl, hairColor, playerAssetId, skinTone]);

  const render = useCallback((elapsedSeconds: number, renderedState = stateRef.current) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const viewport = editorTool && !playing ? editorViewport : map.camera;
    const { width: logicalWidth, height: logicalHeight } = viewportPixelSize(
      map,
      viewport,
    );
    const runtimeCamera = resolvePlatformerCamera(map, renderedState);
    const camera = editorTool && !playing
      ? clampEditorCamera(map, editorCameraRef.current ?? runtimeCamera, viewport)
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
      viewport,
    );
    if (editorTool && !playing) {
      const move = editorMoveRef.current;
      drawEditorOverlay(
        context,
        map,
        camera,
        editorHoverRef.current ?? editorCursorRef.current,
        platformerEditorSelectionCells(
          map,
          renderedState,
          editorSelection,
          move?.delta,
        ),
        editorStrokeRef.current?.cells ?? new Map(),
        editorStrokeRef.current?.terrainKind ?? null,
        viewport,
      );
    }
  }, [editorSelection, editorTool, editorViewport, map, playerAssetId, playing, weapon]);

  const captureCleanThumbnail = useCallback(async () => {
    if (!assetsReady) {
      throw new Error("The game artwork is still loading.");
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      throw new Error("The game canvas is unavailable.");
    }

    const thumbnailSource = document.createElement("canvas");
    thumbnailSource.width = canvas.width;
    thumbnailSource.height = canvas.height;
    const context = thumbnailSource.getContext("2d");
    if (!context) {
      throw new Error("The game thumbnail canvas is unavailable.");
    }

    const logicalWidth = map.camera.columns * map.tileSize;
    const logicalHeight = map.camera.rows * map.tileSize;
    const camera = resolvePlatformerCamera(map, stateRef.current);
    context.setTransform(
      thumbnailSource.width / logicalWidth,
      0,
      0,
      thumbnailSource.height / logicalHeight,
      0,
      0,
    );
    context.imageSmoothingEnabled = true;
    drawWorld(
      context,
      map,
      stateRef.current,
      camera,
      imagesRef.current,
      performance.now() / 1000,
      weapon,
      playerAssetId,
      playerImageRef.current ?? imagesRef.current[playerAssetId],
      victoryStartedAtRef.current === null
        ? null
        : performance.now() / 1000 - victoryStartedAtRef.current,
    );

    return createCanvasThumbnailDataUrl(thumbnailSource);
  }, [assetsReady, map, playerAssetId, weapon]);

  useEffect(() => {
    if (!assetsReady) {
      onThumbnailCaptureReady?.(null);
      return;
    }

    onThumbnailCaptureReady?.(captureCleanThumbnail);
    return () => onThumbnailCaptureReady?.(null);
  }, [assetsReady, captureCleanThumbnail, onThumbnailCaptureReady]);

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
    const previousMap = renderedMapRef.current;
    renderedMapRef.current = map;
    const nextState = createInitialState(map);
    // Painting must not yank the panned hero back to spawn. A new spawn
    // still takes the hero, because that tool is how builders move the start.
    const keptHero = previousMap.id === map.id && samePlayerSpawn(previousMap, map);
    if (!keptHero) sessionSpawnRef.current = null;
    const sessionSpawn = sessionSpawnRef.current;
    const renderedState = keptHero
      ? sessionSpawn
        ? withEditorSessionSpawn(
            { ...nextState, facing: stateRef.current.facing },
            sessionSpawn,
          )
        : {
            ...nextState,
            x: stateRef.current.x,
            y: stateRef.current.y,
            previousY: stateRef.current.y,
            facing: stateRef.current.facing,
            vx: 0,
            vy: 0,
            spawnX: stateRef.current.spawnX,
            spawnY: stateRef.current.spawnY,
            checkpointX: stateRef.current.checkpointX,
            checkpointY: stateRef.current.checkpointY,
            latestCheckpointId: stateRef.current.latestCheckpointId,
          }
      : nextState;
    stateRef.current = renderedState;
    previousStateRef.current = renderedState;
    editorCameraRef.current = clampEditorCamera(
      map,
      editorCameraRef.current ?? resolvePlatformerCamera(map, nextState),
      editorViewport,
    );
    editorStrokeRef.current = null;
    editorPanRef.current = null;
    editorMoveRef.current = null;
    victoryStartedAtRef.current = null;
    completionNotifiedRef.current = false;
    inputRef.current = emptyInput();
    setTerminalStatus("playing");
    setPlaying(false);
    audioRef.current?.pauseMusic();
    syncRuntimeDom(renderedState);
    render(performance.now() / 1000, renderedState);
  }, [map, render, syncRuntimeDom]);

  useEffect(() => {
    if (previousEditorToolRef.current === editorTool) return;
    previousEditorToolRef.current = editorTool;
    editorStrokeRef.current = null;
    editorPanRef.current = null;
    editorMoveRef.current = null;
    inputRef.current = emptyInput();
    if (editorTool) {
      editorCameraRef.current = clampEditorCamera(
        map,
        cameraRef.current ?? resolvePlatformerCamera(map, stateRef.current),
        editorViewport,
      );
      audioRef.current?.pauseMusic();
      const stopPlayback = window.setTimeout(() => setPlaying(false), 0);
      render(performance.now() / 1000);
      return () => window.clearTimeout(stopPlayback);
    }
    render(performance.now() / 1000);
  }, [editorTool, editorViewport, map, render]);

  if (previousEditorZoomRef.current !== editorZoomScale) {
    const previousScale = previousEditorZoomRef.current;
    const fromViewport = editorViewportForScale(map, previousScale);
    previousEditorZoomRef.current = editorZoomScale;
    if (editorTool && !playing) {
      const camera = editorCameraRef.current
        ?? cameraRef.current
        ?? resolvePlatformerCamera(map, stateRef.current);
      // Zooming in frames the hero where the builder left them. The zoom never
      // drags the hero, so clicking a spot while zoomed out is what moves them.
      editorCameraRef.current = zoomEditorCamera(
        map,
        camera,
        fromViewport,
        editorViewport,
        editorZoomScale > previousScale
          ? editorHeroCell(map, stateRef.current)
          : null,
      );
    }
  }

  useEffect(() => {
    onPlayingChange?.(playing);
  }, [onPlayingChange, playing]);

  useEffect(() => () => {
    onPlayingChange?.(false);
  }, [onPlayingChange]);

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
          onComplete?.(stateRef.current.lives);
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
      const restarted = createInitialState(map);
      const sessionSpawn = sessionSpawnRef.current;
      stateRef.current = sessionSpawn
        ? withEditorSessionSpawn(restarted, sessionSpawn)
        : restarted;
      cameraRef.current = null;
      setTerminalStatus("playing");
    }
    if (editorTool && !pausedFromPlayRef.current) {
      const safe = resolveEditorPlaySpawn(map, stateRef.current);
      stateRef.current = withEditorSessionSpawn(stateRef.current, safe);
      sessionSpawnRef.current = { x: safe.x, y: safe.y };
    }
    pausedFromPlayRef.current = false;
    victoryStartedAtRef.current = null;
    completionNotifiedRef.current = false;
    previousStateRef.current = stateRef.current;
    syncRuntimeDom(stateRef.current);
    setPlaying(true);
    onStartOverlayDismiss?.();
    const camera = resolvePlatformerCamera(map, stateRef.current);
    audioRef.current?.startMusic(resolveRuntimeMusicCue(
      resolveEnemyViewMusicCue(map, stateRef.current, camera),
    ));
    canvasRef.current?.focus();
  }, [editorTool, map, onStartOverlayDismiss, syncRuntimeDom]);

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
    const { width: viewportWidth, height: viewportHeight } = viewportPixelSize(
      map,
      editorViewport,
    );
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

  const editorViewportCellFromClientPoint = (
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
    const { width: viewportWidth, height: viewportHeight } = viewportPixelSize(
      map,
      editorViewport,
    );
    return {
      x: Math.floor(((clientX - bounds.left) / bounds.width) * viewportWidth / map.tileSize),
      y: Math.floor(((clientY - bounds.top) / bounds.height) * viewportHeight / map.tileSize),
    };
  };

  const editorViewportCellForWorldCell = (cell: EditorCell): EditorCell => {
    const camera = editorCameraRef.current
      ?? cameraRef.current
      ?? resolvePlatformerCamera(map, stateRef.current);
    return {
      x: Math.floor((cell.x * map.tileSize - camera.x) / map.tileSize),
      y: Math.floor((cell.y * map.tileSize - camera.y) / map.tileSize),
    };
  };

  const unselectableHeroId = platformerUnselectableHeroId(map, editorZoomScale);
  const selectableSelection = platformerSelectionWithoutObject(
    editorSelection,
    unselectableHeroId,
  );

  const applySelectClick = (
    worldCell: EditorCell,
    viewportCell: EditorCell | null,
    toggle: boolean,
  ) => {
    const found = viewportCell && platformerHudAtViewportCell(map, viewportCell.x, viewportCell.y)
      ? { type: "hud" as const }
      : platformerEditorHitAtCell(map, stateRef.current, worldCell.x, worldCell.y);
    const hit = found.type === "object" && found.id === unselectableHeroId
      ? ({ type: "empty" } as const)
      : found;
    const nextSelection = applyPlatformerEditorSelectionClick(selectableSelection, hit, toggle);
    if (nextSelection === null) return null;
    onEditorSelectionChange?.(nextSelection);
    const count = nextSelection.objectIds.length + nextSelection.terrainCells.length;
    if (hit.type === "empty") {
      announceEditor(`Column ${worldCell.x + 1}, row ${worldCell.y + 1} is empty.`);
    } else if (hit.type === "object") {
      announceEditor(
        nextSelection.objectIds.includes(hit.id)
          ? `Selected ${hit.id} at column ${worldCell.x + 1}, row ${worldCell.y + 1}. ${count} selected.`
          : `Removed ${hit.id} from the selection.`,
      );
    } else if (hit.type === "terrain") {
      const kind = platformerTerrainKindAt(map, worldCell.x, worldCell.y);
      const stillSelected = nextSelection.terrainCells.some(
        (cell) => cell.x === hit.x && cell.y === hit.y,
      );
      announceEditor(
        stillSelected
          ? `Selected ${kind} at column ${worldCell.x + 1}, row ${worldCell.y + 1}. ${count} selected.`
          : `Removed ${kind} from the selection.`,
      );
    }
    return nextSelection;
  };

  const keepEditorCellVisible = (cell: EditorCell) => {
    const { width: viewportWidth, height: viewportHeight } = viewportPixelSize(
      map,
      editorViewport,
    );
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
    editorCameraRef.current = clampEditorCamera(map, { x, y }, editorViewport);
  };

  function applyEditorCamera(
    nextCamera: PlatformerCamera,
    fromHero: Pick<PlatformerState, "x" | "y"> = stateRef.current,
    fromCamera: PlatformerCamera | null = editorCameraRef.current,
    placedHero?: Pick<PlatformerState, "x" | "y">,
  ) {
    const from = fromCamera
      ?? cameraRef.current
      ?? resolvePlatformerCamera(map, stateRef.current);
    const to = clampEditorCamera(map, nextCamera, editorViewport);
    const hero = placedHero ?? translateHeroWithEditorCamera(map, fromHero, from, to);
    pausedFromPlayRef.current = false;
    sessionSpawnRef.current = { x: hero.x, y: hero.y };
    editorCameraRef.current = to;
    cameraRef.current = to;
    stateRef.current = withEditorSessionSpawn(stateRef.current, hero);
    previousStateRef.current = stateRef.current;
    syncRuntimeDom(stateRef.current);
  }

  const placeEditorHeroAtCell = (cell: EditorCell) => {
    const camera = editorCameraRef.current
      ?? cameraRef.current
      ?? resolvePlatformerCamera(map, stateRef.current);
    const hero = editorHeroPlacementForCell(map, stateRef.current, cell);
    applyEditorCamera(camera, stateRef.current, camera, hero);
    const placed = editorHeroCell(map, hero);
    announceEditor(`Moved the hero to column ${placed.x + 1}, row ${placed.y + 1}.`);
    render(performance.now() / 1000);
  };

  const addCellsToEditorStroke = (
    stroke: EditorPaintStroke,
    nextCell: EditorCell,
  ) => {
    if (stroke.objectKind === "spawn") {
      stroke.cells.clear();
      stroke.cells.set(`${nextCell.x}:${nextCell.y}`, nextCell);
    } else {
      for (const cell of cellsAlongLine(stroke.lastCell, nextCell)) {
        stroke.cells.set(`${cell.x}:${cell.y}`, cell);
      }
    }
    stroke.lastCell = nextCell;
    editorCursorRef.current = nextCell;
    editorHoverRef.current = nextCell;
    render(performance.now() / 1000);
  };

  const nextObjectPlacementId = (kind: PlatformerObjectKind, cell: EditorCell) => {
    editorObjectSeqRef.current += 1;
    return `build-${kind}-${cell.x}x${cell.y}-${editorObjectSeqRef.current.toString(36)}`;
  };

  const emitObjectPlacements = (
    kind: PlatformerObjectKind,
    cells: readonly EditorCell[],
  ) => {
    const placements = objectPlacementsFromStroke(
      kind,
      cells,
      (cell) => nextObjectPlacementId(kind, cell),
    );
    if (placements.length === 0) return;
    onObjectPlace?.(placements);
    const last = placements[placements.length - 1];
    announceEditor(
      kind === "spawn"
        ? `Set the hero spawn at column ${last.x + 1}, row ${last.y + 1}.`
        : `Added ${EDITOR_TOOL_LABELS[kind]} to ${placements.length} ${
            placements.length === 1 ? "tile" : "tiles"
          }.`,
    );
  };

  // Runs before any hero placement, so a selection still hits what the builder
  // saw under the pointer rather than the hero who is about to stand there.
  const beginEditorGesture = (
    event: ReactPointerEvent<HTMLCanvasElement>,
    cell: EditorCell | null,
  ) => {
    if (!editorTool) return;

    if (editorTool === "move") {
      const camera = editorCameraRef.current
        ?? cameraRef.current
        ?? resolvePlatformerCamera(map, stateRef.current);
      editorPanRef.current = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        camera,
        hero: { x: stateRef.current.x, y: stateRef.current.y },
      };
      event.currentTarget.dataset.panning = "true";
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (!cell) return;
    editorCursorRef.current = cell;
    editorHoverRef.current = cell;

    if (editorTool === "select") {
      const toggle = event.ctrlKey || event.metaKey;
      const alreadySelected = platformerEditorSelectionHasCell(
        map,
        stateRef.current,
        selectableSelection,
        cell.x,
        cell.y,
      );
      // Keep a selected item selected on pointer-down so a drag can still move
      // it. A click with no drag unselects on pointer-up.
      if (alreadySelected && !toggle) {
        editorMoveRef.current = {
          pointerId: event.pointerId,
          origin: cell,
          originCells: platformerEditorSelectionCells(map, stateRef.current, selectableSelection),
          selection: selectableSelection,
          delta: { dx: 0, dy: 0 },
          clickUnselects: true,
        };
        event.currentTarget.dataset.moving = "true";
        event.currentTarget.setPointerCapture(event.pointerId);
        render(performance.now() / 1000);
        return;
      }
      const nextSelection = applySelectClick(
        cell,
        editorViewportCellFromClientPoint(event.clientX, event.clientY),
        toggle,
      );
      if (
        nextSelection &&
        platformerEditorSelectionHasCell(map, stateRef.current, nextSelection, cell.x, cell.y)
      ) {
        editorMoveRef.current = {
          pointerId: event.pointerId,
          origin: cell,
          originCells: platformerEditorSelectionCells(map, stateRef.current, nextSelection),
          selection: nextSelection,
          delta: { dx: 0, dy: 0 },
          clickUnselects: false,
        };
        event.currentTarget.dataset.moving = "true";
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      render(performance.now() / 1000);
      return;
    }

    if (isPlatformerObjectTool(editorTool) || editorPaintKind(editorTool)) {
      const stroke: EditorPaintStroke = {
        pointerId: event.pointerId,
        objectKind: isPlatformerObjectTool(editorTool) ? editorTool : null,
        terrainKind: editorPaintKind(editorTool),
        cells: new Map(),
        lastCell: cell,
      };
      editorStrokeRef.current = stroke;
      addCellsToEditorStroke(stroke, cell);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
  };

  const handleEditorPointerDown = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (event.button !== 0) return;

    if (!editorTool || playing) {
      event.currentTarget.focus();
      return;
    }

    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    inputRef.current = emptyInput();

    const cell = editorCellFromClientPoint(event.clientX, event.clientY);
    // Clicking a spot on a zoomed-out map stands the hero there, so zooming
    // back in frames the place the builder picked. Panning is exempt: it
    // already carries the hero along with the map.
    const placingHero = Boolean(cell) && editorZoomScale < 1 && editorTool !== "move";
    // Dropped before the gesture runs so a selection the click makes still
    // wins, and so the hero the placement moves is left unselected.
    if (placingHero && selectableSelection !== editorSelection) {
      onEditorSelectionChange?.(selectableSelection);
    }
    beginEditorGesture(event, cell);
    if (placingHero && cell) placeEditorHeroAtCell(cell);
  };

  const handleEditorPointerMove = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (!editorTool || playing) return;
    const pan = editorPanRef.current;
    if (pan?.pointerId === event.pointerId) {
      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      const { width: viewportWidth, height: viewportHeight } = viewportPixelSize(
        map,
        editorViewport,
      );
      applyEditorCamera(
        {
          x: pan.camera.x -
            ((event.clientX - pan.clientX) / Math.max(1, bounds.width)) * viewportWidth,
          y: pan.camera.y -
            ((event.clientY - pan.clientY) / Math.max(1, bounds.height)) * viewportHeight,
        },
        pan.hero,
        pan.camera,
      );
      editorHoverRef.current = null;
      render(performance.now() / 1000);
      return;
    }

    const move = editorMoveRef.current;
    if (move?.pointerId === event.pointerId) {
      event.preventDefault();
      const cell = editorCellFromClientPoint(event.clientX, event.clientY);
      if (cell) {
        move.delta = clampPlatformerSelectionDelta(
          map,
          move.originCells,
          cell.x - move.origin.x,
          cell.y - move.origin.y,
        );
        editorCursorRef.current = cell;
        editorHoverRef.current = cell;
      }
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

    const move = editorMoveRef.current;
    if (move?.pointerId === event.pointerId) {
      editorMoveRef.current = null;
      delete event.currentTarget.dataset.moving;
      if (move.delta.dx !== 0 || move.delta.dy !== 0) {
        onEditorSelectionMove?.(move.delta.dx, move.delta.dy, move.selection);
        announceEditor("Moved the selection.");
      } else if (move.clickUnselects) {
        applySelectClick(
          move.origin,
          editorViewportCellForWorldCell(move.origin),
          false,
        );
      }
    }

    const stroke = editorStrokeRef.current;
    if (stroke?.pointerId === event.pointerId) {
      const cells = [...stroke.cells.values()];
      const terrainKind = stroke.terrainKind;
      const objectKind = stroke.objectKind;
      editorStrokeRef.current = null;
      if (objectKind) {
        emitObjectPlacements(objectKind, cells);
      } else if (terrainKind && cells.length > 0) {
        onTerrainStroke?.(cells.map((cell) => ({ ...cell, kind: terrainKind })));
        const label = terrainKind === "empty" ? "block" : terrainKind;
        announceEditor(
          terrainKind === "empty"
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
    if (editorPanRef.current || editorStrokeRef.current || editorMoveRef.current) return;
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
          applyEditorCamera({
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
          applySelectClick(
            cell,
            editorViewportCellForWorldCell(cell),
            event.ctrlKey || event.metaKey,
          );
        } else if (isPlatformerObjectTool(editorTool)) {
          emitObjectPlacements(editorTool, [cell]);
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
    if (!autoPlay || startOverlayTitle || !assetsReady || autoPlayStartedRef.current) return;
    autoPlayStartedRef.current = true;
    start();
  }, [assetsReady, autoPlay, start, startOverlayTitle]);

  const pause = () => {
    const snappedState = snapPlatformerStateToGrid(map, stateRef.current);
    stateRef.current = snappedState;
    pausedFromPlayRef.current = true;
    editorCameraRef.current = zoomEditorCamera(
      map,
      resolvePlatformerCamera(map, snappedState),
      map.camera,
      editorViewport,
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
    sessionSpawnRef.current = null;
    pausedFromPlayRef.current = false;
    stateRef.current = createInitialState(map);
    previousStateRef.current = stateRef.current;
    cameraRef.current = null;
    editorCameraRef.current = zoomEditorCamera(
      map,
      resolvePlatformerCamera(map, stateRef.current),
      map.camera,
      editorViewport,
    );
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

  const toggleFullscreen = () => {
    void fullscreen.toggle();
    // Keyboard play only works while focus stays inside the game element.
    canvasRef.current?.focus();
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
  const showToolbar = !(building && hideEditorLabels);
  const showStartOverlay = Boolean(startOverlayTitle) && !playing && terminalStatus === "playing";
  const editorInstruction = editorTool
    ? editorTool === "move"
      ? "Drag the map to move around"
      : editorTool === "select"
        ? "Click to add, click again to unselect, drag to move"
        : editorTool === "erase"
          ? "Click or drag to erase blocks"
          : isPlatformerObjectTool(editorTool)
            ? `Click or drag to add ${EDITOR_TOOL_LABELS[editorTool].toLowerCase()}`
            : `Click or drag to add ${editorTool} blocks`
    : "";

  const statusMessage =
    showStartOverlay
      ? null
      : terminalStatus === "won"
      ? playing ? null : completionMessage
      : terminalStatus === "game_over"
        ? "Game over — reset to try again"
        : !assetsReady
          ? null
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
      {showToolbar ? (
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
              {fullscreen.supported ? (
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  aria-pressed={fullscreen.active}
                  aria-label={fullscreen.active ? "Exit full screen" : "Play full screen"}
                  title={fullscreen.active ? "Exit full screen" : "Play full screen"}
                >
                  {fullscreenButtonLabel(fullscreen.active)}
                </button>
              ) : null}
            </div>
          ) : null}
          {!building && levelLabel ? (
            <p className={styles.levelLabel}>{levelLabel}</p>
          ) : null}
          <p className={styles.controlHint}>
            {editing ? `Build mode · ${editorInstruction}` : controls}
          </p>
        </div>
      ) : null}

      <div
        className={styles.stage}
        ref={mapAreaRef}
        style={{ "--stage-aspect": map.camera.columns / map.camera.rows } as CSSProperties}
      >
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
          data-editor-cursor={editing ? platformerEditorCursor(editorTool) : undefined}
          onClick={editorTool ? () => canvasRef.current?.focus() : startFromCanvas}
          onContextMenu={(event: ReactMouseEvent<HTMLCanvasElement>) => {
            event.preventDefault();
            screenshotMenuRef.current?.open(event.clientX, event.clientY);
          }}
          onKeyDown={handleCanvasKeyDown}
          onPointerDown={handleEditorPointerDown}
          onPointerMove={handleEditorPointerMove}
          onPointerUp={finishEditorPointer}
          onPointerCancel={finishEditorPointer}
          onPointerLeave={handleEditorPointerLeave}
        />
        <CanvasScreenshotMenu
          ref={screenshotMenuRef}
          canvasRef={canvasRef}
          gameId={map.id}
          onUpdateThumbnail={onUpdateThumbnail}
        />
        {showStartOverlay ? (
          <button
            className={styles.startOverlay}
            type="button"
            onClick={startFromCanvas}
            disabled={!assetsReady}
            aria-label={assetsReady ? `Play ${startOverlayTitle}` : `Loading ${startOverlayTitle}`}
          >
            <span className={styles.startOverlayContent}>
              <span className={styles.startOverlayTitle}>{startOverlayTitle}</span>
              <span className={styles.startOverlayPlay} aria-hidden="true">
                {assetsReady ? "▶" : "..."}
              </span>
            </span>
          </button>
        ) : null}
        {editing && !hideEditorLabels ? (
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
        {!assetsReady ? (
          <GameLoadingOverlay progress={loadProgress} {...backdrop} />
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
              title="Select items, then drag to move them"
              onClick={(event) => {
                event.stopPropagation();
                onEditorToolChange?.("select");
              }}
            >
              ↖ Select
            </button>
            <button
              type="button"
              aria-pressed={editorTool === "move"}
              title="Drag the map to see another area"
              onClick={(event) => {
                event.stopPropagation();
                onEditorToolChange?.("move");
              }}
            >
              ✋ Move
            </button>
            <button
              type="button"
              aria-pressed={editorTool === "erase"}
              title="Drag across blocks to erase them"
              onClick={(event) => {
                event.stopPropagation();
                onEditorToolChange?.("erase");
              }}
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
