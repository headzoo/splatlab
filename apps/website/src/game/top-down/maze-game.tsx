"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  createInitialMazeState,
  MAZE_FIXED_DELTA_SECONDS,
  MAZE_MAX_CATCH_UP_STEPS,
  MAZE_MAX_FRAME_DELTA_SECONDS,
  resolveMazeCamera,
  stepMaze,
} from "./engine";
import { resolveBodyMotionOffset } from "../motion";
import {
  isCustomizableHumanAsset,
  loadSpriteImage,
  recolorHumanSprite,
} from "../player-appearance";
import type {
  HairColor,
  PlayerAssetId,
  SkinTone,
} from "@/lib/game-contract";
import type { MazeCamera, MazeDirection, MazeInput, MazeMapSpec, MazeState } from "./types";
import styles from "../platformer/platformer-game.module.css";

type MazeGameProps = {
  map: MazeMapSpec;
  playerAssetId?: PlayerAssetId;
  skinTone?: SkinTone;
  hairColor?: HairColor;
  className?: string;
  controlRowLeading?: ReactNode;
};

type InputState = { left: boolean; right: boolean; up: boolean; down: boolean };
type VisualSlot = "floor" | "wall" | "obstacle" | "key" | "door";
type ThemePrefix = "green" | "haunted" | "space" | "dragons";
type ImageKey = `${ThemePrefix}${Capitalize<VisualSlot>}` | "enemy" | "hazard";

const emptyInput = (): InputState => ({ left: false, right: false, up: false, down: false });
const assetUrl = (path: string) => `/game-assets/${path}`;
const IMAGE_URLS: Record<ImageKey, string> = {
  greenFloor: assetUrl("sprites/neutral_green_hills_maze_floor_01.png"),
  greenWall: assetUrl("sprites/neutral_green_hills_maze_wall_01.png"),
  greenObstacle: assetUrl("sprites/neutral_green_hills_maze_obstacle_01.png"),
  greenKey: assetUrl("sprites/neutral_green_hills_maze_key_01.png"),
  greenDoor: assetUrl("sprites/neutral_green_hills_maze_door_01.png"),
  hauntedFloor: assetUrl("sprites/haunted_graveyard_maze_floor_01.png"),
  hauntedWall: assetUrl("sprites/haunted_graveyard_maze_wall_01.png"),
  hauntedObstacle: assetUrl("sprites/haunted_graveyard_maze_obstacle_01.png"),
  hauntedKey: assetUrl("sprites/haunted_graveyard_maze_key_01.png"),
  hauntedDoor: assetUrl("sprites/haunted_graveyard_maze_door_01.png"),
  spaceFloor: assetUrl("sprites/space_maze_floor_01.png"),
  spaceWall: assetUrl("sprites/space_maze_wall_01.png"),
  spaceObstacle: assetUrl("sprites/space_maze_obstacle_01.png"),
  spaceKey: assetUrl("sprites/space_maze_key_01.png"),
  spaceDoor: assetUrl("sprites/space_maze_door_01.png"),
  dragonsFloor: assetUrl("sprites/dragons_emberkeep_maze_floor_01.png"),
  dragonsWall: assetUrl("sprites/dragons_emberkeep_maze_wall_01.png"),
  dragonsObstacle: assetUrl("sprites/dragons_emberkeep_maze_obstacle_01.png"),
  dragonsKey: assetUrl("sprites/dragons_emberkeep_maze_key_01.png"),
  dragonsDoor: assetUrl("sprites/dragons_emberkeep_maze_door_01.png"),
  enemy: assetUrl("sprites/neutral_ghost_01.png"),
  hazard: assetUrl("sprites/shared_hole_hazard_01.png"),
};

type MazeVisualProfile = Record<VisualSlot, ImageKey> & { color: string };

function visualProfile(prefix: ThemePrefix, color: string): MazeVisualProfile {
  return {
    color,
    floor: `${prefix}Floor`,
    wall: `${prefix}Wall`,
    obstacle: `${prefix}Obstacle`,
    key: `${prefix}Key`,
    door: `${prefix}Door`,
  };
}

const GREEN_MAZE_VISUALS = visualProfile("green", "#8fcf68");
const MAZE_VISUALS: Record<string, MazeVisualProfile> = {
  maze_green_hills_01: GREEN_MAZE_VISUALS,
  maze_graveyard_01: visualProfile("haunted", "#322842"),
  maze_space_01: visualProfile("space", "#111936"),
  maze_dragon_world_01: visualProfile("dragons", "#472731"),
};

