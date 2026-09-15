import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { MAX_SCREENSHOTS_PER_USER, SCREENSHOT_MAX_BYTES } from "./blob-path";
import { DEFAULT_GAME_DOCUMENT } from "./game-contract";
import { createGame, memoryGames } from "./games";
import {
  deleteMedia,
  getPublicMedia,
  listMedia,
  memoryMedia,
  saveScreenshotUpload,
  type ScreenshotStorage,
} from "./media";

function screenshotFile(contents = "png") {
  return new File([contents], "screenshot.png", { type: "image/png" });
}

const OWNERSHIP_MIGRATION = readFileSync(
  new URL(
    "../../prisma/migrations/20260915140000_enforce_media_game_ownership/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

function recordingStorage(options?: { failUpload?: boolean }) {
  const uploads: string[] = [];
  const deletions: string[] = [];
  const storage: ScreenshotStorage = {
    async put(input) {
      uploads.push(input.pathname);
      assert.equal(input.addRandomSuffix, false);
      assert.equal(input.allowOverwrite, false);
      if (options?.failUpload) throw new Error("simulated upload failure");
      return {
        url: `https://abc.public.blob.vercel-storage.com/${input.pathname}`,
        pathname: input.pathname,
        contentType: input.contentType,
      };
    },
    async delete(_ownerId, pathname) {
      deletions.push(pathname);
      return true;
    },
  };
  return { storage, uploads, deletions };
}

function withoutDatabase(run: () => Promise<void>) {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const previousGames = globalThis.splatLabGamesMemory;
  delete process.env.DATABASE_URL;
  globalThis.splatLabGamesMemory = [];
  memoryMedia().splice(0, memoryMedia().length);

  return run().finally(() => {
    memoryMedia().splice(0, memoryMedia().length);
    globalThis.splatLabGamesMemory = previousGames;
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });
}

test("the server-owned screenshot workflow stores owner-scoped media", () =>
  withoutDatabase(async () => {
    const fake = recordingStorage();
    const game = await createGame("media-owner-a", {
      title: "Green Hills Platformer",
      spec: DEFAULT_GAME_DOCUMENT,
    });
    const created = await saveScreenshotUpload(
      "media-owner-a",
      screenshotFile(),
      game.id,
      fake.storage,
    );

    assert.equal(created.status, "created");
    if (created.status !== "created") return;

    assert.equal(fake.uploads.length, 1);
    assert.equal(created.media.byteSize, screenshotFile().size);
    assert.equal(created.media.gameTitle, "Green Hills Platformer");
    assert.equal((await listMedia("media-owner-a")).length, 1);
    assert.equal((await listMedia("media-owner-b")).length, 0);
    assert.deepEqual(await getPublicMedia(created.media.id), {
      id: created.media.id,
      url: created.media.url,
      createdAt: created.media.createdAt,
      gameId: null,
      gameTitle: null,
    });
    assert.equal(await deleteMedia("media-owner-b", created.media.id), false);
    assert.equal(await deleteMedia("media-owner-a", created.media.id), true);
    assert.equal((await listMedia("media-owner-a")).length, 0);
  }));

test("public media only links to public games", () =>
  withoutDatabase(async () => {
    const privateGame = await createGame("media-owner-a", {
      title: "Private Workshop",
      spec: DEFAULT_GAME_DOCUMENT,
    });
    const publicGame = await createGame("media-owner-a", {
      title: "Public Adventure",
      isPublic: true,
      spec: DEFAULT_GAME_DOCUMENT,
    });
    const fake = recordingStorage();
    const privateScreenshot = await saveScreenshotUpload(
      "media-owner-a",
      screenshotFile("private"),
      privateGame.id,
      fake.storage,
    );
    const publicScreenshot = await saveScreenshotUpload(
      "media-owner-a",
      screenshotFile("public"),
      publicGame.id,
      fake.storage,
    );

    assert.equal(privateScreenshot.status, "created");
    assert.equal(publicScreenshot.status, "created");
    if (
      privateScreenshot.status !== "created" ||
      publicScreenshot.status !== "created"
    ) {
      return;
    }

    const privateMedia = await getPublicMedia(privateScreenshot.media.id);
    const publicMedia = await getPublicMedia(publicScreenshot.media.id);
    assert.equal(privateMedia?.gameId, null);
    assert.equal(privateMedia?.gameTitle, null);
    assert.equal(publicMedia?.gameId, publicGame.id);
    assert.equal(publicMedia?.gameTitle, publicGame.title);
    assert.equal(memoryGames().length, 2);
  }));

test("cross-owner game associations are rejected before reservation and upload", () =>
  withoutDatabase(async () => {
    const fake = recordingStorage();
    const victimGame = await createGame("victim-owner", {
      title: "Victim Game",
      spec: DEFAULT_GAME_DOCUMENT,
    });

    const result = await saveScreenshotUpload(
      "attacker-owner",
      screenshotFile(),
      victimGame.id,
      fake.storage,
    );

    assert.equal(result.status, "invalid");
    assert.equal(fake.uploads.length, 0);
    assert.equal(memoryMedia().length, 0);
  }));

test("the Prisma migration enforces same-owner media and game pairs", () => {
  assert.match(
    OWNERSHIP_MIGRATION,
    /FOREIGN KEY \("game_id", "game_owner_id"\)/,
  );
  assert.match(
    OWNERSHIP_MIGRATION,
    /REFERENCES "game"\("id", "owner_id"\)/,
  );
  assert.match(
    OWNERSHIP_MIGRATION,
    /"game_owner_id" IS NOT NULL/,
  );
  assert.match(
    OWNERSHIP_MIGRATION,
    /"game_owner_id" = "owner_id"/,
  );
  assert.match(
    OWNERSHIP_MIGRATION,
    /SET "game_id" = NULL[\s\S]+"game"\."owner_id" = media\."owner_id"/,
  );
});

test("invalid files are rejected before blob upload", () =>
  withoutDatabase(async () => {
    const fake = recordingStorage();

    const wrongType = await saveScreenshotUpload(
      "media-owner-a",
      new File(["not png"], "screenshot.jpg", { type: "image/jpeg" }),
      null,
      fake.storage,
    );
    const empty = await saveScreenshotUpload(
      "media-owner-a",
      new File([], "screenshot.png", { type: "image/png" }),
      null,
      fake.storage,
    );
    const tooLarge = await saveScreenshotUpload(
      "media-owner-a",
      new Blob([new Uint8Array(SCREENSHOT_MAX_BYTES + 1)], {
        type: "image/png",
      }),
      null,
      fake.storage,
    );
    assert.equal(wrongType.status, "invalid");
    assert.equal(empty.status, "invalid");
    assert.equal(tooLarge.status, "invalid");
    assert.equal(fake.uploads.length, 0);
  }));

test("failed blob uploads delete the deterministic object and release quota", () =>
  withoutDatabase(async () => {
    const failing = recordingStorage({ failUpload: true });

    await assert.rejects(
      saveScreenshotUpload(
        "media-owner-a",
        screenshotFile(),
        null,
        failing.storage,
      ),
      /simulated upload failure/,
    );

    assert.equal(failing.uploads.length, 1);
    assert.deepEqual(failing.deletions, failing.uploads);
    assert.equal(memoryMedia().length, 0);

    const succeeding = recordingStorage();
    const retried = await saveScreenshotUpload(
      "media-owner-a",
      screenshotFile(),
      null,
      succeeding.storage,
    );
    assert.equal(retried.status, "created");
  }));

test("pending reservations consume quota and remain invisible until finalized", () =>
  withoutDatabase(async () => {
    const pending = new Map<
      string,
      (uploaded: {
        url: string;
        pathname: string;
        contentType: string;
      }) => void
    >();
    const storage: ScreenshotStorage = {
      put(input) {
        return new Promise((resolve) => {
          pending.set(input.pathname, resolve);
        });
      },
      async delete() {
        return true;
      },
    };

    const attempts = Array.from(
      { length: MAX_SCREENSHOTS_PER_USER + 1 },
      () =>
        saveScreenshotUpload(
          "media-owner-a",
          screenshotFile(),
          null,
          storage,
        ),
    );

    while (pending.size < MAX_SCREENSHOTS_PER_USER) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    assert.equal((await attempts.at(-1))?.status, "limit");
    assert.equal((await listMedia("media-owner-a")).length, 0);

    for (const [pathname, resolve] of pending) {
      resolve({
        url: `https://abc.public.blob.vercel-storage.com/${pathname}`,
        pathname,
        contentType: "image/png",
      });
    }

    const results = await Promise.all(attempts);
    assert.equal(
      results.filter((result) => result.status === "created").length,
      MAX_SCREENSHOTS_PER_USER,
    );
    assert.equal(
      results.filter((result) => result.status === "limit").length,
      1,
    );
    assert.equal(
      (await listMedia("media-owner-a")).length,
      MAX_SCREENSHOTS_PER_USER,
    );
  }));
