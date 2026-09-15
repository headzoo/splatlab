import assert from "node:assert/strict";
import test from "node:test";

import { VIDEO_SOURCE_MAX_BYTES } from "@/lib/blob-path";

import {
  assembleVideoChunks,
  flushAndStopMediaRecorder,
  secondsRemaining,
  selectVideoMimeType,
  startCanvasVideoRecorder,
  VIDEO_CAPTURE_BIT_RATE,
  VIDEO_CAPTURE_SECONDS,
  clampVideoCaptureDurationMs,
  videoCaptureDimensions,
} from "./canvas-video-capture";

test("video MIME selection prefers H.264 MP4 then WebM fallbacks", () => {
  assert.equal(
    selectVideoMimeType((type) => type === "video/mp4;codecs=avc1.42E01E"),
    "video/mp4;codecs=avc1.42E01E",
  );
  assert.equal(
    selectVideoMimeType((type) => type === "video/webm;codecs=vp9"),
    "video/webm;codecs=vp9",
  );
  assert.equal(
    selectVideoMimeType((type) => type === "video/mp4"),
    "video/mp4",
  );
  assert.equal(selectVideoMimeType(() => false), null);
});

test("video capture dimensions stay within a modest recording width", () => {
  assert.deepEqual(videoCaptureDimensions(1920, 1080), {
    width: 960,
    height: 540,
  });
  assert.deepEqual(videoCaptureDimensions(640, 480), {
    width: 640,
    height: 480,
  });
});

test("video capture duration clamps to the upload contract", () => {
  assert.equal(clampVideoCaptureDurationMs(10_250), 10_000);
  assert.equal(clampVideoCaptureDurationMs(0), 1);
});

test("video capture bitrate leaves headroom under the upload ceiling", () => {
  const theoreticalMaxBytes = (VIDEO_CAPTURE_BIT_RATE * VIDEO_CAPTURE_SECONDS) / 8;
  assert.ok(theoreticalMaxBytes < VIDEO_SOURCE_MAX_BYTES);
});

test("recording timer clamps at zero", () => {
  const deadline = 10_000;
  assert.equal(secondsRemaining(deadline, 0), VIDEO_CAPTURE_SECONDS);
  assert.equal(secondsRemaining(deadline, 9_001), 1);
  assert.equal(secondsRemaining(deadline, 10_001), 0);
});

test("chunk assembly preserves all recorder chunks and type", async () => {
  const blob = assembleVideoChunks(["one", "two"], "video/webm");
  assert.equal(blob.type, "video/webm");
  assert.equal(await blob.text(), "onetwo");
});

test("failed recorder construction stops every acquired stream track", () => {
  let stopped = 0;
  const stream = {
    getTracks: () => [{ stop: () => { stopped += 1; } }, { stop: () => { stopped += 1; } }],
  } as unknown as MediaStream;

  assert.throws(
    () => startCanvasVideoRecorder(stream, {}, () => { throw new Error("constructor failed"); }),
    /constructor failed/,
  );
  assert.equal(stopped, 2);
});

test("flushAndStopMediaRecorder requests a final chunk before stopping", () => {
  let requested = 0;
  let stops = 0;
  flushAndStopMediaRecorder({
    state: "recording",
    requestData: () => { requested += 1; },
    stop: () => { stops += 1; },
  } as Pick<MediaRecorder, "state" | "requestData" | "stop">);
  assert.equal(requested, 1);
  assert.equal(stops, 1);
});

test("failed synchronous recorder start stops tracks without retrying start", () => {
  let stopped = 0;
  let starts = 0;
  const stream = {
    getTracks: () => [{ stop: () => { stopped += 1; } }],
  } as unknown as MediaStream;

  assert.throws(
    () => startCanvasVideoRecorder(stream, {}, () => ({
      state: "inactive",
      start: () => {
        starts += 1;
        throw new Error("start failed");
      },
      stop: () => undefined,
      ondataavailable: null,
      onerror: null,
      onstop: null,
    })),
    /start failed/,
  );
  assert.equal(starts, 1);
  assert.equal(stopped, 1);
});
