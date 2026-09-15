import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import type { SavedGameSummaryDto } from "@/lib/game-contract";
import type { MediaAssetDto } from "@/lib/media-types";

import {
  clearLabWorkspaceCache,
  readLabWorkspaceCache,
  writeLabWorkspaceCache,
} from "./lab-workspace-cache";

function installSessionStorageMock() {
  const store = new Map<string, string>();
  const sessionStorage = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage },
  });
}

const sampleGame: SavedGameSummaryDto = {
  id: "game-1",
  title: "Test Game",
  gameType: "platformer",
  mapSource: "starter-platformer",
  isPublic: false,
  revision: 1,
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:00:00.000Z",
  thumbnailDataUrl: "data:image/webp;base64,UklGRg==",
};

const sampleMedia: MediaAssetDto = {
  id: "media-1",
  kind: "screenshot",
  url: "https://example.com/media.png",
  pathname: "users/owner/screenshots/media-1.png",
  contentType: "image/png",
  byteSize: 1024,
  createdAt: "2026-09-15T00:00:00.000Z",
  gameId: null,
  gameTitle: null,
};

describe("lab workspace cache", () => {
  beforeEach(() => {
    installSessionStorageMock();
  });

  afterEach(() => {
    clearLabWorkspaceCache();
    Reflect.deleteProperty(globalThis, "window");
  });

  it("returns null when no cache exists", () => {
    assert.equal(readLabWorkspaceCache(), null);
  });

  it("round-trips workspace games and media", () => {
    writeLabWorkspaceCache({
      workspaceId: "workspace-1",
      hasLabKey: true,
      keyVersion: 2,
      games: [sampleGame],
      media: [sampleMedia],
    });

    assert.deepEqual(readLabWorkspaceCache(), {
      workspaceId: "workspace-1",
      hasLabKey: true,
      keyVersion: 2,
      games: [{ ...sampleGame, thumbnailDataUrl: null }],
      media: [sampleMedia],
    });
  });

  it("clears stored cache", () => {
    writeLabWorkspaceCache({
      workspaceId: "workspace-1",
      hasLabKey: false,
      keyVersion: 1,
      games: [],
      media: [],
    });

    clearLabWorkspaceCache();
    assert.equal(readLabWorkspaceCache(), null);
  });
});
