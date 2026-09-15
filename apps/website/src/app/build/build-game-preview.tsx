"use client";

import {
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

import {
  GamePlayer,
  type GamePlayerContentProps,
} from "@/game/game-player";
import type { GameThumbnailCapture } from "@/game/canvas-screenshot";
import {
  campaignMapIndex,
  gameCampaignMaps,
  gameMazeMaps,
  mazeMapIndex,
} from "@/game/game-levels";
import { ART_WORLDS, artWorld } from "@/game/platformer/art-catalog";
import {
  applyPlatformerLevelArt,
  applyPlatformerObjectEdits,
  applyPlatformerTerrainEdits,
  applyPlatformerTerrainSettings,
  erasePlatformerObjectsAtCells,
  erasePlatformerTerrainSettingsAtCells,
  EMPTY_PLATFORMER_EDITOR_SELECTION,
  isPlatformerPalettePaintTool,
  mergePlatformerObjectEdits,
  mergePlatformerTerrainEdits,
  movePlatformerEditorSelection,
  platformerTerrainKindAt,
  terrainAnimationStartFrame,
  type PlatformerEditTool,
  type PlatformerEditorSelection,
  type PlatformerObjectPlacement,
  type PlatformerObjectSettingsChange,
  type PlatformerTerrainStrokeCell,
  upsertPlatformerObjectSettings,
  upsertPlatformerTerrainSettings,
  type PlatformerTerrainSettingsChange,
} from "@/game/platformer/map-editing";
import {
  canStepEditorZoom,
  clampEditorZoomScale,
  stepEditorZoomScale,
} from "@/game/platformer/engine";
import { uploadLabImage } from "@/lib/blob-upload";
import {
  activeGameTheme,
  activePlayerAssetId,
  defaultGameTitle,
  DEFAULT_GAME_DOCUMENT,
  gameDocumentSchema,
  type ArtWorldId,
  type GameDocument,
  type SavedGameDto,
} from "@/lib/game-contract";
import {
  applyCooperSpecChange,
  type CooperSpecChange,
} from "@/lib/cooper-spec-change";
import { GameObjectEditError } from "@/lib/game-objects";
import {
  planAddLevel,
  MAX_GAME_NAME_LENGTH,
  planGameName,
  planMoveLevelTo,
  planRemoveLevel,
  planRenameLevel,
  planSetActiveLevel,
} from "@/lib/game-levels-editing";
import { buildGamePath, playGamePath } from "@/lib/game-routes";
import {
  createGameHistory,
  gameHistoryReducer,
  sameGameDocument,
} from "@/lib/game-history";
import type { MapLength } from "@/lib/game-contract";

import {
  activeMapRollLength,
  interpretMapRollResponse,
  mergeBuilderSetupChange,
  needsMapRollDiscardConfirmation,
  rolledSpecFromOutcome,
  serializeMapRollStart,
} from "./build-map-roll";
import {
  reconcilePersistedGame,
  type MapRollAttempt,
  type MapRollSetupCompletion,
  useBuildSetup,
} from "./build-setup";
import { BuildObjectToolbox } from "./build-object-toolbox";
import { BuildTerrainToolbox } from "./build-terrain-toolbox";
import { BuildTools } from "./build-tools";
import styles from "./build.module.css";

type BuildGamePreviewProps = GamePlayerContentProps & {
  initialGame: SavedGameDto | null;
};

type GameIdentity = {
  id: string;
  revision: number;
};

type PendingLevel = {
  source: string;
  defaultName: string;
};

const WORLD_ICONS: Record<string, string> = {
  "level-1.json": "🌄",
  "level-2.json": "🚀",
  "level-3.json": "👻",
  "level-4.json": "🐉",
  "level-5.json": "❄️",
  "maze_green_hills_01.json": "🌄",
  "maze_space_01.json": "🚀",
  "maze_graveyard_01.json": "👻",
  "maze_dragon_world_01.json": "🐉",
};

function ExternalLinkIcon() {
  return (
    <svg
      className={styles.playGameIcon}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 4H3.5A1.5 1.5 0 0 0 2 5.5v7A1.5 1.5 0 0 0 3.5 14h7A1.5 1.5 0 0 0 12 12.5V10" />
      <path d="M9 2h5v5" />
      <path d="m8 8 6-6" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      className={styles.playGameIcon}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 10.5a2.2 2.2 0 0 0-1.3.4l-3.5-2a2.3 2.3 0 0 0 0-1.8l3.5-2a2.2 2.2 0 0 0 1.3.4 2.3 2.3 0 1 0-.7-1.7l-3.5 2a2.3 2.3 0 0 0-2.6 0l-3.5-2A2.3 2.3 0 1 0 2.3 6.5a2.2 2.2 0 0 0 1.3-.4l3.5 2a2.3 2.3 0 0 0 0 1.8l-3.5 2a2.2 2.2 0 0 0-1.3-.4A2.3 2.3 0 1 0 4 13.7a2.3 2.3 0 0 0 2.6 0l3.5-2a2.2 2.2 0 0 0 1.3.4 2.3 2.3 0 1 0 2.3-2.3Z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      className={styles.settingsIcon}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8.8 2.4h2.4l.5 2a6 6 0 0 1 1.1.7l2-.6 1.2 2.1-1.5 1.4a6 6 0 0 1 0 1.4l1.5 1.4-1.2 2.1-2-.6a6 6 0 0 1-1.1.7l-.5 2H8.8l-.5-2a6 6 0 0 1-1.1-.7l-2 .6L4 10.8l1.5-1.4a6 6 0 0 1 0-1.4L4 6.6l1.2-2.1 2 .6a6 6 0 0 1 1.1-.7l.5-2Z" />
      <circle cx="10" cy="8.7" r="2.1" />
    </svg>
  );
}

function ResetZoomIcon() {
  return (
    <svg
      className={styles.zoomResetIcon}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3.2 8a4.8 4.8 0 1 0 1.4-3.4" />
      <path d="M3 2.4v3.2h3.2" />
    </svg>
  );
}

function errorMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  return fallback;
}

async function putGameThumbnail(
  gameId: string,
  thumbnail: { url: string; pathname: string },
) {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(
      `/api/games/${encodeURIComponent(gameId)}/thumbnail`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(thumbnail),
      },
    );

    if (response.ok) return;

    const payload: unknown = await response.json().catch(() => null);
    lastError = new Error(
      errorMessage(payload, "We couldn't save your game image."),
    );
    if (response.status < 500) break;
  }

  throw lastError ?? new Error("We couldn't save your game image.");
}

async function uploadGameThumbnail(gameId: string, thumbnailBlob: Blob) {
  const file = new File([thumbnailBlob], "thumbnail.webp", {
    type: "image/webp",
  });
  const uploaded = await uploadLabImage(file, "thumbnail", gameId);
  await putGameThumbnail(gameId, {
    url: uploaded.url,
    pathname: uploaded.pathname,
  });
}

