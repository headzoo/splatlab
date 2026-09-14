"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

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
  erasePlatformerObjectsAtCells,
  EMPTY_PLATFORMER_EDITOR_SELECTION,
  isPlatformerPalettePaintTool,
  mergePlatformerObjectEdits,
  mergePlatformerTerrainEdits,
  movePlatformerEditorSelection,
  type PlatformerEditTool,
  type PlatformerEditorSelection,
  type PlatformerObjectPlacement,
  type PlatformerObjectSettingsChange,
  type PlatformerTerrainStrokeCell,
  upsertPlatformerObjectSettings,
} from "@/game/platformer/map-editing";
import {
  canStepEditorZoom,
  clampEditorZoomScale,
  stepEditorZoomScale,
} from "@/game/platformer/engine";
import {
  activeGameTheme,
  activePlayerAssetId,
  defaultGameTitle,
  DEFAULT_GAME_DOCUMENT,
  type ArtWorldId,
  type GameDocument,
  type SavedGameDto,
} from "@/lib/game-contract";
import {
  applyCooperSpecChange,
  specChangeFrom,
  type CooperSpecChange,
} from "@/lib/cooper-spec-change";
import { GameObjectEditError } from "@/lib/game-objects";
import {
  planAddLevel,
  planMoveLevel,
  planRemoveLevel,
  planRenameLevel,
  planSetActiveLevel,
  type LevelMoveDirection,
} from "@/lib/game-levels-editing";
import { buildGamePath, playGamePath } from "@/lib/game-routes";
import {
  createGameHistory,
  gameHistoryReducer,
  sameGameDocument,
} from "@/lib/game-history";

import { reconcilePersistedGame, useBuildSetup } from "./build-setup";
import { BuildObjectToolbox } from "./build-object-toolbox";
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

