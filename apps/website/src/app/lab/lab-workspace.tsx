"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { authClient } from "@/lib/auth-client";
import type { SavedGameSummaryDto } from "@/lib/game-contract";
import type { MediaAssetDto } from "@/lib/media-types";

import {
  clearLabWorkspaceCache,
  readLabWorkspaceCache,
  type LabWorkspaceSnapshot,
  writeLabWorkspaceCache,
} from "./lab-workspace-cache";
import {
  clearLabWorkspaceMemory,
  readLabWorkspaceMemory,
  writeLabWorkspaceMemory,
} from "./lab-workspace-memory";

export type LabWorkspace = {
  workspaceId: string;
  hasLabKey: boolean;
  keyVersion: number;
};

type LabWorkspaceData = {
  workspace: LabWorkspace;
  games: SavedGameSummaryDto[];
  media: MediaAssetDto[];
};

type LabWorkspaceContextValue = {
  workspace: LabWorkspace | null;
  games: SavedGameSummaryDto[] | null;
  media: MediaAssetDto[] | null;
  initializing: boolean;
  refreshing: boolean;
  error: string;
  ensureReady: () => Promise<boolean>;
  refresh: () => Promise<void>;
  patchGames: (
    updater: (current: SavedGameSummaryDto[] | null) => SavedGameSummaryDto[] | null,
  ) => void;
  patchMedia: (
    updater: (current: MediaAssetDto[] | null) => MediaAssetDto[] | null,
  ) => void;
  patchWorkspace: (
    updater: (current: LabWorkspace | null) => LabWorkspace | null,
  ) => void;
  setError: (message: string) => void;
};

const LabWorkspaceContext = createContext<LabWorkspaceContextValue | null>(null);

let resetLabWorkspaceState: (() => void) | null = null;
let prefetchLabWorkspaceRef: (() => Promise<void>) | null = null;