const DIRECTION_ROWS: Record<MazeDirection, number> = {
  down: 0,
  left: 1,
  right: 2,
  up: 3,
};

function drawSheetFrame(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource | undefined,
  columns: number,
  frameWidth: number,
  frameHeight: number,
  frame: number,
  x: number,
  y: number,
  width = frameWidth,
  height = frameHeight,
) {
  if (!image) return false;
  context.drawImage(
    image,
    (frame % columns) * frameWidth,
    Math.floor(frame / columns) * frameHeight,
    frameWidth,
    frameHeight,
    x,
    y,
    width,
    height,
  );
  return true;
}

function wallMaskAt(map: MazeMapSpec, x: number, y: number) {
  let mask = 0;
  if (map.tiles[y - 1]?.[x] === "#") mask |= 1;
  if (map.tiles[y]?.[x + 1] === "#") mask |= 2;
  if (map.tiles[y + 1]?.[x] === "#") mask |= 4;
  if (map.tiles[y]?.[x - 1] === "#") mask |= 8;
  return mask;
}

function drawActor(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource | undefined,
  direction: MazeDirection,
  x: number,
  y: number,
  moving: boolean,
  elapsedSeconds: number,
) {
  const column = moving ? 1 + Math.floor(elapsedSeconds * 8) % 4 : 0;
  return drawSheetFrame(
    context,
    image,
    5,
    64,
    64,
    DIRECTION_ROWS[direction] * 5 + column,
    x - 32,
    y - 56,
  );
}

function drawMaze(
  context: CanvasRenderingContext2D,
  map: MazeMapSpec,
  state: MazeState,
  camera: MazeCamera,
  images: Partial<Record<ImageKey, HTMLImageElement>>,
  playerImage: CanvasImageSource | undefined,
  elapsedSeconds: number,
) {
  const tileSize = map.tileSize;
  const visuals = MAZE_VISUALS[map.id] ?? GREEN_MAZE_VISUALS;
  const motionElapsedMilliseconds = state.tick * MAZE_FIXED_DELTA_SECONDS * 1000;
  const viewportWidth = map.camera.columns * tileSize;
  const viewportHeight = map.camera.rows * tileSize;
  context.clearRect(0, 0, viewportWidth, viewportHeight);
  context.fillStyle = visuals.color;
  context.fillRect(0, 0, viewportWidth, viewportHeight);
  context.save();
  context.translate(-camera.x, -camera.y);

  const firstX = Math.max(0, Math.floor(camera.x / tileSize));
  const lastX = Math.min(map.width - 1, Math.ceil((camera.x + viewportWidth) / tileSize));
  const firstY = Math.max(0, Math.floor(camera.y / tileSize));
  const lastY = Math.min(map.height - 1, Math.ceil((camera.y + viewportHeight) / tileSize));
  for (let y = firstY; y <= lastY; y += 1) {
    for (let x = firstX; x <= lastX; x += 1) {
      const left = x * tileSize;
      const top = y * tileSize;
      const floorImage = images[visuals.floor];
      if (floorImage) {
        context.drawImage(floorImage, left, top, tileSize, tileSize);
      }
      if (map.tiles[y]?.[x] === "#") {
        drawSheetFrame(
          context,
          images[visuals.wall],
          4,
          64,
          64,
          wallMaskAt(map, x, y),
          left,
          top,
        );
      }
    }
  }

  for (const object of map.objects) {
    const left = object.x * tileSize;
    const top = object.y * tileSize;
    if (object.type === "key" && object.id !== state.collectedKeyId) {
      const keyImage = images[visuals.key];
      if (keyImage) {
        context.drawImage(keyImage, left, top, tileSize, tileSize);
      }
    } else if (object.type === "exit") {
      drawSheetFrame(
        context,
        images[visuals.door],
        2,
        64,
        96,
        object.requires === state.collectedKeyId ? 3 : 0,
        left,
        top - 32,
      );
    } else if (object.type === "obstacle") {
      const obstacleImage = images[visuals.obstacle];
      if (obstacleImage) {
        context.drawImage(obstacleImage, left, top, tileSize, tileSize);
      }
    } else if (object.type === "hazard") {
      if (images.hazard) context.drawImage(images.hazard, left, top, tileSize, tileSize);
    } else if (object.type === "enemy_spawn") {
      const enemy = state.enemies.find((candidate) => candidate.id === object.id);
      const direction = enemy?.direction ?? object.direction ?? "down";
      const motionOffset = resolveBodyMotionOffset(
        object.motion?.visual,
        object.id,
        motionElapsedMilliseconds,
        tileSize,
        direction,
      );
      drawActor(
        context,
        images.enemy,
        direction,
        (enemy?.x ?? object.x + 0.5) * tileSize + motionOffset.x,
        (enemy?.y ?? object.y + 0.875) * tileSize + motionOffset.y,
        enemy?.moving ?? false,
        elapsedSeconds,
      );
    }
  }

  const playerSpawn = map.objects.find((object) => (
    object.type === "player_spawn" && object.slot === 1
  )) ?? map.objects.find((object) => object.type === "player_spawn");
  const playerMotionOffset = resolveBodyMotionOffset(
    playerSpawn?.motion?.visual,
    playerSpawn?.id ?? "player",
    motionElapsedMilliseconds,
    tileSize,
    state.direction,
  );
  drawActor(
    context,
    playerImage,
    state.direction,
    state.x * tileSize + playerMotionOffset.x,
    state.y * tileSize + playerMotionOffset.y,
    state.moving,
    elapsedSeconds,
  );
  context.restore();
}

