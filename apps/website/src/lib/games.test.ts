import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_GAME_DOCUMENT } from "./game-contract";
import {
  createGame,
  deleteGame,
  getGame,
  getPlayableGame,
  getPublicGame,
  listGames,
  listPublicGames,
  memoryGames,
  saveGameThumbnail,
  updateGame,
} from "./games";

const TEST_THUMBNAIL = "data:image/webp;base64,UklGRg==";

test("game CRUD is owner-scoped and revision guarded", async () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const previousMemory = globalThis.splatLabGamesMemory;
  delete process.env.DATABASE_URL;
  globalThis.splatLabGamesMemory = [];

  try {
    const created = await createGame("owner-a", {
      title: "Green Hills Platformer",
      spec: DEFAULT_GAME_DOCUMENT,
    });

    assert.equal((await listGames("owner-a")).length, 1);
    assert.equal(await getGame("owner-b", created.id), null);
    assert.equal(await getPublicGame(created.id), null);
    assert.equal(await getPlayableGame(created.id), null);
    assert.equal((await getPlayableGame(created.id, "owner-a"))?.id, created.id);
    assert.equal(await getPlayableGame(created.id, "owner-b"), null);
    assert.equal(created.isPublic, false);
    assert.equal(created.thumbnailDataUrl, null);

    assert.equal(
      await saveGameThumbnail("owner-b", created.id, TEST_THUMBNAIL),
      false,
    );
    assert.equal(
      await saveGameThumbnail("owner-a", created.id, TEST_THUMBNAIL),
      true,
    );
    assert.equal(
      (await listGames("owner-a"))[0]?.thumbnailDataUrl,
      TEST_THUMBNAIL,
    );
    assert.equal(
      (await getGame("owner-a", created.id))?.thumbnailDataUrl,
      TEST_THUMBNAIL,
    );

    const mazeSpec = { ...DEFAULT_GAME_DOCUMENT, previewKind: "maze" as const };
    const updated = await updateGame("owner-a", created.id, {
      title: "Green Hills Maze",
      isPublic: true,
      spec: mazeSpec,
      expectedRevision: created.revision,
    });
    assert.equal(updated.status, "updated");
    if (updated.status !== "updated") return;
    assert.equal(updated.game.revision, 2);
    assert.equal(updated.game.mapSource, "maze_green_hills_01.json");
    assert.equal(updated.game.isPublic, true);
    assert.equal((await getPublicGame(created.id))?.id, created.id);

    const conflict = await updateGame("owner-a", created.id, {
      title: "Stale title",
      spec: DEFAULT_GAME_DOCUMENT,
      expectedRevision: created.revision,
    });
    assert.equal(conflict.status, "conflict");
    assert.equal(await deleteGame("owner-b", created.id), false);
    assert.equal(await deleteGame("owner-a", created.id), true);
    assert.equal(await getGame("owner-a", created.id), null);
    assert.equal(await getPublicGame(created.id), null);
  } finally {
    globalThis.splatLabGamesMemory = previousMemory;
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  }
});

test("public game payloads contain runtime state but never builder history", async () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const previousMemory = globalThis.splatLabGamesMemory;
  delete process.env.DATABASE_URL;
  globalThis.splatLabGamesMemory = [];

  try {
    const sentinel = "SENTINEL_CHILD_BUILDER_MESSAGE";
    const created = await createGame("owner-a", {
      title: "Safe Public Game",
      isPublic: true,
      spec: {
        ...DEFAULT_GAME_DOCUMENT,
        setupStep: "complete",
        builderSetupHistory: ["gameType", "theme"],
        builderChatHistory: [
          { role: "user", message: sentinel },
          { role: "cooper", message: "A private builder reply." },
        ],
      },
    });

    const publicGame = await getPublicGame(created.id);
    assert.ok(publicGame);
    assert.equal(publicGame.id, created.id);
    assert.equal("setupStep" in publicGame.spec, false);
    assert.equal("builderSetupHistory" in publicGame.spec, false);
    assert.equal("builderChatHistory" in publicGame.spec, false);
    assert.equal(JSON.stringify(publicGame).includes(sentinel), false);
  } finally {
    globalThis.splatLabGamesMemory = previousMemory;
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  }
});

test("public discovery lists only public games, newest first", async () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const previousMemory = globalThis.splatLabGamesMemory;
  delete process.env.DATABASE_URL;
  globalThis.splatLabGamesMemory = [];

  try {
    await createGame("owner-a", {
      title: "Private Workshop",
      spec: DEFAULT_GAME_DOCUMENT,
    });
    const older = await createGame("owner-a", {
      title: "Older Public Game",
      isPublic: true,
      spec: DEFAULT_GAME_DOCUMENT,
    });
    const newer = await createGame("owner-b", {
      title: "Newer Public Game",
      isPublic: true,
      spec: DEFAULT_GAME_DOCUMENT,
    });

    const stored = memoryGames();
    const olderRecord = stored.find((game) => game.id === older.id);
    const newerRecord = stored.find((game) => game.id === newer.id);
    if (!olderRecord || !newerRecord) throw new Error("Public games were not stored.");
    olderRecord.createdAt = new Date("2026-01-01T00:00:00.000Z");
    newerRecord.createdAt = new Date("2026-02-01T00:00:00.000Z");

    assert.deepEqual(
      (await listPublicGames()).map((game) => ({
        title: game.title,
        creator: game.creator,
      })),
      [
        {
          title: "Newer Public Game",
          creator: { displayName: "Lab Creator", avatarSrc: null },
        },
        {
          title: "Older Public Game",
          creator: { displayName: "Lab Creator", avatarSrc: null },
        },
      ],
    );
  } finally {
    globalThis.splatLabGamesMemory = previousMemory;
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  }
});