function getErrorMessage(payload: unknown, fallback: string) {
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

async function fetchLabWorkspaceData(): Promise<LabWorkspaceData> {
  const [workspaceResponse, gamesResponse, mediaResponse] = await Promise.all([
    fetch("/api/auth/lab-workspace", { cache: "no-store" }),
    fetch("/api/games", { cache: "no-store" }),
    fetch("/api/media", { cache: "no-store" }),
  ]);
  const [workspacePayload, gamesPayload, mediaPayload]: [
    unknown,
    unknown,
    unknown,
  ] = await Promise.all([
    workspaceResponse.json().catch(() => null),
    gamesResponse.json().catch(() => null),
    mediaResponse.json().catch(() => null),
  ]);

  if (!workspaceResponse.ok) {
    throw new Error(
      getErrorMessage(workspacePayload, "We couldn't load your Lab Workspace."),
    );
  }

  if (!gamesResponse.ok) {
    throw new Error(getErrorMessage(gamesPayload, "We couldn't load your games."));
  }

  const media = mediaResponse.ok
    ? (mediaPayload as { media: MediaAssetDto[] }).media
    : [];

  return {
    workspace: workspacePayload as LabWorkspace,
    games: (gamesPayload as { games: SavedGameSummaryDto[] }).games,
    media,
  };
}

function snapshotFromData(data: LabWorkspaceData): LabWorkspaceSnapshot {
  return {
    workspaceId: data.workspace.workspaceId,
    hasLabKey: data.workspace.hasLabKey,
    keyVersion: data.workspace.keyVersion,
    games: data.games,
    media: data.media,
  };
}

function snapshotToState(snapshot: LabWorkspaceSnapshot) {
  return {
    workspace: {
      workspaceId: snapshot.workspaceId,
      hasLabKey: snapshot.hasLabKey,
      keyVersion: snapshot.keyVersion,
    },
    games: snapshot.games,
    media: snapshot.media,
  };
}

export function resetLabWorkspaceStore() {
  clearLabWorkspaceCache();
  clearLabWorkspaceMemory();
  resetLabWorkspaceState?.();
}

export function prefetchLabWorkspace() {
  void prefetchLabWorkspaceRef?.();
}

export function LabWorkspaceProvider({ children }: { children: ReactNode }) {
  const initialSnapshot = readLabWorkspaceMemory();
  const initialState = initialSnapshot ? snapshotToState(initialSnapshot) : null;

  const [workspace, setWorkspace] = useState<LabWorkspace | null>(
    initialState?.workspace ?? null,
  );
  const [games, setGames] = useState<SavedGameSummaryDto[] | null>(
    initialState?.games ?? null,
  );
  const [media, setMedia] = useState<MediaAssetDto[] | null>(
    initialState?.media ?? null,
  );
  const [initializing, setInitializing] = useState(!initialState);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const hasCachedDataRef = useRef(Boolean(initialState));
  const hydratedFromStorageRef = useRef(false);

  const persistSnapshot = useCallback((snapshot: LabWorkspaceSnapshot) => {
    writeLabWorkspaceMemory(snapshot);
    writeLabWorkspaceCache(snapshot);
    hasCachedDataRef.current = true;
  }, []);

  const applyData = useCallback(
    (data: LabWorkspaceData) => {
      const snapshot = snapshotFromData(data);
      setWorkspace(data.workspace);
      setGames(data.games);
      setMedia(data.media);
      persistSnapshot(snapshot);
    },
    [persistSnapshot],
  );

  const refresh = useCallback(async () => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const promise = (async () => {
      const showRefreshIndicator = hasCachedDataRef.current;
      if (showRefreshIndicator) {
        setRefreshing(true);
      }

      try {
        const data = await fetchLabWorkspaceData();
        applyData(data);
        setError("");
      } catch (caught) {
        if (!hasCachedDataRef.current) {
          setGames([]);
          setMedia([]);
        }

        setError(
          caught instanceof Error
            ? caught.message
            : "We couldn't open your Lab Workspace.",
        );
      } finally {
        setInitializing(false);
        setRefreshing(false);
        refreshPromiseRef.current = null;
      }
    })();

    refreshPromiseRef.current = promise;
    return promise;
  }, [applyData]);

  const ensureSession = useCallback(async () => {
    try {
      const current = await authClient.getSession();

      if (!current.data) {
        const created = await authClient.signIn.anonymous();

        if (created.error) {
          throw new Error(created.error.message);
        }
      }

      return true;
    } catch (caught) {
      setGames([]);
      setMedia([]);
      setInitializing(false);
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn't open your Lab Workspace.",
      );
      return false;
    }
  }, []);

  const ensureReady = useCallback(async () => {
    const sessionReady = await ensureSession();
    if (!sessionReady) {
      return false;
    }

    if (hasCachedDataRef.current) {
      void refresh();
      return true;
    }

    await refresh();
    return true;
  }, [ensureSession, refresh]);

  const patchGames = useCallback(
    (
      updater: (current: SavedGameSummaryDto[] | null) => SavedGameSummaryDto[] | null,
    ) => {
      setGames((current) => {
        const next = updater(current);
        if (workspace && next) {
          persistSnapshot({
            workspaceId: workspace.workspaceId,
            hasLabKey: workspace.hasLabKey,
            keyVersion: workspace.keyVersion,
            games: next,
            media: media ?? [],
          });
        }
        return next;
      });
    },
    [media, persistSnapshot, workspace],
  );

  const patchMedia = useCallback(
    (updater: (current: MediaAssetDto[] | null) => MediaAssetDto[] | null) => {
      setMedia((current) => {
        const next = updater(current);
        if (workspace && next) {
          persistSnapshot({
            workspaceId: workspace.workspaceId,
            hasLabKey: workspace.hasLabKey,
            keyVersion: workspace.keyVersion,
            games: games ?? [],
            media: next,
          });
        }
        return next;
      });
    },
    [games, persistSnapshot, workspace],
  );

  const patchWorkspace = useCallback(
    (updater: (current: LabWorkspace | null) => LabWorkspace | null) => {
      setWorkspace((current) => {
        const next = updater(current);
        if (next) {
          persistSnapshot({
            workspaceId: next.workspaceId,
            hasLabKey: next.hasLabKey,
            keyVersion: next.keyVersion,
            games: games ?? [],
            media: media ?? [],
          });
        }
        return next;
      });
    },
    [games, media, persistSnapshot],
  );

  useLayoutEffect(() => {
    if (hydratedFromStorageRef.current) {
      return;
    }

    hydratedFromStorageRef.current = true;

    if (hasCachedDataRef.current) {
      return;
    }

    const cachedSnapshot = readLabWorkspaceCache();
    if (!cachedSnapshot) {
      return;
    }

    const cachedState = snapshotToState(cachedSnapshot);
    setWorkspace(cachedState.workspace);
    setGames(cachedState.games);
    setMedia(cachedState.media);
    writeLabWorkspaceMemory(cachedSnapshot);
    hasCachedDataRef.current = true;
    setInitializing(false);
  }, []);

  useEffect(() => {
    resetLabWorkspaceState = () => {
      clearLabWorkspaceMemory();
      setWorkspace(null);
      setGames(null);
      setMedia(null);
      setInitializing(true);
      setRefreshing(false);
      setError("");
      hasCachedDataRef.current = false;
      hydratedFromStorageRef.current = false;
      refreshPromiseRef.current = null;
    };

    prefetchLabWorkspaceRef = refresh;

    void authClient.getSession().then((current) => {
      if (current.data) {
        void refresh();
      }
    });

    return () => {
      resetLabWorkspaceState = null;
      prefetchLabWorkspaceRef = null;
    };
  }, [refresh]);

  return (
    <LabWorkspaceContext.Provider
      value={{
        workspace,
        games,
        media,
        initializing,
        refreshing,
        error,
        ensureReady,
        refresh,
        patchGames,
        patchMedia,
        patchWorkspace,
        setError,
      }}
    >
      {children}
    </LabWorkspaceContext.Provider>
  );
}

export function useLabWorkspace() {
  const context = useContext(LabWorkspaceContext);

  if (!context) {
    throw new Error("useLabWorkspace must be used inside LabWorkspaceProvider.");
  }

  return context;
}
