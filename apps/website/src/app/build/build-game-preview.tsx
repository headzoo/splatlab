"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import {
  campaignMapIndex,
  GamePlayer,
  mazeMapIndex,
  type GamePlayerContentProps,
} from "@/game/game-player";
import {
  defaultGameTitle,
  DEFAULT_GAME_DOCUMENT,
  type GameDocument,
  type GamePreviewKind,
  type SavedGameDto,
} from "@/lib/game-contract";
import { buildGamePath } from "@/lib/game-routes";
import {
  createGameHistory,
  gameHistoryReducer,
  sameGameDocument,
} from "@/lib/game-history";

import { useBuildSetup } from "./build-setup";
import styles from "./build.module.css";

type BuildGamePreviewProps = GamePlayerContentProps & {
  initialGame: SavedGameDto | null;
};

type GameIdentity = {
  id: string;
  revision: number;
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
  const { requestedSetup } = useBuildSetup();
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
          | "playerCharacter"
          | "humanGender"
          | "skinTone"
          | "hairColor"
          | "setupStep"
          | "builderSetupHistory"
          | "builderChatHistory"
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
          setSaveStatus("error");
          setSaveError(errorMessage(payload, "We couldn't save your game."));
          return;
        }

        const savedGame = (payload as { game: SavedGameDto }).game;
        const nextIdentity = { id: savedGame.id, revision: savedGame.revision };
        identityRef.current = nextIdentity;
        savedSpecRef.current = spec;

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
  }, []);

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

  const { previewKind } = history.present;
  const currentMapIndex = campaignMapIndex(history.present, maps);
  const current = maps[currentMapIndex];
  const currentMaze = mazes[mazeMapIndex(history.present, mazes)];

  if (!current || !currentMaze) return null;
  const currentSource = previewKind === "maze" ? currentMaze.source : current.source;
  const changePreview = (kind: GamePreviewKind) => commit({ previewKind: kind });
  const selectedLevel = previewKind === "maze" ? currentMaze : current;

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
          <div className={styles.previewControls} aria-label="Preview game type">
            <label className={styles.levelSelect}>
              <span>Level</span>
              <select
                key={selectedLevel.source}
                aria-label="Select level"
                defaultValue={selectedLevel.source}
              >
                <option value={selectedLevel.source}>{selectedLevel.label}</option>
              </select>
            </label>
            <button
              type="button"
              aria-pressed={previewKind === "platformer"}
              onClick={() => changePreview("platformer")}
            >
              Platformer
            </button>
            <button
              type="button"
              aria-pressed={previewKind === "maze"}
              onClick={() => changePreview("maze")}
            >
              Maze
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
      />
    </>
  );
}
