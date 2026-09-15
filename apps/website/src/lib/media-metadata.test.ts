import assert from "node:assert/strict";
import test from "node:test";

import { mediaEmbedPath, mediaSharePath } from "./game-routes";
import {
  buildPublicMediaMetadata,
  isEmbeddablePublicVideo,
} from "./media-metadata";
import {
  MEDIA_KIND_SCREENSHOT,
  MEDIA_KIND_VIDEO,
  type PublicMediaDto,
} from "./media";
import { absoluteSiteUrl, resolveSiteOrigin } from "./site-url";

const ORIGIN = new URL("https://splats.example");

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

const privateScreenshotMedia: PublicMediaDto = {
  ...screenshotMedia,
  id: "shot-private",
  gameId: null,
  gameTitle: null,
};

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

const privateVideoMedia: PublicMediaDto = {
  ...videoMedia,
  id: "video-private",
  gameId: null,
  gameTitle: null,
};

function withSiteEnv(
  values: Record<string, string | undefined>,
  run: () => void | Promise<void>,
) {
  const previous = {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    VERCEL_URL: process.env.VERCEL_URL,
  };

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return Promise.resolve(run()).finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

test("resolveSiteOrigin prefers NEXT_PUBLIC_SITE_URL and strips paths", () =>
  withSiteEnv(
    {
      NEXT_PUBLIC_SITE_URL: "https://splats.example/share/",
      VERCEL_PROJECT_PRODUCTION_URL: "preview.vercel.app",
      VERCEL_URL: "branch.vercel.app",
    },
    () => {
      assert.equal(resolveSiteOrigin().href, "https://splats.example/");
    },
  ));

test("resolveSiteOrigin falls back to production and preview hosts", async () => {
  await withSiteEnv(
    {
      NEXT_PUBLIC_SITE_URL: undefined,
      VERCEL_PROJECT_PRODUCTION_URL: "splats-prod.vercel.app",
      VERCEL_URL: "branch.vercel.app",
    },
    () => {
      assert.equal(resolveSiteOrigin().href, "https://splats-prod.vercel.app/");
    },
  );

  await withSiteEnv(
    {
      NEXT_PUBLIC_SITE_URL: undefined,
      VERCEL_PROJECT_PRODUCTION_URL: undefined,
      VERCEL_URL: "branch.vercel.app",
    },
    () => {
      assert.equal(resolveSiteOrigin().href, "https://branch.vercel.app/");
    },
  );
});

test("resolveSiteOrigin uses localhost only when no deployment origin exists", () =>
  withSiteEnv(
    {
      NEXT_PUBLIC_SITE_URL: undefined,
      VERCEL_PROJECT_PRODUCTION_URL: undefined,
      VERCEL_URL: undefined,
    },
    () => {
      assert.equal(resolveSiteOrigin().href, "http://localhost:3000/");
    },
  ));

test("absoluteSiteUrl builds encoded absolute paths", () => {
  assert.equal(
    absoluteSiteUrl(mediaSharePath("clip/with spaces"), ORIGIN),
    "https://splats.example/media/clip%2Fwith%20spaces",
  );
  assert.equal(
    absoluteSiteUrl(mediaEmbedPath("clip/with spaces"), ORIGIN),
    "https://splats.example/media/clip%2Fwith%20spaces/embed",
  );
});

test("screenshot metadata stays image-oriented with absolute canonical URLs", () => {
  const metadata = buildPublicMediaMetadata(screenshotMedia, ORIGIN);
  const openGraph = metadata.openGraph;
  const twitter = metadata.twitter;

  assert.equal(metadata.title, "Space Cooper | Splat Lab!");
  assert.equal(
    metadata.alternates?.canonical,
    "https://splats.example/media/shot-1",
  );
  assert.ok(openGraph && "type" in openGraph);
  assert.equal(openGraph.type, "website");
  assert.deepEqual(openGraph.images, [
    {
      url: screenshotMedia.url,
      alt: "Space Cooper",
    },
  ]);
  assert.ok(twitter && "card" in twitter);
  assert.equal(twitter.card, "summary_large_image");
  assert.deepEqual(twitter.images, [screenshotMedia.url]);
});

test("video metadata emits Open Graph video and X player descriptors", () => {
  const metadata = buildPublicMediaMetadata(videoMedia, ORIGIN);
  const openGraph = metadata.openGraph;
  const twitter = metadata.twitter;

  assert.equal(metadata.title, "Space Cooper | Splat Lab!");
  assert.equal(
    metadata.alternates?.canonical,
    "https://splats.example/media/video-1",
  );
  assert.ok(openGraph && "type" in openGraph);
  assert.equal(openGraph.type, "video.other");
  assert.deepEqual(openGraph.images, [
    {
      url: videoMedia.posterUrl,
      width: 640,
      height: 360,
      alt: "Space Cooper",
    },
  ]);
  assert.deepEqual(openGraph.videos, [
    {
      url: videoMedia.url,
      secureUrl: videoMedia.url,
      type: "video/mp4",
      width: 640,
      height: 360,
    },
  ]);
  assert.ok(twitter && "card" in twitter);
  assert.equal(twitter.card, "player");
  assert.ok("players" in twitter);
  assert.deepEqual(twitter.players, [
    {
      playerUrl: "https://splats.example/media/video-1/embed",
      streamUrl: videoMedia.url,
      width: 640,
      height: 360,
    },
  ]);
});

test("private associated games omit title and play-link fields from metadata inputs", () => {
  const screenshot = buildPublicMediaMetadata(privateScreenshotMedia, ORIGIN);
  const video = buildPublicMediaMetadata(privateVideoMedia, ORIGIN);

  assert.equal(screenshot.title, "Screenshot | Splat Lab!");
  assert.match(String(screenshot.description), /saved in Splat Lab!/);
  assert.equal(video.title, "Video | Splat Lab!");
  assert.match(String(video.description), /gameplay video saved in Splat Lab!/);
  assert.equal(privateScreenshotMedia.gameId, null);
  assert.equal(privateVideoMedia.gameId, null);
});

test("embed eligibility accepts videos only", () => {
  assert.equal(isEmbeddablePublicVideo(videoMedia), true);
  assert.equal(isEmbeddablePublicVideo(screenshotMedia), false);
  assert.equal(isEmbeddablePublicVideo(null), false);
});

test("missing media metadata uses kind-neutral not-found copy", () => {
  const metadata = buildPublicMediaMetadata(null, ORIGIN);
  assert.equal(metadata.title, "Media not found | Splat Lab!");
  assert.match(String(metadata.description), /media could not be found/i);
});
