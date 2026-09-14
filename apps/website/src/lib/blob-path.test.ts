import assert from "node:assert/strict";
import test from "node:test";

import {
  blobUrlMatchesPathname,
  isOwnedScreenshotPathname,
  isOwnedThumbnailPathname,
  isOwnedUploadPathname,
  isSafeId,
  isVercelBlobUrl,
  screenshotBlobPathname,
  thumbnailBlobPathname,
} from "./blob-path";

test("blob pathnames stay inside the owning user's prefix", () => {
  assert.equal(
    screenshotBlobPathname("owner-a", "shot-1"),
    "users/owner-a/screenshots/shot-1.png",
  );
  assert.equal(
    thumbnailBlobPathname("owner-a", "game-1"),
    "users/owner-a/games/game-1/thumbnail.webp",
  );
  assert.equal(isSafeId("owner-a"), true);
  assert.equal(isSafeId("users/owner-a"), false);
  assert.throws(() => screenshotBlobPathname("owner/a", "shot-1"));
});

test("owned screenshot pathnames accept Vercel random suffixes", () => {
  assert.equal(
    isOwnedScreenshotPathname(
      "owner-a",
      "users/owner-a/screenshots/shot-1.png",
    ),
    true,
  );
  assert.equal(
    isOwnedScreenshotPathname(
      "owner-a",
      "users/owner-a/screenshots/shot-1-abc123.png",
    ),
    true,
  );
  assert.equal(
    isOwnedScreenshotPathname(
      "owner-b",
      "users/owner-a/screenshots/shot-1.png",
    ),
    false,
  );
  assert.equal(
    isOwnedScreenshotPathname(
      "owner-a",
      "users/owner-a/screenshots/nested/shot-1.png",
    ),
    false,
  );
});

test("owned thumbnail pathnames stay on the matching game", () => {
  assert.equal(
    isOwnedThumbnailPathname(
      "owner-a",
      "game-1",
      "users/owner-a/games/game-1/thumbnail.webp",
    ),
    true,
  );
  assert.equal(
    isOwnedThumbnailPathname(
      "owner-a",
      "game-1",
      "users/owner-a/games/game-1/thumbnail-xyz.webp",
    ),
    true,
  );
  assert.equal(
    isOwnedThumbnailPathname(
      "owner-a",
      "game-2",
      "users/owner-a/games/game-1/thumbnail.webp",
    ),
    false,
  );
  assert.equal(
    isOwnedUploadPathname(
      "owner-a",
      "users/owner-a/screenshots/shot-1.png",
      "screenshot",
    ),
    true,
  );
});

test("blob URLs must be https Vercel Blob hosts matching the pathname", () => {
  const pathname = "users/owner-a/screenshots/shot-1.png";
  const url = `https://abc.public.blob.vercel-storage.com/${pathname}`;

  assert.equal(isVercelBlobUrl(url), true);
  assert.equal(blobUrlMatchesPathname(url, pathname), true);
  assert.equal(
    isVercelBlobUrl("https://example.com/users/owner-a/screenshots/shot-1.png"),
    false,
  );
  assert.equal(
    blobUrlMatchesPathname(
      "https://abc.public.blob.vercel-storage.com/users/owner-a/screenshots/other.png",
      pathname,
    ),
    false,
  );
});
