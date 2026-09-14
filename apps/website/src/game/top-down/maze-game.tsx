"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import {
  assetUrl,
  MAZE_IMAGE_URLS,
  mazeLoadingBackdrop,
  resolveMazeVisuals,
  type MazeImageKey,
} from "./art-catalog";
import {
  createInitialMazeState,
  MAZE_DEATH_DURATION_TICKS,
  MAZE_FIXED_DELTA_SECONDS,
  MAZE_MAX_CATCH_UP_STEPS,
  MAZE_MAX_FRAME_DELTA_SECONDS,
  resolveMazeCamera,
  resolveMazeJumpVisualOffset,
  stepMazeWithEvents,
} from "./engine";
import { fullscreenButtonLabel, useGameFullscreen } from "../fullscreen";
import { resolveBodyMotionOffset } from "../motion";
import {
  playerDefeatedEventSheet,
  playerDefeatedEventVisual,
} from "../platformer/player-death";
import { GameLoadingOverlay } from "../game-loading-overlay";
import {
  isCustomizableHumanAsset,
  recolorHumanSprite,
} from "../player-appearance";
import { createSpritePreloader, spritePreloadTotal } from "../sprite-preload";
import {
  CanvasScreenshotMenu,
  type CanvasScreenshotMenuHandle,
} from "../canvas-screenshot-menu";
import {
  createCanvasThumbnailBlob,
  type GameThumbnailCapture,
} from "../canvas-screenshot";
import type {
  HairColor,
  PlayerAssetId,
  SkinTone,
} from "@/lib/game-contract";
import type {
  MazeCamera,
  MazeDirection,
  MazeInput,
  MazeMapSpec,
  MazeRuntimeEvent,
  MazeState,
} from "./types";
import styles from "../platformer/platformer-game.module.css";

type MazeGameProps = {
  map: MazeMapSpec;
  playerAssetId?: PlayerAssetId;
  skinTone?: SkinTone;
  hairColor?: HairColor;
  className?: string;
  controlRowLeading?: ReactNode;
  levelLabel?: string;
  completionMessage?: string;
  startOverlayTitle?: string;
  onStartOverlayDismiss?: () => void;
  onThumbnailCaptureReady?: (capture: GameThumbnailCapture | null) => void;
  onUpdateThumbnail?: () => Promise<void>;
  savedGameId?: string;
  onComplete?: () => void;
};

type InputState = {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jumpHeld: boolean;
  jumpPressed: boolean;
};
const emptyInput = (): InputState => ({
  left: false,
  right: false,
  up: false,
  down: false,
  jumpHeld: false,
  jumpPressed: false,
});

const MAZE_MUSIC_URL = assetUrl("audio/space_basic_v1/gameplay_loop.wav");
const MAZE_AUDIO_URLS = {
  jump: assetUrl("audio/space_basic_v1/jump.wav"),
  land: assetUrl("audio/space_basic_v1/land.wav"),
  collectible: assetUrl("audio/space_basic_v1/collectible.wav"),
  enemy_defeat: assetUrl("audio/space_basic_v1/enemy_defeat.wav"),
  player_death: assetUrl("audio/space_basic_v1/player_death.wav"),
  respawn: assetUrl("audio/space_basic_v1/respawn.wav"),
  goal: assetUrl("audio/space_basic_v1/goal.wav"),
} as const;

const MAZE_AUDIO_VOLUME: Record<keyof typeof MAZE_AUDIO_URLS, number> = {
  jump: 0.38,
  land: 0.3,
  collectible: 0.4,
  enemy_defeat: 0.46,
  player_death: 0.48,
  respawn: 0.36,
  goal: 0.5,
};

