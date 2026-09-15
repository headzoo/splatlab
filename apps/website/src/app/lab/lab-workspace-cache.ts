import type { SavedGameSummaryDto } from "@/lib/game-contract";
import type { MediaAssetDto } from "@/lib/media-types";

export type LabWorkspaceSnapshot = {
  workspaceId: string;
  hasLabKey: boolean;
  keyVersion: number;
  games: SavedGameSummaryDto[];
  media: MediaAssetDto[];
};

const STORAGE_KEY = "splat-lab-workspace-v2";

type StoredLabWorkspaceCache = {
  workspaceId: string;
  hasLabKey: boolean;
  keyVersion: number;
  games: SavedGameSummaryDto[];
  media: MediaAssetDto[];
  cachedAt: number;
};

function toStoredSnapshot(snapshot: LabWorkspaceSnapshot): StoredLabWorkspaceCache {
  return {
    workspaceId: snapshot.workspaceId,
    hasLabKey: snapshot.hasLabKey,
    keyVersion: snapshot.keyVersion,
    games: snapshot.games.map((game) => ({
      ...game,
      thumbnailDataUrl: null,
    })),
    media: snapshot.media,
    cachedAt: Date.now(),
  };
}

export function readLabWorkspaceCache(): LabWorkspaceSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as StoredLabWorkspaceCache;
    if (
      !parsed ||
      typeof parsed.workspaceId !== "string" ||
      typeof parsed.hasLabKey !== "boolean" ||
      typeof parsed.keyVersion !== "number" ||
      !Array.isArray(parsed.games) ||
      !Array.isArray(parsed.media)
    ) {
      return null;
    }

    return {
      workspaceId: parsed.workspaceId,
      hasLabKey: parsed.hasLabKey,
      keyVersion: parsed.keyVersion,
      games: parsed.games,
      media: parsed.media,
    };
  } catch {
    return null;
  }
}

export function writeLabWorkspaceCache(snapshot: LabWorkspaceSnapshot) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(toStoredSnapshot(snapshot)),
    );
  } catch {
    // Ignore quota or privacy-mode storage failures.
  }
}

export function clearLabWorkspaceCache() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
    window.sessionStorage.removeItem("splat-lab-workspace-v1");
  } catch {
    // Ignore storage failures.
  }
}
