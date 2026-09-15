import assert from "node:assert/strict";
import test from "node:test";

import { VIDEO_SOURCE_MAX_BYTES } from "./blob-path";
import type { MediaStorage, VideoReservation } from "./media";
import { VideoUploadService } from "./video-upload";

const reservation: VideoReservation = {
  id: "media-id",
  ownerId: "owner-id",
  gameId: null,
  kind: "video",
  pathname: "users/owner-id/videos/media-id.mp4",
  posterPathname: "users/owner-id/videos/media-id-poster.png",
  byteSize: 0,
  quotaSlot: 0,
  createdAt: new Date(),
};

function source(type = "video/webm") {
  return new File(["recording"], "capture.webm", { type });
}

function poster() {
  return new File(["poster"], "poster.png", { type: "image/png" });
}

function serviceHarness() {
  let reserved = 0;
  let transcoded = 0;
  let released = 0;
  const uploads: string[] = [];
  const storage: MediaStorage = {
    async put(input) {
      uploads.push(input.pathname);
      return {
        pathname: input.pathname,
        contentType: input.contentType,
        url: `https://store.public.blob.vercel-storage.com/${input.pathname}`,
      };
    },
    async delete() { return true; },
  };
  const service = new VideoUploadService({
    reserve: async () => { reserved += 1; return { status: "reserved", reservation }; },
    finalize: async (_reservation, finalization) => ({
      id: reservation.id,
      gameId: null,
      gameTitle: null,
      kind: "video",
      url: finalization.video.url,
      pathname: finalization.video.pathname,
      contentType: "video/mp4",
      byteSize: finalization.video.byteSize,
      posterUrl: finalization.poster.url,
      posterPathname: finalization.poster.pathname,
      durationMs: finalization.durationMs,
      width: finalization.width,
      height: finalization.height,
      createdAt: new Date().toISOString(),
    }),
    release: async () => { released += 1; },
    storage,
    transcode: async () => {
      transcoded += 1;
      return { bytes: new Uint8Array([1]), width: 640, height: 360, durationMs: 1_000 };
    },
  });
  return { service, uploads, counts: () => ({ reserved, transcoded, released }) };
}

test("video validation rejects bad inputs before quota reservation", async () => {
  const harness = serviceHarness();
  const result = await harness.service.save("owner-id", {
    source: new File(["recording"], "capture.mov", { type: "video/quicktime" }),
    poster: poster(),
    durationMs: 1_000,
    width: 640,
    height: 360,
  });
  assert.deepEqual(result, { status: "invalid" });
  assert.deepEqual(harness.counts(), { reserved: 0, transcoded: 0, released: 0 });

  const oversize = await harness.service.save("owner-id", {
    source: new File([new Uint8Array(VIDEO_SOURCE_MAX_BYTES + 1)], "capture.webm", { type: "video/webm" }),
    poster: poster(),
    durationMs: 1_000,
    width: 640,
    height: 360,
  });
  assert.deepEqual(oversize, { status: "invalid" });
});

test("video validation accepts multipart files with generic browser MIME types", async () => {
  const harness = serviceHarness();
  const result = await harness.service.save("owner-id", {
    source: new File(["recording"], "capture.webm", { type: "application/octet-stream" }),
    poster: new File(["poster"], "poster.png", { type: "" }),
    durationMs: 10_000,
    width: 640,
    height: 360,
  });
  assert.equal(result.status, "created");
});

test("video service reserves before conversion and finalizes both canonical objects", async () => {
  const harness = serviceHarness();
  const result = await harness.service.save("owner-id", {
    source: source("video/mp4; codecs=avc1.42e01e"),
    poster: poster(),
    durationMs: 1_000,
    width: 640,
    height: 360,
  });
  assert.equal(result.status, "created");
  assert.deepEqual(harness.counts(), { reserved: 1, transcoded: 1, released: 0 });
  assert.deepEqual(harness.uploads, [reservation.pathname, reservation.posterPathname]);
});

test("video service releases the pending reservation after either upload fails", async () => {
  let released = 0;
  const attempted: string[] = [];
  const service = new VideoUploadService({
    reserve: async () => ({ status: "reserved", reservation }),
    finalize: async () => null,
    release: async () => { released += 1; },
    storage: {
      async put(input) {
        attempted.push(input.pathname);
        if (input.pathname === reservation.posterPathname) {
          throw new Error("poster upload failed");
        }
        return {
          pathname: input.pathname,
          contentType: input.contentType,
          url: `https://store.public.blob.vercel-storage.com/${input.pathname}`,
        };
      },
      async delete() { return true; },
    },
    transcode: async () => ({
      bytes: new Uint8Array([1]),
      width: 640,
      height: 360,
      durationMs: 1_000,
    }),
  });
  await assert.rejects(
    service.save("owner-id", {
      source: source(),
      poster: poster(),
      durationMs: 1_000,
      width: 640,
      height: 360,
    }),
    /Video upload failed/,
  );
  assert.deepEqual(attempted, [reservation.pathname, reservation.posterPathname]);
  assert.equal(released, 1);
});