class MazeRuntimeAudio {
  private music: HTMLAudioElement | null = null;
  private muted = false;

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.music) this.music.muted = muted;
  }

  startMusic() {
    if (!this.music) {
      this.music = new Audio(MAZE_MUSIC_URL);
      this.music.loop = true;
      this.music.volume = 0.32;
    }
    this.music.muted = this.muted;
    if (this.music.paused) void this.music.play().catch(() => undefined);
  }

  pauseMusic() {
    this.music?.pause();
  }

  play(event: MazeRuntimeEvent["type"]) {
    if (this.muted) return;
    const url = MAZE_AUDIO_URLS[event];
    const effect = new Audio(url);
    effect.volume = MAZE_AUDIO_VOLUME[event];
    void effect.play().catch(() => undefined);
  }
}

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
  images: Partial<Record<MazeImageKey, HTMLImageElement>>,
  playerImage: CanvasImageSource | undefined,
  playerDefeatedImage: CanvasImageSource | undefined,
  playerAssetId: PlayerAssetId,
  elapsedSeconds: number,
) {
  const tileSize = map.tileSize;
  const visuals = resolveMazeVisuals(map.id);
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
      if (enemy?.defeated) continue;
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
  const playerX = state.x * tileSize + playerMotionOffset.x;
  const playerY = (state.y + resolveMazeJumpVisualOffset(state)) * tileSize + playerMotionOffset.y;
  let playerDrawn = false;
  if (state.status === "dying") {
    const eventVisual = playerDefeatedEventVisual(
      playerAssetId,
      state.direction === "left" ? "left" : "right",
      (MAZE_DEATH_DURATION_TICKS - state.deathTicksRemaining)
        * MAZE_FIXED_DELTA_SECONDS
        * 1000,
    );
    if (eventVisual) {
      const { eventSheet } = eventVisual;
      playerDrawn = drawSheetFrame(
        context,
        playerDefeatedImage,
        eventSheet.columns,
        eventSheet.frameWidth,
        eventSheet.frameHeight,
        eventVisual.frameIndex,
        playerX - eventSheet.anchor.x,
        playerY - eventSheet.anchor.y,
      );
    }
  }
  if (!playerDrawn) {
    drawActor(
      context,
      playerImage,
      state.direction,
      playerX,
      playerY,
      state.moving,
      elapsedSeconds,
    );
  }
  context.restore();
}

function normalizedInput(input: InputState): MazeInput {
  return {
    moveX: Number(input.right) - Number(input.left),
    moveY: Number(input.down) - Number(input.up),
    jumpPressed: input.jumpPressed,
  };
}

