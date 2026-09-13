"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import {
  campaignMapIndex,
  GamePlayer,
  mazeMapIndex,
  type GamePlayerContentProps,
} from "@/game/game-player";
import { gameCampaignMaps, gameMazeMaps } from "@/game/game-levels";
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
  defaultGameTitle,
  DEFAULT_GAME_DOCUMENT,
  MAZE_MAP_SOURCES,
  PLATFORMER_MAP_SOURCES,
  type GameDocument,
  type MazeLevel,
  type PlatformerLevel,
  type SavedGameDto,
} from "@/lib/game-contract";
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

export function BuildGamePreview({
  maps,
  mazes,
  physics,
  weapon,
  initialGame,
}: BuildGamePreviewProps) {
  const {
    requestedSetup,
    persistedBuildTurn,
    publishGameIdentity,
  } = useBuildSetup();
  const initialSpec = initialGame?.spec ?? DEFAULT_GAME_DOCUMENT;
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
  const [saveStatus, setSaveStatus] = useState<"saving" | "saved" | "error">(
    initialGame ? "saved" : "saving",
  );
  const [saveError, setSaveError] = useState("");
  const [activeTool, setActiveTool] = useState<PlatformerEditTool>("select");
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [levelDialogOpen, setLevelDialogOpen] = useState(false);
  const levelDialogRef = useRef<HTMLDialogElement>(null);
  const latestSpecRef = useRef(history.present);
  const savedSpecRef = useRef<GameDocument | null>(initialGame?.spec ?? null);
  const savePromiseRef = useRef<Promise<void> | null>(null);
  const appliedSetupRevisionRef = useRef(0);
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
    if (
      !requestedSetup ||
      requestedSetup.revision <= appliedSetupRevisionRef.current
    ) {
      return;
    }

    appliedSetupRevisionRef.current = requestedSetup.revision;
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
    };

    identityRef.current = { ...identity, revision: persistedBuildTurn.revision };
    savedSpecRef.current = fallbackServerSpec;
    latestSpecRef.current = reconcilePersistedGame(
      fallbackServerSpec,
      savedSpec,
      latestSpecRef.current,
    );
    dispatch({ type: "chat", turns: fallbackServerSpec.builderChatHistory });

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
      latestSpecRef.current = reconciled;
      dispatch({ type: "chat", turns: game.spec.builderChatHistory });
    })();
  }, [persistedBuildTurn]);

  const persistLatest = useCallback(() => {
    if (savePromiseRef.current) return savePromiseRef.current;

    const savePromise = (async () => {
      while (true) {
        const spec = latestSpecRef.current;
        const identity = identityRef.current;

        if (
          identity &&
          savedSpecRef.current &&
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
                    title: defaultGameTitle(spec),
                    spec,
                    expectedRevision: identity.revision,
                  }
                : { title: defaultGameTitle(spec), spec },
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
        publishGameIdentity(nextIdentity);

        if (!identity && window.location.pathname === "/build") {
          window.history.replaceState(
            window.history.state,
            "",
            buildGamePath(savedGame.id),
          );
        }

        if (sameGameDocument(latestSpecRef.current, spec)) {
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
    if (identityRef.current) publishGameIdentity(identityRef.current);
  }, [publishGameIdentity]);

  useEffect(() => {
    latestSpecRef.current = history.present;
    const alreadySaved =
      identityRef.current &&
      savedSpecRef.current &&
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
    if (levelDialogOpen && !dialog.open) dialog.showModal();
    if (!levelDialogOpen && dialog.open) dialog.close();
  }, [levelDialogOpen]);

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
  const currentSource = previewKind === "maze" ? currentMaze.source : current.source;
  const selectedLevel = previewKind === "maze" ? currentMaze : current;
  const availableLevels = previewKind === "maze" ? availableMazes : campaignMaps;
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
  const createLevel = (templateSource: string, templateLabel: string) => {
    setSelectedObjectId(null);
    if (previewKind === "maze") {
      if (!MAZE_MAP_SOURCES.includes(templateSource as MazeLevel["templateSource"])) return;
      const source = templateSource as MazeLevel["templateSource"];
      const matchingLevels = availableMazes.filter((level) => (
        level.source === source || history.present.mazeLevels.some(
          (savedLevel) => savedLevel.id === level.source && savedLevel.templateSource === source,
        )
      ));
      const level: MazeLevel = {
        id: `custom-maze-${crypto.randomUUID()}`,
        templateSource: source,
        label: `${templateLabel} ${matchingLevels.length + 1}`,
      };
      commit({
        mazeLevels: [...history.present.mazeLevels, level],
        mazeMapSource: level.id,
      });
      setLevelDialogOpen(false);
      return;
    }
    if (!PLATFORMER_MAP_SOURCES.includes(templateSource as PlatformerLevel["templateSource"])) return;
    const source = templateSource as PlatformerLevel["templateSource"];
    const matchingLevels = campaignMaps.filter((level) => (
      level.source === source || history.present.platformerLevels.some(
        (savedLevel) => savedLevel.id === level.source && savedLevel.templateSource === source,
      )
    ));
    const level: PlatformerLevel = {
      id: `custom-platformer-${crypto.randomUUID()}`,
      templateSource: source,
      label: `${templateLabel} ${matchingLevels.length + 1}`,
    };
    commit({
      platformerLevels: [...history.present.platformerLevels, level],
      platformerMapSource: level.id,
    });
    setLevelDialogOpen(false);
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
        <div className={styles.previewTitle}>
          <span aria-hidden="true">{previewKind === "maze" ? "▦" : "🎮"}</span>
          <h2 id="preview-title">Game Preview</h2>
          <b>LIVE</b>
        </div>
        <div className={styles.saveSummary}>
          <p data-current-map={currentSource}>Playing maps/{currentSource}</p>
          <span
            className={saveStatus === "error" ? styles.saveError : undefined}
            role={saveStatus === "error" ? "alert" : "status"}
          >
            {saveStatus === "saving"
              ? "Saving…"
              : saveStatus === "saved"
                ? "Saved"
                : saveError}
          </span>
        </div>
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
              onClick={() => setLevelDialogOpen(true)}
            >
              +
            </button>
          </div>
        )}
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
        onClose={() => setLevelDialogOpen(false)}
        onCancel={() => setLevelDialogOpen(false)}
      >
        <header>
          <div>
            <span>Add a level</span>
            <h2 id="add-level-title">Choose a world</h2>
          </div>
          <button
            type="button"
            aria-label="Close add level"
            onClick={() => setLevelDialogOpen(false)}
          >
            ×
          </button>
        </header>
        <div className={styles.levelThemeGrid}>
          {(previewKind === "maze" ? mazes : maps).map((level) => (
            <button
              type="button"
              key={level.source}
              onClick={() => createLevel(level.source, level.label)}
            >
              <span aria-hidden="true">{WORLD_ICONS[level.source] ?? "🗺️"}</span>
              <strong>{level.label}</strong>
            </button>
          ))}
        </div>
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
