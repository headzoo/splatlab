import assert from "node:assert/strict";
import test from "node:test";

import {
  isScreenshotMedia,
  isVideoMedia,
  mediaCardKindLabel,
  mediaCardThumbnailUrl,
  mediaDeleteConfirmMessage,
  mediaDownloadFilename,
  mediaEmptyStateHint,
  mediaOpenAriaLabel,
  mediaShareTitle,
  mediaShareUrl,
} from "./media-library-helpers";
import {
  MEDIA_KIND_SCREENSHOT,
  MEDIA_KIND_VIDEO,
  type MediaAssetDto,
} from "@/lib/media-types";

const screenshot: MediaAssetDto = {
  id: "shot-1",
  kind: MEDIA_KIND_SCREENSHOT,
  gameId: "game-1",
  gameTitle: "Haunted Maze",
  url: "https://blob.example/screenshot.png",
  pathname: "users/owner/screenshots/shot-1.png",
  contentType: "image/png",
  byteSize: 1024,
  createdAt: "2026-09-13T14:05:09.123Z",
};

const video: MediaAssetDto = {
  id: "vid-1",
  kind: MEDIA_KIND_VIDEO,
  gameId: "game-1",
  gameTitle: "Haunted Maze",
  url: "https://blob.example/video.mp4",
  pathname: "users/owner/videos/vid-1.mp4",
  contentType: "video/mp4",
  byteSize: 4096,
  createdAt: "2026-09-13T14:05:09.123Z",
  posterUrl: "https://blob.example/poster.png",
  posterPathname: "users/owner/videos/vid-1-poster.png",
  durationMs: 10_000,
  width: 1280,
  height: 720,
};

test("mixed media helpers branch on screenshot versus video DTOs", () => {
  assert.equal(isVideoMedia(screenshot), false);
  assert.equal(isScreenshotMedia(screenshot), true);
  assert.equal(isVideoMedia(video), true);
  assert.equal(isScreenshotMedia(video), false);
  assert.equal(mediaCardThumbnailUrl(screenshot), screenshot.url);
  assert.equal(mediaCardThumbnailUrl(video), video.posterUrl);
  assert.equal(mediaCardKindLabel(screenshot), "Screenshot");
  assert.equal(mediaCardKindLabel(video), "Video");
});

test("media share paths target the public media page", () => {
  assert.equal(
    mediaShareUrl("https://splatlab.example", screenshot),
    "https://splatlab.example/media/shot-1",
  );
  assert.equal(
    mediaShareUrl("https://splatlab.example", video),
    "https://splatlab.example/media/vid-1",
  );
});

test("video downloads use safe mp4 filenames", () => {
  assert.equal(
    mediaDownloadFilename(video, new Date("2026-09-13T14:05:09.123Z")),
    "splat-lab-haunted-maze-2026-09-13T14-05-09Z.mp4",
  );
  assert.equal(
    mediaDownloadFilename(screenshot, new Date("2026-09-13T14:05:09.123Z")),
    "splat-lab-haunted-maze-2026-09-13T14-05-09Z.png",
  );
});

test("kind-aware copy covers open labels, share titles, and delete prompts", () => {
  assert.equal(mediaOpenAriaLabel(screenshot), "Open screenshot from Haunted Maze");
  assert.equal(mediaOpenAriaLabel(video), "Open video from Haunted Maze");
  assert.equal(mediaShareTitle(screenshot), "Haunted Maze screenshot");
  assert.equal(mediaShareTitle(video), "Haunted Maze video");
  assert.equal(
    mediaDeleteConfirmMessage(screenshot),
    "Delete this screenshot? This cannot be undone.",
  );
  assert.equal(
    mediaDeleteConfirmMessage(video),
    "Delete this video? This cannot be undone.",
  );
  assert.match(mediaEmptyStateHint(), /Screenshot or Video capture/);
});