function normalizedInput(input: InputState): MazeInput {
  return {
    moveX: Number(input.right) - Number(input.left),
    moveY: Number(input.down) - Number(input.up),
  };
}

export function MazeGame({
  map,
  playerAssetId = "neutral_cooper_01",
  skinTone = "skin_04",
  hairColor = "hair_03",
  className,
  controlRowLeading,
}: MazeGameProps) {
  const initialState = useMemo(() => createInitialMazeState(map), [map]);
  const [playing, setPlaying] = useState(false);
  const [assetsReady, setAssetsReady] = useState(false);
  const [won, setWon] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(initialState);
  const inputRef = useRef<InputState>(emptyInput());
  const imagesRef = useRef<Partial<Record<ImageKey, HTMLImageElement>>>({});
  const playerImageRef = useRef<CanvasImageSource | null>(null);

  const syncRuntimeDom = useCallback((state: MazeState, camera: MazeCamera) => {
    if (!gameRef.current) return;
    gameRef.current.dataset.playerX = state.x.toFixed(2);
    gameRef.current.dataset.playerY = state.y.toFixed(2);
    gameRef.current.dataset.cameraX = camera.x.toFixed(2);
    gameRef.current.dataset.cameraY = camera.y.toFixed(2);
    gameRef.current.dataset.runtimeState = state.status;
    gameRef.current.dataset.runtimeTick = String(state.tick);
  }, []);

  const render = useCallback((elapsedSeconds: number) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const logicalWidth = map.camera.columns * map.tileSize;
    const logicalHeight = map.camera.rows * map.tileSize;
    const camera = resolveMazeCamera(map, stateRef.current);
    context.setTransform(canvas.width / logicalWidth, 0, 0, canvas.height / logicalHeight, 0, 0);
    context.imageSmoothingEnabled = false;
    drawMaze(
      context,
      map,
      stateRef.current,
      camera,
      imagesRef.current,
      playerImageRef.current ?? undefined,
      elapsedSeconds,
    );
    syncRuntimeDom(stateRef.current, camera);
  }, [map, syncRuntimeDom]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await Promise.all(Object.entries(IMAGE_URLS).map(async ([key, url]) => {
        const image = await loadSpriteImage(url);
        if (image) imagesRef.current[key as ImageKey] = image;
      }));

      const basePlayerImage = await loadSpriteImage(
        assetUrl(`sprites/${playerAssetId}.png`),
      );
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

    return () => { cancelled = true; };
  }, [hairColor, playerAssetId, skinTone]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeCanvas = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(bounds.width * ratio));
      canvas.height = Math.max(1, Math.round(bounds.height * ratio));
      render(performance.now() / 1000);
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
    if (!playing) return;
    let animationFrame = 0;
    let previousTime = performance.now();
    let accumulator = 0;
    const frame = (time: number) => {
      accumulator += Math.min((time - previousTime) / 1000, MAZE_MAX_FRAME_DELTA_SECONDS);
      previousTime = time;
      let steps = 0;
      while (accumulator >= MAZE_FIXED_DELTA_SECONDS && steps < MAZE_MAX_CATCH_UP_STEPS) {
        stateRef.current = stepMaze(map, stateRef.current, normalizedInput(inputRef.current));
        accumulator -= MAZE_FIXED_DELTA_SECONDS;
        steps += 1;
      }
      if (steps === MAZE_MAX_CATCH_UP_STEPS) accumulator = 0;
      render(time / 1000);
      if (stateRef.current.status === "won") {
        setWon(true);
        setPlaying(false);
        inputRef.current = emptyInput();
        return;
      }
      animationFrame = requestAnimationFrame(frame);
    };
    animationFrame = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationFrame);
  }, [map, playing, render]);

  useEffect(() => {
    const gameHasFocus = () => gameRef.current?.contains(document.activeElement) === true;
    const control = (key: string) => ({
      ArrowLeft: "left",
      a: "left",
      ArrowRight: "right",
      d: "right",
      ArrowUp: "up",
      w: "up",
      ArrowDown: "down",
      s: "down",
    }[key] as keyof InputState | undefined);
    const keyDown = (event: KeyboardEvent) => {
      const action = control(event.key);
      if (!action || !gameHasFocus()) return;
      event.preventDefault();
      inputRef.current[action] = true;
    };
    const keyUp = (event: KeyboardEvent) => {
      const action = control(event.key);
      if (!action) return;
      inputRef.current[action] = false;
    };
    const clear = () => { inputRef.current = emptyInput(); };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", clear);
    };
  }, []);

  const start = () => {
    if (stateRef.current.status === "won") {
      stateRef.current = createInitialMazeState(map);
      setWon(false);
    }
    setPlaying(true);
    canvasRef.current?.focus();
  };

  const pause = () => {
    inputRef.current = emptyInput();
    setPlaying(false);
    render(performance.now() / 1000);
  };

  const reset = () => {
    inputRef.current = emptyInput();
    stateRef.current = createInitialMazeState(map);
    setPlaying(false);
    setWon(false);
    render(performance.now() / 1000);
    canvasRef.current?.focus();
  };

  const setPointerInput = (action: keyof InputState, active: boolean) => {
    inputRef.current[action] = active;
    canvasRef.current?.focus();
  };

  const statusMessage = won
    ? "Maze complete!"
    : !assetsReady
      ? "Loading maze…"
      : !playing
        ? "Press Play, then use the arrow keys or W/A/S/D"
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
      data-camera-x="0.00"
      data-camera-y="0.00"
      data-runtime-state="playing"
      data-runtime-tick="0"
    >
      <div className={styles.toolbar} aria-label="Maze playback controls">
        <div className={styles.buttonGroup}>
          <button className={styles.playButton} type="button" onClick={start} disabled={playing || !assetsReady}>▶ Play</button>
          <button type="button" onClick={pause} disabled={!playing}>Ⅱ Pause</button>
          <button type="button" onClick={reset}>↻ Reset</button>
        </div>
        <p className={styles.controlHint}>Move: W/A/S/D or arrow keys</p>
      </div>

      <div className={styles.stage} style={{ aspectRatio: `${map.camera.columns} / ${map.camera.rows}` }}>
        <canvas
          className={styles.canvas}
          ref={canvasRef}
          tabIndex={0}
          aria-label={`Playable ${map.id} maze. Move with W, A, S, D or the arrow keys.`}
          onClick={() => { if (!playing && assetsReady) start(); }}
        />
        {statusMessage ? <div className={styles.stageMessage} aria-hidden="true"><strong>{statusMessage}</strong></div> : null}
      </div>

      <div className={styles.controlRow}>
        {controlRowLeading}
        <div className={styles.touchControls} aria-label="On-screen maze movement controls">
          {(["left", "up", "down", "right"] as const).map((action) => (
            <button
              type="button"
              key={action}
              aria-label={`Move ${action}`}
              onPointerDown={() => setPointerInput(action, true)}
              onPointerUp={() => setPointerInput(action, false)}
              onPointerCancel={() => setPointerInput(action, false)}
              onPointerLeave={() => setPointerInput(action, false)}
            >
              {{ left: "← Left", up: "↑ Up", down: "↓ Down", right: "Right →" }[action]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
