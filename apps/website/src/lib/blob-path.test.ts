import assert from "node:assert/strict";
import test from "node:test";

import {
  VIDEO_MULTIPART_MAX_BYTES,
  VIDEO_MULTIPART_OVERHEAD_BYTES,
  VIDEO_POSTER_MAX_BYTES,
  VIDEO_SOURCE_MAX_BYTES,
  blobUrlMatchesPathname,
  isVideoUploadWithinRequestLimit,
  isOwnedScreenshotPathname,
  isOwnedThumbnailPathname,
  isOwnedUploadPathname,
  isOwnedVideoPathname,
  isOwnedVideoPosterPathname,
  isSafeId,
  isVercelBlobUrl,
  isVideoPosterFile,
  normalizeVideoSourceContentType,
  resolveVideoSourceContentType,
  screenshotBlobPathname,
  thumbnailBlobPathname,
  videoBlobPathname,
  videoPosterBlobPathname,
  videoSourceTempExtension,
} from "./blob-path";

test("video source MIME normalization accepts the preferred H.264 MP4 recorder type", () => {
  assert.equal(
    normalizeVideoSourceContentType("video/mp4; codecs=avc1.42e01e"),
    "video/mp4;codecs=avc1.42E01E",
  );
  assert.equal(normalizeVideoSourceContentType("video/mp4;codecs=hev1"), null);
});

test("video upload MIME resolution accepts recorder variants and filename fallbacks", () => {
  assert.equal(
    resolveVideoSourceContentType("video/webm;codecs=vp9,opus"),
    "video/webm",
  );
  assert.equal(
    resolveVideoSourceContentType("application/octet-stream", "capture.webm"),
    "video/webm",
  );
  assert.equal(isVideoPosterFile({ type: "", name: "game-capture-poster.png" }), true);
  assert.equal(videoSourceTempExtension("application/octet-stream", "capture.webm"), ".webm");
  assert.equal(videoSourceTempExtension("video/mp4", "capture.mp4"), ".mp4");
});

test("video file budget stays safely below Vercel's function body limit", () => {
  assert.equal(
    isVideoUploadWithinRequestLimit(VIDEO_SOURCE_MAX_BYTES, VIDEO_POSTER_MAX_BYTES),
    true,
  );
  assert.ok(
    VIDEO_SOURCE_MAX_BYTES +
      VIDEO_POSTER_MAX_BYTES +
      VIDEO_MULTIPART_OVERHEAD_BYTES <
      VIDEO_MULTIPART_MAX_BYTES,
  );
  assert.equal(
    isVideoUploadWithinRequestLimit(VIDEO_SOURCE_MAX_BYTES + 1, 1),
    false,
  );
});

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
  assert.equal(
    videoBlobPathname("owner-a", "video-1"),
    "users/owner-a/videos/video-1.mp4",
  );
  assert.equal(
    videoPosterBlobPathname("owner-a", "video-1"),
    "users/owner-a/videos/video-1-poster.png",
  );
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

test("owned video paths accept only deterministic files for that owner", () => {
  assert.equal(
    isOwnedVideoPathname("owner-a", "users/owner-a/videos/video-1.mp4"),
    true,
  );
  assert.equal(
    isOwnedVideoPosterPathname(
      "owner-a",
      "users/owner-a/videos/video-1-poster.png",
    ),
    true,
  );
  assert.equal(
    isOwnedVideoPathname("owner-a", "users/owner-a/videos/nested/video.mp4"),
    false,
  );
  assert.equal(
    isOwnedVideoPosterPathname(
      "owner-a",
      "users/owner-b/videos/video-1-poster.png",
    ),
    false,
  );
  assert.equal(
    isOwnedVideoPathname("owner-a", "users/owner-a/videos/video-1.webm"),
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