export function MazeGame({
  map,
  playerAssetId = "neutral_cooper_01",
  skinTone = "skin_04",
  hairColor = "hair_03",
  className,
  controlRowLeading,
  levelLabel,
  completionMessage = "Maze complete!",
  startOverlayTitle,
  onStartOverlayDismiss,
  onThumbnailCaptureReady,
  onUpdateThumbnail,
  savedGameId,
  onComplete,
}: MazeGameProps) {
  const initialState = useMemo(() => createInitialMazeState(map), [map]);
  const [playing, setPlaying] = useState(false);
  const [assetsReady, setAssetsReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [runtimeStatus, setRuntimeStatus] = useState<MazeState["status"]>("playing");
  const [muted, setMuted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screenshotMenuRef = useRef<CanvasScreenshotMenuHandle>(null);
  const gameRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(initialState);
  const inputRef = useRef<InputState>(emptyInput());
  const imagesRef = useRef<Partial<Record<MazeImageKey, HTMLImageElement>>>({});
  const playerImageRef = useRef<CanvasImageSource | null>(null);
  const playerDefeatedImageRef = useRef<CanvasImageSource | null>(null);
  const audioRef = useRef<MazeRuntimeAudio | null>(null);
  const completionNotifiedRef = useRef(false);
  const fullscreen = useGameFullscreen(gameRef);

  const syncRuntimeDom = useCallback((state: MazeState, camera: MazeCamera) => {
    if (!gameRef.current) return;
    gameRef.current.dataset.playerX = state.x.toFixed(2);
    gameRef.current.dataset.playerY = state.y.toFixed(2);
    gameRef.current.dataset.cameraX = camera.x.toFixed(2);
    gameRef.current.dataset.cameraY = camera.y.toFixed(2);
    gameRef.current.dataset.runtimeState = state.status;
    gameRef.current.dataset.runtimeTick = String(state.tick);
    gameRef.current.dataset.jumpState = state.jump ? "jumping" : "grounded";
    gameRef.current.dataset.defeatedEnemies = String(
      state.enemies.filter((enemy) => enemy.defeated).length,
    );
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
      playerDefeatedImageRef.current ?? undefined,
      playerAssetId,
      elapsedSeconds,
    );
    syncRuntimeDom(stateRef.current, camera);
  }, [map, playerAssetId, syncRuntimeDom]);

  const captureCleanThumbnail = useCallback(async () => {
    if (!assetsReady) {
      throw new Error("The game artwork is still loading.");
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      throw new Error("The game canvas is unavailable.");
    }
    return createCanvasThumbnailBlob(canvas);
  }, [assetsReady]);

  useEffect(() => {
    if (!assetsReady) {
      onThumbnailCaptureReady?.(null);
      return;
    }

    onThumbnailCaptureReady?.(captureCleanThumbnail);
    return () => onThumbnailCaptureReady?.(null);
  }, [assetsReady, captureCleanThumbnail, onThumbnailCaptureReady]);

  useEffect(() => {
    audioRef.current = new MazeRuntimeAudio();
    const savedMuted = window.localStorage.getItem("splat-lab.game-audio-muted.v1") === "true";
    audioRef.current.setMuted(savedMuted);
    const syncPreference = window.setTimeout(() => setMuted(savedMuted), 0);
    return () => {
      window.clearTimeout(syncPreference);
      audioRef.current?.pauseMusic();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const defeatedSheet = playerDefeatedEventSheet(playerAssetId);
      const sheets = Object.entries(MAZE_IMAGE_URLS);
      const track = createSpritePreloader(
        spritePreloadTotal({
          sheetCount: sheets.length,
          playerAssetId,
          // The player's own sheet, plus its defeat sheet when one exists.
          extraSheets: defeatedSheet ? 2 : 1,
        }),
        (fraction) => {
          // Swapping heroes restarts this effect, and a bar that slid backwards
          // would read as a stall rather than a fresh download.
          if (!cancelled) setLoadProgress((filled) => Math.max(filled, fraction));
        },
      );

      await Promise.all(sheets.map(async ([key, url]) => {
        const image = await track(url);
        if (image) imagesRef.current[key as MazeImageKey] = image;
      }));

      const basePlayerImage = await track(
        assetUrl(`sprites/${playerAssetId}.png`),
      );
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

      playerDefeatedImageRef.current = defeatedSheet
        ? await track(assetUrl(`sprites/${defeatedSheet.imageAssetId}.png`)) ?? null
        : null;

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
        const previousStatus = stateRef.current.status;
        const result = stepMazeWithEvents(
          map,
          stateRef.current,
          normalizedInput(inputRef.current),
        );
        inputRef.current.jumpPressed = false;
        stateRef.current = result.state;
        for (const event of result.events) audioRef.current?.play(event.type);
        if (result.state.status !== previousStatus) setRuntimeStatus(result.state.status);
        if (result.state.status === "dying") inputRef.current = emptyInput();
        accumulator -= MAZE_FIXED_DELTA_SECONDS;
        steps += 1;
      }
      if (steps === MAZE_MAX_CATCH_UP_STEPS) accumulator = 0;
      render(time / 1000);
      if (stateRef.current.status === "won") {
        setRuntimeStatus("won");
        setPlaying(false);
        inputRef.current = emptyInput();
        audioRef.current?.pauseMusic();
        if (!completionNotifiedRef.current) {
          completionNotifiedRef.current = true;
          onComplete?.();
        }
        return;
      }
      animationFrame = requestAnimationFrame(frame);
    };
    animationFrame = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationFrame);
  }, [map, onComplete, playing, render]);

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
      if ((event.key === " " || event.code === "Space") && gameHasFocus()) {
        event.preventDefault();
        if (!playing) return;
        if (!inputRef.current.jumpHeld) inputRef.current.jumpPressed = true;
        inputRef.current.jumpHeld = true;
        return;
      }
      const action = control(event.key);
      if (!action || !playing || !gameHasFocus()) return;
      event.preventDefault();
      inputRef.current[action] = true;
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.key === " " || event.code === "Space") {
        inputRef.current.jumpHeld = false;
        return;
      }
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
  }, [playing]);

  const start = () => {
    if (stateRef.current.status === "won") {
      stateRef.current = createInitialMazeState(map);
      completionNotifiedRef.current = false;
      setRuntimeStatus("playing");
    }
    setPlaying(true);
    onStartOverlayDismiss?.();
    audioRef.current?.startMusic();
    canvasRef.current?.focus();
  };

  const pause = () => {
    inputRef.current = emptyInput();
    setPlaying(false);
    audioRef.current?.pauseMusic();
    render(performance.now() / 1000);
  };

  const reset = () => {
    inputRef.current = emptyInput();
    stateRef.current = createInitialMazeState(map);
    completionNotifiedRef.current = false;
    setPlaying(false);
    setRuntimeStatus("playing");
    audioRef.current?.pauseMusic();
    render(performance.now() / 1000);
    canvasRef.current?.focus();
  };

  const setPointerInput = (action: keyof InputState, active: boolean) => {
    inputRef.current[action] = active;
    canvasRef.current?.focus();
  };

  const setPointerJump = (active: boolean) => {
    if (active && !inputRef.current.jumpHeld) inputRef.current.jumpPressed = true;
    inputRef.current.jumpHeld = active;
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

  const showStartOverlay = Boolean(startOverlayTitle) && !playing && runtimeStatus === "playing";
  const statusMessage = showStartOverlay
    ? null
    : runtimeStatus === "won"
      ? completionMessage
      : runtimeStatus === "dying"
        ? "Hero defeated — returning to start…"
        : !assetsReady
          ? null
          : !playing
            ? "Press Play, then move with the arrow keys or W/A/S/D and jump with Space"
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
      data-jump-state="grounded"
      data-defeated-enemies="0"
    >
      <div className={styles.toolbar} aria-label="Maze playback controls">
        <div className={styles.buttonGroup}>
          <button className={styles.playButton} type="button" onClick={start} disabled={playing || !assetsReady}>▶ Play</button>
          <button type="button" onClick={pause} disabled={!playing}>Ⅱ Pause</button>
          <button type="button" onClick={reset}>↻ Reset</button>
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
        {levelLabel ? <p className={styles.levelLabel}>{levelLabel}</p> : null}
        <p className={styles.controlHint}>Move: W/A/S/D or arrow keys · Jump: Space</p>
      </div>

      <div
        className={styles.stage}
        style={{
          aspectRatio: `${map.camera.columns} / ${map.camera.rows}`,
          "--stage-aspect": map.camera.columns / map.camera.rows,
        } as CSSProperties}
      >
        <canvas
          className={styles.canvas}
          ref={canvasRef}
          tabIndex={0}
          aria-label={`Playable ${map.id} maze. Move with W, A, S, D or the arrow keys. Jump with Space.`}
          onClick={() => { if (!playing && assetsReady) start(); }}
          onContextMenu={(event: ReactMouseEvent<HTMLCanvasElement>) => {
            event.preventDefault();
            screenshotMenuRef.current?.open(event.clientX, event.clientY);
          }}
        />
        <CanvasScreenshotMenu
          ref={screenshotMenuRef}
          canvasRef={canvasRef}
          savedGameId={savedGameId}
          onUpdateThumbnail={onUpdateThumbnail}
        />
        {statusMessage ? <div className={styles.stageMessage} aria-hidden="true"><strong>{statusMessage}</strong></div> : null}
        {!assetsReady || showStartOverlay ? (
          <GameLoadingOverlay
            progress={loadProgress}
            {...mazeLoadingBackdrop(map.id)}
            title={startOverlayTitle}
            ready={assetsReady}
            onStart={showStartOverlay ? start : undefined}
          />
        ) : null}
      </div>

      <div className={styles.controlRow}>
        {controlRowLeading}
        <div className={styles.touchControls} aria-label="On-screen maze movement controls">
          {(["left", "up", "down", "right"] as const).map((action) => (
            <button
              type="button"
              key={action}
              aria-label={`Move ${action}`}
              disabled={!playing}
              onPointerDown={() => setPointerInput(action, true)}
              onPointerUp={() => setPointerInput(action, false)}
              onPointerCancel={() => setPointerInput(action, false)}
              onPointerLeave={() => setPointerInput(action, false)}
            >
              {{ left: "← Left", up: "↑ Up", down: "↓ Down", right: "Right →" }[action]}
            </button>
          ))}
          <button
            type="button"
            aria-label="Jump"
            disabled={!playing}
            onPointerDown={() => setPointerJump(true)}
            onPointerUp={() => setPointerJump(false)}
            onPointerCancel={() => setPointerJump(false)}
            onPointerLeave={() => setPointerJump(false)}
          >
            ↑ Jump
          </button>
        </div>
      </div>
    </div>
  );
}
