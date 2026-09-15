import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  mediaEmbedContentSecurityPolicy,
  mediaEmbedRouteHeaders,
} from "../../next.config";
import { isEmbeddablePublicVideo } from "./media-metadata";
import {
  MEDIA_KIND_SCREENSHOT,
  MEDIA_KIND_VIDEO,
  type PublicMediaDto,
} from "./media";

const videoMedia: PublicMediaDto = {
  kind: MEDIA_KIND_VIDEO,
  id: "video-1",
  url: "https://abc.public.blob.vercel-storage.com/users/u1/videos/video-1.mp4",
  pathname: "users/u1/videos/video-1.mp4",
  contentType: "video/mp4",
  byteSize: 200,
  createdAt: "2026-09-15T12:00:00.000Z",
  gameId: "game-public",
  gameTitle: "Space Cooper",
  posterUrl:
    "https://abc.public.blob.vercel-storage.com/users/u1/videos/video-1-poster.png",
  posterPathname: "users/u1/videos/video-1-poster.png",
  durationMs: 10_000,
  width: 640,
  height: 360,
};

const screenshotMedia: PublicMediaDto = {
  kind: MEDIA_KIND_SCREENSHOT,
  id: "shot-1",
  url: "https://abc.public.blob.vercel-storage.com/users/u1/screenshots/shot-1.png",
  pathname: "users/u1/screenshots/shot-1.png",
  contentType: "image/png",
  byteSize: 100,
  createdAt: "2026-09-15T12:00:00.000Z",
  gameId: "game-public",
  gameTitle: "Space Cooper",
};

test("media embed route headers apply restrictive CSP only on embed paths", () => {
  assert.deepEqual(mediaEmbedRouteHeaders, [
    {
      source: "/media/:mediaId/embed",
      headers: [
        {
          key: "Content-Security-Policy",
          value: mediaEmbedContentSecurityPolicy,
        },
      ],
    },
  ]);

  const headerKeys = mediaEmbedRouteHeaders[0]?.headers.map((header) => header.key);
  assert.deepEqual(headerKeys, ["Content-Security-Policy"]);
  assert.equal(
    headerKeys?.some((key) => key === "X-Frame-Options"),
    false,
  );
});

test("media embed CSP allows HTTPS framing and media while blocking scripts", () => {
  const csp = mediaEmbedContentSecurityPolicy;

  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /frame-ancestors \*/);
  assert.match(csp, /media-src https: blob:/);
  assert.match(csp, /img-src https: data:/);
  assert.doesNotMatch(csp, /script-src/);
});

test("embed page does not export unsupported route headers()", async () => {
  const source = await readFile(
    new URL("../app/media/[mediaId]/embed/page.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /export\s+async\s+function\s+headers\s*\(/);
  assert.match(source, /export\s+default\s+async\s+function\s+MediaEmbedPage/);
  assert.match(source, /isEmbeddablePublicVideo/);
});

test("embed route remains video-only through eligibility guard", () => {
  assert.equal(isEmbeddablePublicVideo(videoMedia), true);
  assert.equal(isEmbeddablePublicVideo(screenshotMedia), false);
  assert.equal(isEmbeddablePublicVideo(null), false);
});
