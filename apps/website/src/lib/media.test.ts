import assert from "node:assert/strict";
import test from "node:test";

import { MAX_SCREENSHOTS_PER_USER } from "./blob-path";
import { DEFAULT_GAME_DOCUMENT } from "./game-contract";
import { createGame } from "./games";
import {
  createScreenshot,
  deleteMedia,
  getPublicMedia,
  listMedia,
  memoryMedia,
} from "./media";

function blobShot(ownerId: string, name: string, gameId?: string) {
  const pathname = `users/${ownerId}/screenshots/${name}.png`;
  return {
    url: `https://abc.public.blob.vercel-storage.com/${pathname}`,
    pathname,
    contentType: "image/png" as const,
    byteSize: 1200,
    gameId,
  };
}

test("screenshots are owner-scoped, capped, and publicly readable by id", async () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  memoryMedia().splice(0, memoryMedia().length);

  try {
    const game = await createGame("media-owner-a", {
      title: "Green Hills Platformer",
      spec: DEFAULT_GAME_DOCUMENT,
    });
    const created = await createScreenshot(
      "media-owner-a",
      blobShot("media-owner-a", "one", game.id),
    );
    assert.equal(created.status, "created");
    if (created.status !== "created") return;

    assert.equal(created.media.gameTitle, "Green Hills Platformer");
    assert.equal((await listMedia("media-owner-a")).length, 1);
    assert.equal((await listMedia("media-owner-b")).length, 0);
    assert.equal((await getPublicMedia(created.media.id))?.id, created.media.id);
    assert.equal(await deleteMedia("media-owner-b", created.media.id), false);
    assert.equal(await deleteMedia("media-owner-a", created.media.id), true);
    assert.equal((await listMedia("media-owner-a")).length, 0);

    const invalidHost = await createScreenshot("media-owner-a", {
      ...blobShot("media-owner-a", "bad"),
      url: "https://example.com/users/media-owner-a/screenshots/bad.png",
    });
    assert.equal(invalidHost.status, "invalid");

    const foreignPath = await createScreenshot(
      "media-owner-a",
      blobShot("media-owner-b", "foreign"),
    );
    assert.equal(foreignPath.status, "invalid");

    for (let index = 0; index < MAX_SCREENSHOTS_PER_USER; index += 1) {
      const result = await createScreenshot(
        "media-owner-a",
        blobShot("media-owner-a", `cap-${index}`),
      );
      assert.equal(result.status, "created");
    }
    const limited = await createScreenshot(
      "media-owner-a",
      blobShot("media-owner-a", "overflow"),
    );
    assert.equal(limited.status, "limit");
  } finally {
    memoryMedia().splice(0, memoryMedia().length);
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  }
});