async function putGameThumbnail(gameId: string, thumbnailDataUrl: string) {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(
      `/api/games/${encodeURIComponent(gameId)}/thumbnail`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thumbnailDataUrl }),
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
  const levelDialogRef = useRef<HTMLDialogElement>(null);
  const levelNameDialogRef = useRef<HTMLDialogElement>(null);
  const levelNameInputRef = useRef<HTMLInputElement>(null);
  const levelSettingsDialogRef = useRef<HTMLDialogElement>(null);
  const levelSettingsInputRef = useRef<HTMLInputElement>(null);
  const latestSpecRef = useRef(history.present);
  const savedSpecRef = useRef<GameDocument | null>(initialGame?.spec ?? null);
  const titleRef = useRef(initialTitle);
  const savedTitleRef = useRef<string | null>(initialGame?.title ?? null);
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
  const savePromiseRef = useRef<Promise<void> | null>(null);
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
  const commit = useCallback(
    (
      change: Partial<
        Pick<
          GameDocument,
          | "previewKind"
          | "platformerMapSource"
          | "mazeMapSource"
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
        >
      >,
    ) => {
      dispatch({ type: "edit", spec: { ...history.present, ...change } });
    },
    [history.present],
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
    const fallbackServerSpec = {
      ...savedSpec,
      builderChatHistory: persistedBuildTurn.chatHistory,
      ...(persistedBuildTurn.physicsDocument
        ? { physicsDocument: persistedBuildTurn.physicsDocument }
        : {}),
      ...(persistedBuildTurn.specChange
        ? applyCooperSpecChange(savedSpec, persistedBuildTurn.specChange)
        : {}),
    };

    identityRef.current = { ...identity, revision: persistedBuildTurn.revision };
    savedSpecRef.current = fallbackServerSpec;
    if (persistedBuildTurn.title) adoptServerTitle(persistedBuildTurn.title);
    latestSpecRef.current = reconcilePersistedGame(
      fallbackServerSpec,
      savedSpec,
      latestSpecRef.current,
    );
    dispatch({ type: "chat", turns: fallbackServerSpec.builderChatHistory });
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
      latestSpecRef.current = reconciled;
      dispatch({ type: "chat", turns: game.spec.builderChatHistory });
      dispatch({ type: "physics", document: game.spec.physicsDocument });
      // The reconciled document, not the raw server one: Cooper and the level
      // editor both own these fields now, so a level the kid added while the
      // turn was in flight must not be thrown away by the confirming fetch.
      dispatch({ type: "specChange", change: specChangeFrom(reconciled) });
    })();
  }, [adoptServerTitle, persistedBuildTurn]);

  const persistLatest = useCallback(() => {
    if (savePromiseRef.current) return savePromiseRef.current;

    const savePromise = (async () => {
      while (true) {
        const spec = latestSpecRef.current;
        const identity = identityRef.current;
        const title = titleRef.current.trim() || defaultGameTitle(spec);

        if (
          identity &&
          savedSpecRef.current &&
          savedTitleRef.current === title &&
          sameGameDocument(savedSpecRef.current, spec)
        ) {
          setSaveStatus("saved");
          return;
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
                    spec,
                    expectedRevision: identity.revision,
                  }
                : { title, spec },
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
            latestSpecRef.current = reconciled;
            dispatch({ type: "chat", turns: game.spec.builderChatHistory });
            continue;
          }
          setSaveStatus("error");
          setSaveError(errorMessage(payload, "We couldn't save your game."));
          return;
        }

        const savedGame = (payload as { game: SavedGameDto }).game;
        const nextIdentity = { id: savedGame.id, revision: savedGame.revision };
        identityRef.current = nextIdentity;
        savedSpecRef.current = spec;
        savedTitleRef.current = savedGame.title;
        const latestTitle =
          titleRef.current.trim() || defaultGameTitle(latestSpecRef.current);
        if (latestTitle === title) {
          titleRef.current = savedGame.title;
          showTitle(savedGame.title);
        }
        publishGameIdentity(nextIdentity);

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
            savedGame.title
        ) {
          setSaveStatus("saved");
          return;
        }
      }
    })()
      .catch((error: unknown) => {
        setSaveStatus("error");
        setSaveError(
          error instanceof Error ? error.message : "We couldn't save your game.",
        );
      })
      .finally(() => {
        savePromiseRef.current = null;
      });

    savePromiseRef.current = savePromise;
    return savePromise;
  }, [adoptServerTitle, publishGameIdentity]);

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
      await persistLatest();
      const identity = identityRef.current;
      if (!identity || savedThumbnailGameIdsRef.current.has(identity.id)) return;

      const thumbnailDataUrl = await thumbnailCapture();
      await putGameThumbnail(identity.id, thumbnailDataUrl);
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
      const thumbnailDataUrl = await thumbnailCapture();
      await putGameThumbnail(identity.id, thumbnailDataUrl);
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
      levelSettingsInputRef.current?.focus();
      levelSettingsInputRef.current?.select();
    }
    if (!levelSettingsOpen && dialog.open) dialog.close();
  }, [levelSettingsOpen]);

  const { previewKind } = history.present;
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
  const editableObjectMap = useMemo(
    () => current
      ? applyPlatformerLevelArt(
          applyPlatformerObjectEdits(
            current.map,
            current.source,
            history.present.platformerObjectEdits,
            history.present.platformerObjectRemovals,
            history.present.platformerObjectSettings,
          ),
          current.source,
          history.present.platformerLevelArt,
          history.present.platformerObjectSettings,
          history.present.platformerObjectEdits,
        )
      : null,
    [
      current,
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
    setLevelSettingsOpen(false);
  };
  const deleteSelectedLevel = () => {
    if (availableLevels.length <= 1) return;
    setEditorSelection(EMPTY_PLATFORMER_EDITOR_SELECTION);
    commitLevelPlan((spec) => planRemoveLevel(spec, selectedLevelNumber));
    setLevelSettingsOpen(false);
  };
  const moveSelectedLevel = (direction: LevelMoveDirection) => {
    commitLevelPlan((spec) => planMoveLevel(spec, selectedLevelNumber, direction));
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
      selection,
      dx,
      dy,
    );
    if (moved.delta.dx === 0 && moved.delta.dy === 0) return;
    commit({
      platformerObjectEdits: moved.platformerObjectEdits,
      platformerTerrainEdits: moved.platformerTerrainEdits,
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
  const playHref = gameIdentity ? playGamePath(gameIdentity.id) : null;
  const zoomEnabled = previewKind !== "maze" && !platformerPlaying;
  const clampedEditorZoom = clampEditorZoomScale(current.map, editorZoomScale);
  const canZoomOut = zoomEnabled && canStepEditorZoom(current.map, clampedEditorZoom, "out");
  const canZoomIn = zoomEnabled && canStepEditorZoom(current.map, clampedEditorZoom, "in");
  const canResetZoom = zoomEnabled && clampedEditorZoom < 1;

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

  return (
    <>
      <header className={styles.previewHeading}>
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
            aria-label="Play will be available after this game saves"
          >
            <span>Play</span>
            <ExternalLinkIcon />
          </button>
        )}
        <h2 className={styles.previewGameName}>
          {displayTitle.trim() || defaultGameTitle(history.present)}
        </h2>
        <div className={styles.previewMapControls}>
          <div className={styles.historyControls} aria-label="Edit history">
            <button
              type="button"
              disabled={history.past.length === 0}
              onClick={() => dispatch({ type: "undo" })}
            >
              ↶ Undo
            </button>
            <button
              type="button"
              disabled={history.future.length === 0}
              onClick={() => dispatch({ type: "redo" })}
            >
              Redo ↷
            </button>
          </div>
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
        spec={history.present}
        maps={maps}
        mazes={mazes}
        physics={physics}
        weapon={weapon}
        controlRowLeading={(
          <div className={styles.levelPicker}>
            <label className={styles.levelSelect}>
              <span>Level</span>
              <select
                aria-label="Select level"
                value={selectedLevel.source}
                onChange={(event) => changeLevel(event.target.value)}
              >
                {availableLevels.map((level) => (
                  <option key={level.source} value={level.source}>{level.label}</option>
                ))}
              </select>
            </label>
            <button
              className={styles.addLevelButton}
              type="button"
              aria-label="Add a level"
              title="Add a level"
              onClick={openLevelPicker}
            >
              +
            </button>
            <button
              className={styles.levelSettingsButton}
              type="button"
              aria-label="Level settings"
              title="Level settings"
              onClick={() => setLevelSettingsOpen(true)}
            >
              <span aria-hidden="true">⚙</span>
            </button>
          </div>
        )}
        hidePlatformerEditorLabels
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
        disabled={previewKind !== "platformer" || platformerPlaying}
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
        className={styles.levelDialog}
        ref={levelSettingsDialogRef}
        aria-labelledby="level-settings-title"
        onCancel={(event) => {
          event.preventDefault();
          setLevelSettingsOpen(false);
        }}
      >
        <header>
          <div>
            <span>Selected level</span>
            <h2 id="level-settings-title">Level settings</h2>
          </div>
          <button
            type="button"
            aria-label="Close level settings"
            onClick={() => setLevelSettingsOpen(false)}
          >
            ×
          </button>
        </header>
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
          <button className={styles.renameLevelButton} type="submit">Save name</button>
          <div className={styles.levelOrderActions} aria-label="Level order">
            <button
              type="button"
              disabled={selectedLevelIndex <= 0}
              onClick={() => moveSelectedLevel("earlier")}
            >
              ← Move backward
            </button>
            <button
              type="button"
              disabled={selectedLevelIndex < 0 || selectedLevelIndex >= availableLevels.length - 1}
              onClick={() => moveSelectedLevel("later")}
            >
              Move forward →
            </button>
          </div>
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
    </>
  );
}