export function BuildGamePreview({
  maps,
  mazes,
  physics,
  weapon,
  initialGame,
}: BuildGamePreviewProps) {
  const {
    gameIdentity,
    requestedSetup,
    levelPickerOpen,
    persistedBuildTurn,
    publishGameIdentity,
    publishDisplayedGame,
    registerMapRollHandler,
    openLevelPicker,
    closeLevelPicker,
  } = useBuildSetup();
  const initialSpec = initialGame?.spec ?? DEFAULT_GAME_DOCUMENT;
  const initialTitle = initialGame?.title ?? defaultGameTitle(initialSpec);
  const [history, dispatch] = useReducer(
    gameHistoryReducer,
    initialSpec,
    createGameHistory,
  );
  const identityRef = useRef<GameIdentity | null>(
    initialGame
      ? { id: initialGame.id, revision: initialGame.revision }
      : null,
  );
  const [, setSaveStatus] = useState<"saving" | "saved" | "error">(
    initialGame ? "saved" : "saving",
  );
  const [, setSaveError] = useState("");
  const [activeTool, setActiveTool] = useState<PlatformerEditTool>("select");
  /**
   * The worlds the terrain and object buttons paint from. Null means this
   * level's own art, so switching levels needs no reset.
   */
  const [terrainArtWorld, setTerrainArtWorld] = useState<ArtWorldId | null>(null);
  const [objectArtWorld, setObjectArtWorld] = useState<ArtWorldId | null>(null);
  const mapAreaRef = useRef<HTMLDivElement>(null);
  const [editorSelection, setEditorSelection] = useState<PlatformerEditorSelection>(
    EMPTY_PLATFORMER_EDITOR_SELECTION,
  );
  const [platformerPlaying, setPlatformerPlaying] = useState(false);
  const [editorZoomScale, setEditorZoomScale] = useState(1);
  const [pendingLevel, setPendingLevel] = useState<PendingLevel | null>(null);
  const [levelName, setLevelName] = useState("");
  const [levelSettingsOpen, setLevelSettingsOpen] = useState(false);
  const [gameSettingsName, setGameSettingsName] = useState(initialTitle);
  const [gameSettingsPublic, setGameSettingsPublic] = useState(
    initialGame?.isPublic ?? false,
  );
  const [savedGamePublic, setSavedGamePublic] = useState(
    initialGame?.isPublic ?? false,
  );
  const [draggedLevelSource, setDraggedLevelSource] = useState<string | null>(null);
  const [dragOverLevelSource, setDragOverLevelSource] = useState<string | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [sharePlayUrl, setSharePlayUrl] = useState("");
  const [shareUrlCopied, setShareUrlCopied] = useState(false);
  const [mapRollInProgress, setMapRollInProgress] = useState(false);
  const [mapRollConfirmOpen, setMapRollConfirmOpen] = useState(false);
  const [mapRollError, setMapRollError] = useState("");
  const [previewEpoch, setPreviewEpoch] = useState(0);
  const levelDialogRef = useRef<HTMLDialogElement>(null);
  const shareDialogRef = useRef<HTMLDialogElement>(null);
  const mapRollConfirmDialogRef = useRef<HTMLDialogElement>(null);
  const mapRollInProgressRef = useRef(false);
  const levelNameDialogRef = useRef<HTMLDialogElement>(null);
  const levelNameInputRef = useRef<HTMLInputElement>(null);
  const levelSettingsDialogRef = useRef<HTMLDialogElement>(null);
  const gameSettingsNameInputRef = useRef<HTMLInputElement>(null);
  const levelSettingsInputRef = useRef<HTMLInputElement>(null);
  const latestSpecRef = useRef(history.present);
  const savedSpecRef = useRef<GameDocument | null>(initialGame?.spec ?? null);
  const titleRef = useRef(initialTitle);
  const savedTitleRef = useRef<string | null>(initialGame?.title ?? null);
  const publicRef = useRef(initialGame?.isPublic ?? false);
  const savedPublicRef = useRef<boolean | null>(initialGame?.isPublic ?? null);
  /**
   * The name is stored beside the spec, so nothing the history reducer holds
   * carries it, and it arrives from three places outside React: the setup
   * wizard, Cooper, and whatever the server hands back after a save. This keeps
   * whichever arrived last on screen without the name joining undo history.
   */
  const [displayTitle, showTitle] = useReducer(
    (_shown: string, next: string) => next,
    initialTitle,
  );
  /**
   * When the server has a newer name -- Cooper renamed the game, or another tab
   * did -- the builder has to take it, or its next autosave writes the old name
   * straight back over it. A name the kid picked and has not saved yet wins.
   */
  const adoptServerTitle = useCallback((title: string) => {
    const local = titleRef.current;
    const saved = savedTitleRef.current;
    savedTitleRef.current = title;
    if (saved !== null && local !== saved) return;
    titleRef.current = title;
    showTitle(title);
  }, []);
  const adoptServerVisibility = useCallback((isPublic: boolean) => {
    const local = publicRef.current;
    const saved = savedPublicRef.current;
    savedPublicRef.current = isPublic;
    setSavedGamePublic(isPublic);
    if (saved !== null && local !== saved) return;
    publicRef.current = isPublic;
    setGameSettingsPublic(isPublic);
  }, []);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const thumbnailSavePromiseRef = useRef<Promise<void> | null>(null);
  const savedThumbnailGameIdsRef = useRef(new Set(
    initialGame?.thumbnailDataUrl ? [initialGame.id] : [],
  ));
  const [thumbnailCapture, setThumbnailCapture] =
    useState<GameThumbnailCapture | null>(null);
  const appliedSetupRevisionRef = useRef(0);
  const handleThumbnailCaptureReady = useCallback(
    (capture: GameThumbnailCapture | null) => {
      setThumbnailCapture((current) => current === capture ? current : capture);
    },
    [],
  );
  const adoptAuthoritativeSpec = useCallback((spec: GameDocument) => {
    const previous = latestSpecRef.current;
    latestSpecRef.current = spec;
    dispatch({ type: "setup", spec });
    if (
      previous.platformerMapSource !== spec.platformerMapSource
      || previous.mazeMapSource !== spec.mazeMapSource
      || JSON.stringify(previous.generatedPlatformerMaps)
        !== JSON.stringify(spec.generatedPlatformerMaps)
      || JSON.stringify(previous.generatedMazeMaps) !== JSON.stringify(spec.generatedMazeMaps)
    ) {
      setPreviewEpoch((value) => value + 1);
    }
  }, []);

  const commit = useCallback(
    (
      change: Partial<
        Pick<
          GameDocument,
          | "previewKind"
          | "mapStyle"
          | "mapLength"
          | "platformerMapSource"
          | "mazeMapSource"
          | "generatedPlatformerMaps"
          | "generatedMazeMaps"
          | "platformerLevels"
          | "mazeLevels"
          | "playerCharacter"
          | "humanGender"
          | "skinTone"
          | "hairColor"
          | "setupStep"
          | "builderSetupHistory"
          | "builderChatHistory"
          | "platformerTerrainEdits"
          | "platformerObjectEdits"
          | "platformerObjectRemovals"
          | "platformerObjectSettings"
          | "platformerTerrainSettings"
        >
      >,
    ) => {
      const spec = mergeBuilderSetupChange(latestSpecRef.current, change);
      latestSpecRef.current = spec;
      dispatch({ type: "edit", spec });
    },
    [],
  );

  useEffect(() => {
    publishDisplayedGame({
      gameType: history.present.previewKind,
      theme: activeGameTheme(history.present),
    });
  }, [history.present, publishDisplayedGame]);

  useEffect(() => {
    if (
      !requestedSetup ||
      requestedSetup.revision <= appliedSetupRevisionRef.current
    ) {
      return;
    }

    appliedSetupRevisionRef.current = requestedSetup.revision;
    if (requestedSetup.title !== undefined) {
      titleRef.current = requestedSetup.title;
      showTitle(requestedSetup.title);
    }
    if (
      Object.keys(requestedSetup.change).length === 1 &&
      requestedSetup.change.builderChatHistory
    ) {
      dispatch({
        type: "chat",
        turns: requestedSetup.change.builderChatHistory,
      });
      return;
    }
    commit(requestedSetup.change);
  }, [commit, requestedSetup]);

  useEffect(() => {
    if (!persistedBuildTurn || !identityRef.current) return;

    const identity = identityRef.current;
    const savedSpec = savedSpecRef.current ?? latestSpecRef.current;
    let fallbackServerSpec: GameDocument = {
      ...savedSpec,
      builderChatHistory: persistedBuildTurn.chatHistory,
      ...(persistedBuildTurn.physicsDocument
        ? { physicsDocument: persistedBuildTurn.physicsDocument }
        : {}),
    };
    if (persistedBuildTurn.mapRoll) {
      fallbackServerSpec = rolledSpecFromOutcome(fallbackServerSpec, persistedBuildTurn.mapRoll);
    }
    if (persistedBuildTurn.specChange) {
      fallbackServerSpec = applyCooperSpecChange(fallbackServerSpec, persistedBuildTurn.specChange);
    }

    identityRef.current = { ...identity, revision: persistedBuildTurn.revision };
    savedSpecRef.current = fallbackServerSpec;
    if (persistedBuildTurn.title) adoptServerTitle(persistedBuildTurn.title);
    latestSpecRef.current = reconcilePersistedGame(
      fallbackServerSpec,
      savedSpec,
      latestSpecRef.current,
    );
    dispatch({ type: "chat", turns: fallbackServerSpec.builderChatHistory });
    if (persistedBuildTurn.mapRoll) {
      dispatch({ type: "mapRoll", change: persistedBuildTurn.mapRoll.change });
      adoptAuthoritativeSpec(fallbackServerSpec);
    }
    if (persistedBuildTurn.physicsDocument) {
      dispatch({ type: "physics", document: persistedBuildTurn.physicsDocument });
    }
    if (persistedBuildTurn.specChange) {
      dispatch({ type: "specChange", change: persistedBuildTurn.specChange });
    }

    void (async () => {
      const response = await fetch(`/api/games/${encodeURIComponent(identity.id)}`, {
        cache: "no-store",
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !payload || typeof payload !== "object" || !("game" in payload)) return;
      const game = (payload as { game: SavedGameDto }).game;
      if (game.id !== identity.id) return;

      const latest = latestSpecRef.current;
      const persisted = savedSpecRef.current ?? latest;
      const reconciled = reconcilePersistedGame(game.spec, persisted, latest);
      identityRef.current = { id: game.id, revision: game.revision };
      savedSpecRef.current = game.spec;
      adoptServerTitle(game.title);
      adoptServerVisibility(game.isPublic);
      latestSpecRef.current = reconciled;
      dispatch({ type: "chat", turns: game.spec.builderChatHistory });
      dispatch({ type: "physics", document: game.spec.physicsDocument });
      // The reconciled document, not Cooper's field subset: generated maps are
      // server-owned and specChangeFrom would leave the preview on the donor.
      adoptAuthoritativeSpec(reconciled);
    })();
  }, [adoptAuthoritativeSpec, adoptServerTitle, adoptServerVisibility, persistedBuildTurn]);

  const reloadGameFromServer = useCallback(async () => {
    const identity = identityRef.current;
    if (!identity) return;

    const response = await fetch(`/api/games/${encodeURIComponent(identity.id)}`, {
      cache: "no-store",
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok || !payload || typeof payload !== "object" || !("game" in payload)) return;

    const game = (payload as { game: SavedGameDto }).game;
    if (game.id !== identity.id) return;

    const latest = latestSpecRef.current;
    const persisted = savedSpecRef.current ?? latest;
    const reconciled = reconcilePersistedGame(game.spec, persisted, latest);
    identityRef.current = { id: game.id, revision: game.revision };
    savedSpecRef.current = game.spec;
    adoptServerTitle(game.title);
    adoptServerVisibility(game.isPublic);
    latestSpecRef.current = reconciled;
    dispatch({ type: "chat", turns: game.spec.builderChatHistory });
    dispatch({ type: "physics", document: game.spec.physicsDocument });
    adoptAuthoritativeSpec(reconciled);
  }, [adoptAuthoritativeSpec, adoptServerTitle, adoptServerVisibility]);

  const persistLatest = useCallback((): Promise<boolean> => {
    if (mapRollInProgressRef.current) return Promise.resolve(false);
    if (savePromiseRef.current) return savePromiseRef.current;

    const savePromise = (async () => {
      while (true) {
        const spec = latestSpecRef.current;
        const identity = identityRef.current;
        const title = titleRef.current.trim() || defaultGameTitle(spec);
        const isPublic = publicRef.current;

        if (
          identity &&
          savedSpecRef.current &&
          savedTitleRef.current === title &&
          savedPublicRef.current === isPublic &&
          sameGameDocument(savedSpecRef.current, spec)
        ) {
          setSaveStatus("saved");
          return true;
        }

        setSaveStatus("saving");
        setSaveError("");

        const response = await fetch(
          identity ? `/api/games/${encodeURIComponent(identity.id)}` : "/api/games",
          {
            method: identity ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            keepalive: true,
            body: JSON.stringify(
              identity
                ? {
                    title,
                    isPublic,
                    spec,
                    expectedRevision: identity.revision,
                  }
                : { title, isPublic, spec },
            ),
          },
        );
        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          if (
            response.status === 409 &&
            payload &&
            typeof payload === "object" &&
            "game" in payload
          ) {
            const game = (payload as { game: SavedGameDto }).game;
            const savedSpec = savedSpecRef.current ?? spec;
            const reconciled = reconcilePersistedGame(
              game.spec,
              savedSpec,
              latestSpecRef.current,
            );
            identityRef.current = { id: game.id, revision: game.revision };
            savedSpecRef.current = game.spec;
            adoptServerTitle(game.title);
            adoptServerVisibility(game.isPublic);
            latestSpecRef.current = reconciled;
            dispatch({ type: "chat", turns: game.spec.builderChatHistory });
            continue;
          }
          setSaveStatus("error");
          setSaveError(errorMessage(payload, "We couldn't save your game."));
          return false;
        }

        const savedGame = (payload as { game: SavedGameDto }).game;
        const nextIdentity = { id: savedGame.id, revision: savedGame.revision };
        identityRef.current = nextIdentity;
        savedSpecRef.current = savedGame.spec;
        savedTitleRef.current = savedGame.title;
        savedPublicRef.current = savedGame.isPublic;
        setSavedGamePublic(savedGame.isPublic);
        const latestTitle =
          titleRef.current.trim() || defaultGameTitle(latestSpecRef.current);
        if (latestTitle === title) {
          titleRef.current = savedGame.title;
          showTitle(savedGame.title);
        }
        publishGameIdentity(nextIdentity);
        // A ready-made transition removes server-owned generated records. Use
        // the committed document so no local campaign level outlives its map.
        if (!sameGameDocument(savedGame.spec, spec)) {
          adoptAuthoritativeSpec(savedGame.spec);
        }

        if (!identity && window.location.pathname === "/build") {
          window.history.replaceState(
            window.history.state,
            "",
            buildGamePath(savedGame.id),
          );
        }

        if (
          sameGameDocument(latestSpecRef.current, spec) &&
          (titleRef.current.trim() || defaultGameTitle(latestSpecRef.current)) ===
            savedGame.title &&
          publicRef.current === savedGame.isPublic
        ) {
          setSaveStatus("saved");
          return true;
        }
      }
    })()
      .catch((error: unknown) => {
        setSaveStatus("error");
        setSaveError(
          error instanceof Error ? error.message : "We couldn't save your game.",
        );
        return false;
      })
      .finally(() => {
        savePromiseRef.current = null;
      });

    savePromiseRef.current = savePromise;
    return savePromise;
  }, [adoptAuthoritativeSpec, adoptServerTitle, adoptServerVisibility, publishGameIdentity]);

  const executeMapRoll = useCallback(async (
    length: MapLength,
    options: {
      reason: "setup" | "reroll";
      confirmDiscardEdits: boolean;
      completion?: MapRollSetupCompletion;
    },
  ): Promise<MapRollAttempt> => {
    const start = await serializeMapRollStart(
      persistLatest,
      mapRollInProgressRef,
    );
    if (start === "already_in_progress") {
      return { success: false, message: "A map roll is already in progress." };
    }
    if (start === "persistence_failed") {
      const message = "We couldn't save your game. Please try again.";
      setMapRollError(message);
      return { success: false, message };
    }

    setMapRollInProgress(true);
    setMapRollError("");
    try {
      const identity = identityRef.current;
      if (!identity) {
        return { success: false, message: "Your game is still saving. Please try again." };
      }

      const response = await fetch(
        `/api/games/${encodeURIComponent(identity.id)}/map-roll`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            length,
            reason: options.reason,
            confirmDiscardEdits: options.confirmDiscardEdits,
            expectedRevision: identity.revision,
          }),
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      const outcome = interpretMapRollResponse(response.status, payload);

      if (outcome.status === "confirmation_required") {
        setMapRollConfirmOpen(true);
        return { success: false, message: outcome.message };
      }
      if (outcome.status === "conflict") {
        await reloadGameFromServer();
        setMapRollError(outcome.message);
        return { success: false, message: outcome.message };
      }
      if (outcome.status === "error") {
        if (response.ok) {
          await reloadGameFromServer();
          if (options.completion) {
            const recovered = gameDocumentSchema.parse({
              ...latestSpecRef.current,
              ...options.completion,
              mapLength: length,
            });
            adoptAuthoritativeSpec(recovered);
          }
          setEditorSelection(EMPTY_PLATFORMER_EDITOR_SELECTION);
          setPlatformerPlaying(false);
          return { success: true };
        }
        setMapRollError(outcome.message);
        return { success: false, message: outcome.message };
      }

      try {
        const beforeRoll = latestSpecRef.current;
        const rolledSpec = rolledSpecFromOutcome(
          beforeRoll,
          outcome.result,
          options.completion
            ? { ...options.completion, mapLength: length }
            : { mapLength: length },
        );
        const savedBeforeRoll = savedSpecRef.current ?? beforeRoll;
        savedSpecRef.current = rolledSpecFromOutcome(savedBeforeRoll, outcome.result, {
          mapLength: length,
        });
        identityRef.current = { id: identity.id, revision: outcome.result.revision };
        publishGameIdentity(identityRef.current);
        dispatch({ type: "mapRoll", change: outcome.result.change });
        adoptAuthoritativeSpec(rolledSpec);
        setEditorSelection(EMPTY_PLATFORMER_EDITOR_SELECTION);
        setPlatformerPlaying(false);
        return { success: true };
      } catch {
        await reloadGameFromServer();
        if (options.completion) {
          const recovered = gameDocumentSchema.parse({
            ...latestSpecRef.current,
            ...options.completion,
            mapLength: length,
          });
          adoptAuthoritativeSpec(recovered);
        }
        setEditorSelection(EMPTY_PLATFORMER_EDITOR_SELECTION);
        setPlatformerPlaying(false);
        return { success: true };
      }
    } catch {
      const message = "We couldn't make that map. Please try again.";
      setMapRollError(message);
      return { success: false, message };
    } finally {
      mapRollInProgressRef.current = false;
      setMapRollInProgress(false);
    }
  }, [adoptAuthoritativeSpec, persistLatest, publishGameIdentity, reloadGameFromServer]);

  useEffect(() => {
    registerMapRollHandler(async (length, completion) => executeMapRoll(length, {
      reason: "setup",
      confirmDiscardEdits: false,
      completion,
    }));
    return () => registerMapRollHandler(null);
  }, [executeMapRoll, registerMapRollHandler]);

  const beginMapReroll = useCallback(() => {
    if (!gameIdentity || mapRollInProgress) return;

    const length = activeMapRollLength(history.present);
    if (needsMapRollDiscardConfirmation(history.present)) {
      setMapRollConfirmOpen(true);
      return;
    }

    void executeMapRoll(length, { reason: "reroll", confirmDiscardEdits: false });
  }, [executeMapRoll, gameIdentity, history.present, mapRollInProgress]);

  const confirmMapReroll = useCallback(() => {
    setMapRollConfirmOpen(false);
    const length = activeMapRollLength(latestSpecRef.current);
    void executeMapRoll(length, { reason: "reroll", confirmDiscardEdits: true });
  }, [executeMapRoll]);

  useEffect(() => {
    if (
      history.present.setupStep !== "complete" ||
      !thumbnailCapture ||
      thumbnailSavePromiseRef.current ||
      (
        identityRef.current &&
        savedThumbnailGameIdsRef.current.has(identityRef.current.id)
      )
    ) {
      return;
    }

    const saveThumbnail = async () => {
      latestSpecRef.current = history.present;
      if (!await persistLatest()) return;
      const identity = identityRef.current;
      if (!identity || savedThumbnailGameIdsRef.current.has(identity.id)) return;

      const thumbnailBlob = await thumbnailCapture();
      await uploadGameThumbnail(identity.id, thumbnailBlob);
      savedThumbnailGameIdsRef.current.add(identity.id);
    };

    const promise = saveThumbnail()
      .catch((error: unknown) => {
        console.error("Failed to capture game thumbnail", error);
      })
      .finally(() => {
        if (thumbnailSavePromiseRef.current === promise) {
          thumbnailSavePromiseRef.current = null;
        }
      });
    thumbnailSavePromiseRef.current = promise;
  }, [history.present, persistLatest, thumbnailCapture]);

  const updateThumbnail = useCallback(async () => {
    const pendingThumbnailSave = thumbnailSavePromiseRef.current;
    if (pendingThumbnailSave) await pendingThumbnailSave;

    const identity = identityRef.current;
    if (!identity || !thumbnailCapture) {
      throw new Error("The game thumbnail is not ready yet.");
    }

    const promise = (async () => {
      const thumbnailBlob = await thumbnailCapture();
      await uploadGameThumbnail(identity.id, thumbnailBlob);
      savedThumbnailGameIdsRef.current.add(identity.id);
    })();
    thumbnailSavePromiseRef.current = promise;

    try {
      await promise;
    } finally {
      if (thumbnailSavePromiseRef.current === promise) {
        thumbnailSavePromiseRef.current = null;
      }
    }
  }, [thumbnailCapture]);

  useEffect(() => {
    if (identityRef.current) publishGameIdentity(identityRef.current);
  }, [publishGameIdentity]);

  useEffect(() => {
    latestSpecRef.current = history.present;
    const title = titleRef.current.trim() || defaultGameTitle(history.present);
    const alreadySaved =
      identityRef.current &&
      savedSpecRef.current &&
      savedTitleRef.current === title &&
      savedPublicRef.current === publicRef.current &&
      sameGameDocument(savedSpecRef.current, history.present);

    if (alreadySaved) return;

    setSaveStatus("saving");
    const timeout = window.setTimeout(() => {
      void persistLatest();
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [history.present, persistLatest]);

  useEffect(
    () => () => {
      if (
        !savedSpecRef.current ||
        savedTitleRef.current !== (
          titleRef.current.trim() || defaultGameTitle(latestSpecRef.current)
        ) ||
        savedPublicRef.current !== publicRef.current ||
        !sameGameDocument(savedSpecRef.current, latestSpecRef.current)
      ) {
        void persistLatest();
      }
    },
    [persistLatest],
  );

  useEffect(() => {
    function handleHistoryShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isEditingText =
        target?.matches("input, textarea, [contenteditable='true']") ?? false;

      if (isEditingText || (!event.ctrlKey && !event.metaKey)) return;

      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
      } else if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        dispatch({ type: "redo" });
      }
    }

    window.addEventListener("keydown", handleHistoryShortcut);
    return () => window.removeEventListener("keydown", handleHistoryShortcut);
  }, []);

  useEffect(() => {
    const dialog = levelDialogRef.current;
    if (!dialog) return;
    if (levelPickerOpen && !dialog.open) dialog.showModal();
    if (!levelPickerOpen && dialog.open) dialog.close();
  }, [levelPickerOpen]);

  useEffect(() => {
    const dialog = levelNameDialogRef.current;
    if (!dialog) return;
    if (pendingLevel && !dialog.open) {
      dialog.showModal();
      levelNameInputRef.current?.focus();
      levelNameInputRef.current?.select();
    }
    if (!pendingLevel && dialog.open) dialog.close();
  }, [pendingLevel]);

  useEffect(() => {
    const dialog = levelSettingsDialogRef.current;
    if (!dialog) return;
    if (levelSettingsOpen && !dialog.open) {
      dialog.showModal();
      gameSettingsNameInputRef.current?.focus();
      gameSettingsNameInputRef.current?.select();
    }
    if (!levelSettingsOpen && dialog.open) dialog.close();
  }, [levelSettingsOpen]);

  useEffect(() => {
    const dialog = shareDialogRef.current;
    if (!dialog) return;
    if (shareDialogOpen && !dialog.open) dialog.showModal();
    if (!shareDialogOpen && dialog.open) dialog.close();
  }, [shareDialogOpen]);

  useEffect(() => {
    const dialog = mapRollConfirmDialogRef.current;
    if (!dialog) return;
    if (mapRollConfirmOpen && !dialog.open) dialog.showModal();
    if (!mapRollConfirmOpen && dialog.open) dialog.close();
  }, [mapRollConfirmOpen]);

  const playHref = gameIdentity && savedGamePublic
    ? playGamePath(gameIdentity.id)
    : null;

  const openGameSettings = useCallback(() => {
    setGameSettingsName(titleRef.current);
    setGameSettingsPublic(publicRef.current);
    setLevelSettingsOpen(true);
  }, []);

  const openShareDialog = useCallback(() => {
    if (!playHref) return;

    setSharePlayUrl(`${window.location.origin}${playHref}`);
    setShareUrlCopied(false);
    setShareDialogOpen(true);
  }, [playHref]);

  const closeShareDialog = useCallback(() => {
    setShareDialogOpen(false);
    setShareUrlCopied(false);
  }, []);

  const copyShareUrl = useCallback(async () => {
    if (!sharePlayUrl) return;

    try {
      await navigator.clipboard.writeText(sharePlayUrl);
      setShareUrlCopied(true);
    } catch {
      setShareUrlCopied(false);
    }
  }, [sharePlayUrl]);

  const { previewKind } = history.present;

  useEffect(() => {
    if (previewKind !== "platformer" || platformerPlaying) return;

    const deactivatePaletteTool = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (mapAreaRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(`.${styles.mapTool}`)) return;

      setActiveTool((tool) => (
        isPlatformerPalettePaintTool(tool) ? "select" : tool
      ));
    };

    document.addEventListener("click", deactivatePaletteTool);
    return () => document.removeEventListener("click", deactivatePaletteTool);
  }, [previewKind, platformerPlaying]);

  const campaignMaps = useMemo(
    () => gameCampaignMaps(history.present, maps),
    [history.present, maps],
  );
  const availableMazes = useMemo(
    () => gameMazeMaps(history.present, mazes),
    [history.present, mazes],
  );
  const currentMapIndex = campaignMapIndex(history.present, campaignMaps);
  const current = campaignMaps[currentMapIndex];
  const currentMaze = availableMazes[mazeMapIndex(history.present, availableMazes)];
  const editableTerrainMap = useMemo(
    () => current
      ? applyPlatformerTerrainSettings(
          applyPlatformerTerrainEdits(
            current.map,
            current.source,
            history.present.platformerTerrainEdits,
          ),
          current.source,
          history.present.platformerTerrainSettings,
        )
      : null,
    [
      current,
      history.present.platformerTerrainEdits,
      history.present.platformerTerrainSettings,
    ],
  );
  const editableObjectMap = useMemo(
    () => editableTerrainMap
      ? applyPlatformerLevelArt(
          applyPlatformerObjectEdits(
            editableTerrainMap,
            current!.source,
            history.present.platformerObjectEdits,
            history.present.platformerObjectRemovals,
            history.present.platformerObjectSettings,
          ),
          current!.source,
          history.present.platformerLevelArt,
          history.present.platformerObjectSettings,
          history.present.platformerObjectEdits,
        )
      : null,
    [
      current,
      editableTerrainMap,
      history.present.platformerLevelArt,
      history.present.platformerObjectEdits,
      history.present.platformerObjectRemovals,
      history.present.platformerObjectSettings,
    ],
  );

  if (!current || !currentMaze || !editableObjectMap) return null;
  /**
   * The level's own world is what the dropdowns show until a kid picks another,
   * and painting from it records no world at all, so the level keeps wearing
   * whatever it wears - including anything Cooper borrowed for it.
   */
  const homeArtWorld =
    artWorld(editableObjectMap.presentation.backgroundId)?.id ?? ART_WORLDS[0].id;
  const selectedTerrainArtWorld = terrainArtWorld ?? homeArtWorld;
  const selectedObjectArtWorld = objectArtWorld ?? homeArtWorld;
  const paintTerrainWorld =
    selectedTerrainArtWorld === homeArtWorld ? undefined : selectedTerrainArtWorld;
  const paintObjectWorld =
    selectedObjectArtWorld === homeArtWorld ? undefined : selectedObjectArtWorld;
  const selectedObject = editorSelection.objectIds.length === 1
    ? editableObjectMap.objects.find((object) => object.id === editorSelection.objectIds[0]) ?? null
    : null;
  const selectedTerrainCell = !selectedObject && editorSelection.terrainCells.length === 1
    ? editorSelection.terrainCells[0]
    : null;
  const selectedTerrainIsHazard = selectedTerrainCell && editableTerrainMap
    ? platformerTerrainKindAt(
        editableTerrainMap,
        selectedTerrainCell.x,
        selectedTerrainCell.y,
      ) === "hazard"
    : false;
  const selectedLevel = previewKind === "maze" ? currentMaze : current;
  const availableLevels = previewKind === "maze" ? availableMazes : campaignMaps;
  const selectedLevelIndex = availableLevels.findIndex(
    (level) => level.source === selectedLevel.source,
  );
  const changeLevel = (source: string) => {
    const index = availableLevels.findIndex((candidate) => candidate.source === source);
    if (index < 0) return;
    setEditorSelection(EMPTY_PLATFORMER_EDITOR_SELECTION);
    commitLevelPlan((spec) => planSetActiveLevel(spec, index + 1));
  };
  const chooseWorld = (templateSource: string, templateLabel: string) => {
    const existingCount = previewKind === "maze"
      ? history.present.mazeLevels.filter(
          (level) => level.templateSource === templateSource,
        ).length + Number(history.present.mazeMapSource === templateSource)
      : history.present.platformerLevels.filter(
          (level) => level.templateSource === templateSource,
        ).length + Number(history.present.platformerMapSource === templateSource);
    const defaultName = `${templateLabel} ${existingCount + 1}`;
    closeLevelPicker();
    setLevelName(defaultName);
    setPendingLevel({ source: templateSource, defaultName });
  };
  /**
   * The kid's level buttons and Cooper's level tools run the same planners, so
   * a level renamed from the dialog and one renamed in chat produce the same
   * document. A planner refusal, such as the level cap, leaves the game alone:
   * the dialogs only ever offer choices that pass.
   */
  const commitLevelPlan = (plan: (spec: GameDocument) => CooperSpecChange) => {
    try {
      dispatch({
        type: "edit",
        spec: applyCooperSpecChange(history.present, plan(history.present)),
      });
      return true;
    } catch (error) {
      if (error instanceof GameObjectEditError) return false;
      throw error;
    }
  };
  const selectedLevelNumber = selectedLevelIndex + 1;
  const createLevel = (templateSource: string, name: string) => {
    setEditorSelection(EMPTY_PLATFORMER_EDITOR_SELECTION);
    commitLevelPlan((spec) => planAddLevel(spec, templateSource, name));
    setPendingLevel(null);
  };
  const renameSelectedLevel = () => {
    const name = levelSettingsInputRef.current?.value.trim() ?? "";
    if (!name) return;
    commitLevelPlan((spec) => planRenameLevel(spec, selectedLevelNumber, name));
  };
  const deleteSelectedLevel = () => {
    if (availableLevels.length <= 1) return;
    setEditorSelection(EMPTY_PLATFORMER_EDITOR_SELECTION);
    commitLevelPlan((spec) => planRemoveLevel(spec, selectedLevelNumber));
  };
  const saveGameSettings = () => {
    try {
      const title = planGameName(gameSettingsName);
      titleRef.current = title;
      publicRef.current = gameSettingsPublic;
      setGameSettingsName(title);
      showTitle(title);
      void persistLatest();
    } catch (error) {
      if (error instanceof GameObjectEditError) return;
      throw error;
    }
  };
  const moveLevel = (fromSource: string, toSource: string) => {
    const fromIndex = availableLevels.findIndex((level) => level.source === fromSource);
    const toIndex = availableLevels.findIndex((level) => level.source === toSource);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    commitLevelPlan((spec) => planMoveLevelTo(spec, fromIndex + 1, toIndex + 1));
  };
  const dropLevel = (event: DragEvent<HTMLButtonElement>, toSource: string) => {
    event.preventDefault();
    const fromSource = draggedLevelSource || event.dataTransfer.getData("text/plain");
    if (fromSource) moveLevel(fromSource, toSource);
    setDraggedLevelSource(null);
    setDragOverLevelSource(null);
  };
  const applyTerrainStroke = (stroke: readonly PlatformerTerrainStrokeCell[]) => {
    const platformerTerrainEdits = mergePlatformerTerrainEdits(
      history.present.platformerTerrainEdits,
      current.source,
      current.map,
      stroke,
      paintTerrainWorld,
    );
    if (stroke.some((cell) => cell.kind === "empty")) {
      const erased = erasePlatformerObjectsAtCells(
        current.map,
        current.source,
        history.present.platformerObjectEdits,
        history.present.platformerObjectRemovals,
        stroke.filter((cell) => cell.kind === "empty"),
        history.present.platformerObjectSettings,
      );
      const erasedIds = new Set(erased.removals.map((removal) => removal.objectId));
      const erasedCells = new Set(
        stroke
          .filter((cell) => cell.kind === "empty")
          .map((cell) => `${cell.x},${cell.y}`),
      );
      setEditorSelection({
        objectIds: editorSelection.objectIds.filter((objectId) => !erasedIds.has(objectId)),
        terrainCells: editorSelection.terrainCells.filter(
          (cell) => !erasedCells.has(`${cell.x},${cell.y}`),
        ),
      });
      commit({
        platformerTerrainEdits,
        platformerObjectEdits: erased.edits,
        platformerObjectRemovals: erased.removals,
        platformerObjectSettings: erased.settings,
        platformerTerrainSettings: erasePlatformerTerrainSettingsAtCells(
          history.present.platformerTerrainSettings,
          current.source,
          stroke.filter((cell) => cell.kind === "empty"),
        ),
      });
      return;
    }
    commit({ platformerTerrainEdits });
  };
  const applyObjectPlacement = (placements: readonly PlatformerObjectPlacement[]) => {
    if (placements.length === 0) return;
    const platformerObjectEdits = mergePlatformerObjectEdits(
      history.present.platformerObjectEdits,
      current.source,
      current.map,
      placements,
      paintObjectWorld,
    );
    commit({ platformerObjectEdits });
    const placed = placements[placements.length - 1];
    // A click on a zoomed-out map already stands the hero where it landed, so a
    // spawn dropped there must not open the hero's settings.
    if (placed.kind === "spawn" && clampEditorZoomScale(current.map, editorZoomScale) < 1) {
      setEditorSelection(EMPTY_PLATFORMER_EDITOR_SELECTION);
      return;
    }
    setEditorSelection({ objectIds: [placed.id], terrainCells: [] });
  };
  const applySelectionMove = (
    dx: number,
    dy: number,
    selection: PlatformerEditorSelection = editorSelection,
  ) => {
    const moved = movePlatformerEditorSelection(
      current.map,
      current.source,
      history.present.platformerObjectEdits,
      history.present.platformerObjectRemovals,
      history.present.platformerObjectSettings,
      history.present.platformerTerrainEdits,
      history.present.platformerTerrainSettings,
      selection,
      dx,
      dy,
    );
    if (moved.delta.dx === 0 && moved.delta.dy === 0) return;
    commit({
      platformerObjectEdits: moved.platformerObjectEdits,
      platformerTerrainEdits: moved.platformerTerrainEdits,
      platformerTerrainSettings: moved.platformerTerrainSettings,
    });
    setEditorSelection(moved.selection);
  };
  const changeSelectedObjectSettings = (change: PlatformerObjectSettingsChange) => {
    const objectId = editorSelection.objectIds[0];
    if (!objectId || editorSelection.objectIds.length !== 1) return;
    commit({
      platformerObjectSettings: upsertPlatformerObjectSettings(
        history.present.platformerObjectSettings,
        current.source,
        objectId,
        change,
      ),
    });
  };
  const changeSelectedTerrainSettings = (change: PlatformerTerrainSettingsChange) => {
    if (!selectedTerrainCell) return;
    commit({
      platformerTerrainSettings: upsertPlatformerTerrainSettings(
        history.present.platformerTerrainSettings,
        current.source,
        selectedTerrainCell.x,
        selectedTerrainCell.y,
        change,
      ),
    });
  };
  const zoomEnabled = previewKind !== "maze" && !platformerPlaying;
  const clampedEditorZoom = clampEditorZoomScale(current.map, editorZoomScale);
  const canZoomOut = zoomEnabled && canStepEditorZoom(current.map, clampedEditorZoom, "out");
  const canZoomIn = zoomEnabled && canStepEditorZoom(current.map, clampedEditorZoom, "in");
  const canResetZoom = zoomEnabled && clampedEditorZoom < 1;

  return (
    <>
      <header className={styles.previewHeading}>
        <div className={styles.previewPlayActions}>
          {playHref ? (
            <a
              className={styles.playGameButton}
              href={playHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Play this game in a new tab"
            >
              <span>Play</span>
              <ExternalLinkIcon />
            </a>
          ) : (
            <button
              className={styles.playGameButton}
              type="button"
              disabled
              aria-label={
                gameIdentity
                  ? "Make this game public to open its play page"
                  : "Play will be available after this game saves"
              }
            >
              <span>Play</span>
              <ExternalLinkIcon />
            </button>
          )}
          <button
            className={styles.shareGameButton}
            type="button"
            disabled={!playHref}
            aria-label={
              playHref
                ? "Share play link"
                : gameIdentity
                  ? "Make this game public to share it"
                  : "Share will be available after this game saves"
            }
            onClick={openShareDialog}
          >
            <span>Share</span>
            <ShareIcon />
          </button>
        </div>
        <h2 className={styles.previewGameName}>
          {displayTitle.trim() || defaultGameTitle(history.present)}
        </h2>
        <div className={styles.previewMapControls}>
          <div className={styles.historyControls} aria-label="Edit history">
            <button
              type="button"
              disabled={history.past.length === 0 || mapRollInProgress}
              onClick={() => dispatch({ type: "undo" })}
            >
              ↶ Undo
            </button>
            <button
              type="button"
              disabled={history.future.length === 0 || mapRollInProgress}
              onClick={() => dispatch({ type: "redo" })}
            >
              Redo ↷
            </button>
          </div>
          <button
            className={styles.mapRollButton}
            type="button"
            disabled={!gameIdentity || mapRollInProgress || platformerPlaying}
            aria-busy={mapRollInProgress}
            title={
              !gameIdentity
                ? "Re-roll will be available after this game saves"
                : platformerPlaying
                  ? "Pause the game to re-roll the map"
                  : "Generate a different random map for this level"
            }
            onClick={beginMapReroll}
          >
            {mapRollInProgress ? "Re-rolling…" : "Re-roll map"}
          </button>
          <div className={styles.zoomControls} aria-label="Map zoom">
            <button
              type="button"
              disabled={!canZoomOut}
              aria-label="Zoom out"
              title="Zoom out"
              onClick={() => setEditorZoomScale((scale) =>
                stepEditorZoomScale(current.map, scale, "out"),
              )}
            >
              −
            </button>
            <button
              type="button"
              disabled={!canResetZoom}
              aria-label="Reset zoom"
              title="Reset zoom"
              onClick={() => setEditorZoomScale(1)}
            >
              <ResetZoomIcon />
            </button>
            <button
              type="button"
              disabled={!canZoomIn}
              aria-label="Zoom in"
              title="Zoom in"
              onClick={() => setEditorZoomScale((scale) =>
                stepEditorZoomScale(current.map, scale, "in"),
              )}
            >
              +
            </button>
          </div>
        </div>
      </header>

      <GamePlayer
        key={`${history.present.platformerMapSource}:${history.present.mazeMapSource}:${previewEpoch}`}
        spec={history.present}
        maps={maps}
        mazes={mazes}
        physics={physics}
        weapon={weapon}
        controlRowLeading={(
          <button
            className={styles.gameSettingsButton}
            type="button"
            aria-haspopup="dialog"
            onClick={openGameSettings}
          >
            <SettingsIcon />
            <span>Settings</span>
          </button>
        )}
        hidePlatformerEditorLabels
        savedGameId={gameIdentity?.id}
        onThumbnailCaptureReady={handleThumbnailCaptureReady}
        onUpdateThumbnail={
          gameIdentity && thumbnailCapture ? updateThumbnail : undefined
        }
        onPlatformerPlayingChange={setPlatformerPlaying}
        editorZoomScale={clampedEditorZoom}
        mapAreaRef={mapAreaRef}
        platformerEditor={{
          tool: activeTool,
          onToolChange: setActiveTool,
          onTerrainStroke: applyTerrainStroke,
          onObjectPlace: applyObjectPlacement,
          selection: editorSelection,
          onSelectionChange: setEditorSelection,
          onSelectionMove: applySelectionMove,
        }}
      />

      <BuildTools
        activeTool={activeTool}
        presentation={editableObjectMap.presentation}
        disabled={previewKind !== "platformer" || platformerPlaying || mapRollInProgress}
        disabledMessage={
          platformerPlaying
            ? "Pause the game to add blocks and objects."
            : undefined
        }
        objectArtWorld={selectedObjectArtWorld}
        playerAssetId={activePlayerAssetId(history.present)}
        terrainArtWorld={selectedTerrainArtWorld}
        onObjectArtWorldChange={setObjectArtWorld}
        onTerrainArtWorldChange={setTerrainArtWorld}
        onToolChange={setActiveTool}
      />

      <dialog
        className={styles.levelDialog}
        ref={levelDialogRef}
        aria-labelledby="add-level-title"
        onClose={closeLevelPicker}
        onCancel={closeLevelPicker}
      >
        <header>
          <div>
            <span>Add a level</span>
            <h2 id="add-level-title">Choose a theme</h2>
          </div>
          <button
            type="button"
            aria-label="Close add level"
            onClick={closeLevelPicker}
          >
            ×
          </button>
        </header>
        <div className={styles.levelThemeGrid}>
          {(previewKind === "maze" ? mazes : maps).map((level) => (
            <button
              type="button"
              key={level.source}
              onClick={() => chooseWorld(level.source, level.label)}
            >
              <span aria-hidden="true">{WORLD_ICONS[level.source] ?? "🗺️"}</span>
              <strong>{level.label}</strong>
            </button>
          ))}
        </div>
      </dialog>

      <dialog
        className={styles.levelDialog}
        ref={levelNameDialogRef}
        aria-labelledby="name-level-title"
        onClose={() => setPendingLevel(null)}
        onCancel={() => setPendingLevel(null)}
      >
        <header>
          <div>
            <span>Add a level</span>
            <h2 id="name-level-title">Name your level</h2>
          </div>
          <button
            type="button"
            aria-label="Close name level"
            onClick={() => setPendingLevel(null)}
          >
            ×
          </button>
        </header>
        <form
          className={styles.levelNameForm}
          onSubmit={(event) => {
            event.preventDefault();
            if (!pendingLevel) return;
            createLevel(
              pendingLevel.source,
              levelName.trim() || pendingLevel.defaultName,
            );
          }}
        >
          <label className={styles.levelNameField}>
            <span>Level name</span>
            <input
              ref={levelNameInputRef}
              value={levelName}
              maxLength={40}
              required
              onChange={(event) => setLevelName(event.target.value)}
            />
          </label>
          <div className={styles.levelNameActions}>
            <button type="button" onClick={() => setPendingLevel(null)}>Cancel</button>
            <button type="submit">Create level</button>
          </div>
        </form>
      </dialog>

      <dialog
        className={styles.shareDialog}
        ref={shareDialogRef}
        aria-labelledby="share-play-title"
        onClose={closeShareDialog}
        onCancel={closeShareDialog}
      >
        <header>
          <div>
            <span>Share your game</span>
            <h2 id="share-play-title">Play link</h2>
          </div>
          <button
            type="button"
            aria-label="Close share dialog"
            onClick={closeShareDialog}
          >
            ×
          </button>
        </header>
        <div className={styles.shareDialogBody}>
          <p>Anyone with this link can play your game in a new tab.</p>
          <output className={styles.shareUrlOutput}>{sharePlayUrl}</output>
          <button
            className={styles.shareCopyButton}
            type="button"
            onClick={() => void copyShareUrl()}
          >
            {shareUrlCopied ? "Copied!" : "Copy link"}
          </button>
        </div>
      </dialog>

      <dialog
        className={styles.levelDialog}
        ref={mapRollConfirmDialogRef}
        aria-labelledby="map-roll-confirm-title"
        onClose={() => setMapRollConfirmOpen(false)}
        onCancel={() => setMapRollConfirmOpen(false)}
      >
        <header>
          <div>
            <span>Map</span>
            <h2 id="map-roll-confirm-title">Re-roll this map?</h2>
          </div>
          <button
            type="button"
            aria-label="Close re-roll confirmation"
            onClick={() => setMapRollConfirmOpen(false)}
          >
            ×
          </button>
        </header>
        <div className={styles.mapRollConfirmBody}>
          <p>
            Re-rolling replaces this level&apos;s terrain and object edits with a
            new random map. Your other levels stay the same.
          </p>
          {mapRollError ? (
            <p className={styles.mapRollConfirmError}>{mapRollError}</p>
          ) : null}
          <div className={styles.mapRollConfirmActions}>
            <button type="button" onClick={() => setMapRollConfirmOpen(false)}>
              Keep my edits
            </button>
            <button type="button" onClick={confirmMapReroll}>
              Discard edits and re-roll
            </button>
          </div>
        </div>
      </dialog>

      <dialog
        className={`${styles.levelDialog} ${styles.gameSettingsDialog}`}
        ref={levelSettingsDialogRef}
        aria-labelledby="game-settings-title"
        onCancel={(event) => {
          event.preventDefault();
          setLevelSettingsOpen(false);
        }}
      >
        <header>
          <div>
            <span>Game</span>
            <h2 id="game-settings-title">Settings</h2>
          </div>
          <button
            type="button"
            aria-label="Close settings"
            onClick={() => setLevelSettingsOpen(false)}
          >
            ×
          </button>
        </header>
        <div className={styles.gameSettingsBody}>
          <form
            className={styles.gameSettingsForm}
            onSubmit={(event) => {
              event.preventDefault();
              saveGameSettings();
            }}
          >
            <h3>Game settings</h3>
            <label className={styles.levelNameField}>
              <span>Game name</span>
              <input
                ref={gameSettingsNameInputRef}
                value={gameSettingsName}
                maxLength={MAX_GAME_NAME_LENGTH}
                required
                onChange={(event) => setGameSettingsName(event.target.value)}
              />
            </label>
            <label className={styles.publicGameField}>
              <input
                type="checkbox"
                checked={gameSettingsPublic}
                onChange={(event) => setGameSettingsPublic(event.target.checked)}
              />
              <span>Make game public</span>
            </label>
            <button className={styles.saveGameSettingsButton} type="submit">
              Save game settings
            </button>
          </form>

          <div className={styles.levelSettingsGrid}>
            <section className={styles.levelListColumn} aria-labelledby="levels-title">
              <div className={styles.settingsSectionHeading}>
                <div>
                  <span>Game levels</span>
                  <h3 id="levels-title">Levels</h3>
                </div>
                <span>{availableLevels.length}</span>
              </div>
              <p className={styles.levelSortHint}>Drag levels to change their order.</p>
              <ol className={styles.levelList}>
                {availableLevels.map((level, index) => {
                  const selected = level.source === selectedLevel.source;
                  const dragging = level.source === draggedLevelSource;
                  const dragOver = level.source === dragOverLevelSource && !dragging;
                  return (
                    <li key={level.source}>
                      <button
                        className={`${styles.levelListItem} ${selected ? styles.levelListItemSelected : ""} ${dragging ? styles.levelListItemDragging : ""} ${dragOver ? styles.levelListItemDragOver : ""}`}
                        type="button"
                        draggable
                        aria-current={selected ? "true" : undefined}
                        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                        onClick={() => changeLevel(level.source)}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", level.source);
                          setDraggedLevelSource(level.source);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          setDragOverLevelSource(level.source);
                        }}
                        onDragLeave={() => {
                          setDragOverLevelSource((source) => (
                            source === level.source ? null : source
                          ));
                        }}
                        onDrop={(event) => dropLevel(event, level.source)}
                        onDragEnd={() => {
                          setDraggedLevelSource(null);
                          setDragOverLevelSource(null);
                        }}
                        onKeyDown={(event) => {
                          if (!event.altKey) return;
                          const targetIndex = event.key === "ArrowUp"
                            ? index - 1
                            : event.key === "ArrowDown"
                              ? index + 1
                              : index;
                          const target = availableLevels[targetIndex];
                          if (targetIndex === index || !target) return;
                          event.preventDefault();
                          moveLevel(level.source, target.source);
                        }}
                      >
                        <span className={styles.levelDragHandle} aria-hidden="true">⠿</span>
                        <span className={styles.levelNumber}>{index + 1}</span>
                        <span className={styles.levelListLabel}>{level.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              <button
                className={styles.addLevelFromSettingsButton}
                type="button"
                onClick={openLevelPicker}
              >
                <span aria-hidden="true">+</span>
                Add level
              </button>
            </section>

            <section className={styles.selectedLevelColumn} aria-labelledby="selected-level-settings-title">
              <div className={styles.settingsSectionHeading}>
                <div>
                  <span>Level {selectedLevelNumber}</span>
                  <h3 id="selected-level-settings-title">Level settings</h3>
                </div>
              </div>
              <form
                className={styles.levelSettingsForm}
                onSubmit={(event) => {
                  event.preventDefault();
                  renameSelectedLevel();
                }}
              >
                <label className={styles.levelNameField}>
                  <span>Level name</span>
                  <input
                    key={selectedLevel.source}
                    ref={levelSettingsInputRef}
                    defaultValue={selectedLevel.label}
                    maxLength={40}
                    required
                  />
                </label>
                <button className={styles.renameLevelButton} type="submit">
                  Save name
                </button>
                <div className={styles.levelDeleteRow}>
                  <p>{availableLevels.length <= 1 ? "A game needs at least one level." : "Delete this level from the game."}</p>
                  <button
                    type="button"
                    disabled={availableLevels.length <= 1}
                    onClick={deleteSelectedLevel}
                  >
                    Delete level
                  </button>
                </div>
              </form>
            </section>
          </div>
        </div>
      </dialog>

      {selectedObject ? (
        <BuildObjectToolbox
          backgroundId={current.map.presentation.backgroundId}
          object={selectedObject}
          onChange={changeSelectedObjectSettings}
          onClose={() => setEditorSelection({
            objectIds: [],
            terrainCells: editorSelection.terrainCells,
          })}
        />
      ) : null}
      {selectedTerrainCell && selectedTerrainIsHazard && editableTerrainMap ? (
        <BuildTerrainToolbox
          animationStartFrame={terrainAnimationStartFrame(
            editableTerrainMap,
            current.source,
            selectedTerrainCell.x,
            selectedTerrainCell.y,
            history.present.platformerTerrainSettings,
          )}
          cell={selectedTerrainCell}
          map={editableTerrainMap}
          onChange={changeSelectedTerrainSettings}
          onClose={() => setEditorSelection({
            objectIds: editorSelection.objectIds,
            terrainCells: [],
          })}
        />
      ) : null}
    </>
  );
}
