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
import {
  applyPlatformerObjectEdits,
  erasePlatformerObjectsAtCells,
  mergePlatformerObjectEdit,
  mergePlatformerTerrainEdits,
  type PlatformerEditTool,
  type PlatformerObjectPlacement,
  type PlatformerObjectSettingsChange,
  type PlatformerTerrainStrokeCell,
  upsertPlatformerObjectSettings,
} from "@/game/platformer/map-editing";
import {
  activeGameTheme,
  defaultGameTitle,
  DEFAULT_GAME_DOCUMENT,
  MAZE_MAP_SOURCES,
  PLATFORMER_MAP_SOURCES,
  type GameDocument,
  type MazeLevel,
  type PlatformerLevel,
  type SavedGameDto,
} from "@/lib/game-contract";
import { applyCooperSpecChange, specChangeFrom } from "@/lib/cooper-spec-change";
import { buildGamePath } from "@/lib/game-routes";
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
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
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
      savedTitleRef.current = game.title;
      latestSpecRef.current = reconciled;
      dispatch({ type: "chat", turns: game.spec.builderChatHistory });
      dispatch({ type: "physics", document: game.spec.physicsDocument });
      dispatch({ type: "specChange", change: specChangeFrom(game.spec) });
    })();
  }, [persistedBuildTurn]);

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
            savedTitleRef.current = game.title;
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
  }, [publishGameIdentity]);

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
      ? applyPlatformerObjectEdits(
          current.map,
          current.source,
          history.present.platformerObjectEdits,
          history.present.platformerObjectRemovals,
          history.present.platformerObjectSettings,
        )
      : null,
    [
      current,
      history.present.platformerObjectEdits,
      history.present.platformerObjectRemovals,
      history.present.platformerObjectSettings,
    ],
  );

  if (!current || !currentMaze || !editableObjectMap) return null;
  const selectedObject = selectedObjectId
    ? editableObjectMap.objects.find((object) => object.id === selectedObjectId) ?? null
    : null;
  const selectedLevel = previewKind === "maze" ? currentMaze : current;
  const availableLevels = previewKind === "maze" ? availableMazes : campaignMaps;
  const selectedLevelIndex = availableLevels.findIndex(
    (level) => level.source === selectedLevel.source,
  );
  const changeLevel = (source: string) => {
    setSelectedObjectId(null);
    if (previewKind === "maze") {
      const selected = availableMazes.find((candidate) => candidate.source === source);
      if (selected) commit({ mazeMapSource: selected.source });
      return;
    }
    const selected = campaignMaps.find((candidate) => candidate.source === source);
    if (selected) commit({ platformerMapSource: selected.source });
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
  const editableMazeLevelState = () => {
    const source = history.present.mazeMapSource;
    const template = mazes.find((level) => level.source === source);
    if (!template) {
      return {
        source: source as MazeLevel["id"],
        levels: history.present.mazeLevels,
      };
    }
    const promoted: MazeLevel = {
      id: `custom-maze-${crypto.randomUUID()}`,
      templateSource: template.source as MazeLevel["templateSource"],
      label: `${template.label} 1`,
    };
    return {
      source: promoted.id,
      levels: [promoted, ...history.present.mazeLevels],
    };
  };
  const editablePlatformerLevelState = () => {
    const source = history.present.platformerMapSource;
    const template = maps.find((level) => level.source === source);
    if (!template) {
      return {
        source: source as PlatformerLevel["id"],
        levels: history.present.platformerLevels,
        platformerTerrainEdits: history.present.platformerTerrainEdits,
        platformerObjectEdits: history.present.platformerObjectEdits,
        platformerObjectRemovals: history.present.platformerObjectRemovals,
        platformerObjectSettings: history.present.platformerObjectSettings,
      };
    }
    const promoted: PlatformerLevel = {
      id: `custom-platformer-${crypto.randomUUID()}`,
      templateSource: template.source as PlatformerLevel["templateSource"],
      label: `${template.label} 1`,
    };
    const remap = <T extends { mapSource: GameDocument["platformerMapSource"] }>(
      entries: T[],
    ) => entries.map((entry) => entry.mapSource === source
      ? { ...entry, mapSource: promoted.id }
      : entry);
    return {
      source: promoted.id,
      levels: [promoted, ...history.present.platformerLevels],
      platformerTerrainEdits: remap(history.present.platformerTerrainEdits),
      platformerObjectEdits: remap(history.present.platformerObjectEdits),
      platformerObjectRemovals: remap(history.present.platformerObjectRemovals),
      platformerObjectSettings: remap(history.present.platformerObjectSettings),
    };
  };
  const createLevel = (templateSource: string, name: string) => {
    setSelectedObjectId(null);
    if (previewKind === "maze") {
      if (!MAZE_MAP_SOURCES.includes(templateSource as MazeLevel["templateSource"])) return;
      const source = templateSource as MazeLevel["templateSource"];
      const existing = editableMazeLevelState();
      const level: MazeLevel = {
        id: `custom-maze-${crypto.randomUUID()}`,
        templateSource: source,
        label: name,
      };
      commit({
        mazeLevels: [...existing.levels, level],
        mazeMapSource: level.id,
      });
      setPendingLevel(null);
      return;
    }
    if (!PLATFORMER_MAP_SOURCES.includes(templateSource as PlatformerLevel["templateSource"])) return;
    const source = templateSource as PlatformerLevel["templateSource"];
    const existing = editablePlatformerLevelState();
    const level: PlatformerLevel = {
      id: `custom-platformer-${crypto.randomUUID()}`,
      templateSource: source,
      label: name,
    };
    commit({
      platformerLevels: [...existing.levels, level],
      platformerMapSource: level.id,
      platformerTerrainEdits: existing.platformerTerrainEdits,
      platformerObjectEdits: existing.platformerObjectEdits,
      platformerObjectRemovals: existing.platformerObjectRemovals,
      platformerObjectSettings: existing.platformerObjectSettings,
    });
    setPendingLevel(null);
  };
  const renameSelectedLevel = () => {
    const name = levelSettingsInputRef.current?.value.trim() ?? "";
    if (!name) return;
    if (previewKind === "maze") {
      const editable = editableMazeLevelState();
      commit({
        mazeLevels: editable.levels.map((level) => level.id === editable.source
          ? { ...level, label: name }
          : level),
        mazeMapSource: editable.source,
      });
    } else {
      const editable = editablePlatformerLevelState();
      commit({
        platformerLevels: editable.levels.map((level) => level.id === editable.source
          ? { ...level, label: name }
          : level),
        platformerMapSource: editable.source,
        platformerTerrainEdits: editable.platformerTerrainEdits,
        platformerObjectEdits: editable.platformerObjectEdits,
        platformerObjectRemovals: editable.platformerObjectRemovals,
        platformerObjectSettings: editable.platformerObjectSettings,
      });
    }
    setLevelSettingsOpen(false);
  };
  const deleteSelectedLevel = () => {
    if (availableLevels.length <= 1) return;
    setSelectedObjectId(null);
    if (previewKind === "maze") {
      const editable = editableMazeLevelState();
      const index = editable.levels.findIndex((level) => level.id === editable.source);
      const levels = editable.levels.filter((level) => level.id !== editable.source);
      const next = levels[Math.min(index, levels.length - 1)];
      if (next) commit({ mazeLevels: levels, mazeMapSource: next.id });
    } else {
      const editable = editablePlatformerLevelState();
      const index = editable.levels.findIndex((level) => level.id === editable.source);
      const levels = editable.levels.filter((level) => level.id !== editable.source);
      const next = levels[Math.min(index, levels.length - 1)];
      if (next) {
        commit({
          platformerLevels: levels,
          platformerMapSource: next.id,
          platformerTerrainEdits: editable.platformerTerrainEdits.filter(
            (edit) => edit.mapSource !== editable.source,
          ),
          platformerObjectEdits: editable.platformerObjectEdits.filter(
            (edit) => edit.mapSource !== editable.source,
          ),
          platformerObjectRemovals: editable.platformerObjectRemovals.filter(
            (removal) => removal.mapSource !== editable.source,
          ),
          platformerObjectSettings: editable.platformerObjectSettings.filter(
            (settings) => settings.mapSource !== editable.source,
          ),
        });
      }
    }
    setLevelSettingsOpen(false);
  };
  const moveSelectedLevel = (offset: -1 | 1) => {
    if (previewKind === "maze") {
      const editable = editableMazeLevelState();
      const index = editable.levels.findIndex((level) => level.id === editable.source);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= editable.levels.length) return;
      const levels = [...editable.levels];
      [levels[index], levels[target]] = [levels[target], levels[index]];
      commit({ mazeLevels: levels, mazeMapSource: editable.source });
      return;
    }
    const editable = editablePlatformerLevelState();
    const index = editable.levels.findIndex((level) => level.id === editable.source);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= editable.levels.length) return;
    const levels = [...editable.levels];
    [levels[index], levels[target]] = [levels[target], levels[index]];
    commit({
      platformerLevels: levels,
      platformerMapSource: editable.source,
      platformerTerrainEdits: editable.platformerTerrainEdits,
      platformerObjectEdits: editable.platformerObjectEdits,
      platformerObjectRemovals: editable.platformerObjectRemovals,
      platformerObjectSettings: editable.platformerObjectSettings,
    });
  };
  const applyTerrainStroke = (stroke: readonly PlatformerTerrainStrokeCell[]) => {
    const platformerTerrainEdits = mergePlatformerTerrainEdits(
      history.present.platformerTerrainEdits,
      current.source,
      current.map,
      stroke,
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
      if (
        selectedObject &&
        stroke.some((cell) => (
          cell.kind === "empty" &&
          cell.x === Math.floor(selectedObject.x) &&
          cell.y === Math.floor(selectedObject.y)
        ))
      ) setSelectedObjectId(null);
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
  const applyObjectPlacement = (placement: PlatformerObjectPlacement) => {
    const platformerObjectEdits = mergePlatformerObjectEdit(
      history.present.platformerObjectEdits,
      current.source,
      current.map,
      placement,
    );
    commit({ platformerObjectEdits });
    setSelectedObjectId(placement.id);
  };
  const changeSelectedObjectSettings = (change: PlatformerObjectSettingsChange) => {
    if (!selectedObjectId) return;
    commit({
      platformerObjectSettings: upsertPlatformerObjectSettings(
        history.present.platformerObjectSettings,
        current.source,
        selectedObjectId,
        change,
      ),
    });
  };
  const currentTerrainEditCount = history.present.platformerTerrainEdits.filter(
    (edit) => edit.mapSource === current.source,
  ).length;
  const currentObjectEditCount =
    history.present.platformerObjectEdits.filter(
      (edit) => edit.mapSource === current.source,
    ).length +
    history.present.platformerObjectRemovals.filter(
      (removal) => removal.mapSource === current.source,
    ).length;

  return (
    <>
      <header className={styles.previewHeading}>
        <div className={styles.previewActions}>
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
        platformerEditor={{
          tool: activeTool,
          onToolChange: setActiveTool,
          onTerrainStroke: applyTerrainStroke,
          onObjectPlace: applyObjectPlacement,
          selectedObjectId,
          onObjectSelect: setSelectedObjectId,
        }}
      />

      <BuildTools
        activeTool={activeTool}
        backgroundId={current.map.presentation.backgroundId}
        disabled={previewKind !== "platformer"}
        objectEditCount={currentObjectEditCount}
        terrainEditCount={currentTerrainEditCount}
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
              onClick={() => moveSelectedLevel(-1)}
            >
              ← Move backward
            </button>
            <button
              type="button"
              disabled={selectedLevelIndex < 0 || selectedLevelIndex >= availableLevels.length - 1}
              onClick={() => moveSelectedLevel(1)}
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
          onClose={() => setSelectedObjectId(null)}
        />
      ) : null}
    </>
  );
}
