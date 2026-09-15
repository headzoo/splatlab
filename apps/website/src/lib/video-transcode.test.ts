import assert from "node:assert/strict";
import { constants as fsConstants, promises as fs } from "node:fs";
import test from "node:test";

import ffmpegPath from "ffmpeg-static";

import { videoRouteTracingFiles } from "../../next.config";
import { VIDEO_OUTPUT_MAX_BYTES } from "./blob-path";
import {
  buildFfmpegArguments,
  buildVideoTranscodePaths,
  VideoTranscodeError,
  VideoTranscoder,
  type VideoTranscodeDependencies,
} from "./video-transcode";

test("the FFmpeg binary is executable and traced into the video route", async () => {
  assert.equal(typeof ffmpegPath, "string");
  assert.ok(ffmpegPath);
  await fs.access(ffmpegPath, fsConstants.X_OK);
  assert.deepEqual(videoRouteTracingFiles, ["./node_modules/ffmpeg-static/**"]);
});

test("transcode temp paths never collide for MP4 browser captures", () => {
  const paths = buildVideoTranscodePaths("/tmp", "capture-id", ".mp4");
  assert.equal(paths.inputPath, "/tmp/splat-video-capture-id-source.mp4");
  assert.equal(paths.outputPath, "/tmp/splat-video-capture-id.mp4");
  assert.notEqual(paths.inputPath, paths.outputPath);
});

test("FFmpeg arguments are fixed and contain no request metadata", () => {
  const args = buildFfmpegArguments("/tmp/input.webm", "/tmp/output.mp4");
  assert.deepEqual(args.slice(0, 12), [
    "-y",
    "-fflags",
    "+genpts+igndts",
    "-err_detect",
    "ignore_err",
    "-i",
    "/tmp/input.webm",
    "-t",
    "10",
    "-map_metadata",
    "-1",
    "-an",
  ]);
  assert.ok(args.includes("libx264"));
  assert.ok(args.includes("yuv420p"));
  assert.ok(args.includes("+faststart"));
  assert.ok(args.includes("-an"));
  assert.ok(args.some((arg) => arg.includes("setsar=1")));
  assert.equal(args.at(-1), "/tmp/output.mp4");
});

function fakeDependencies(options: { output?: Uint8Array; closeCode?: number; timeout?: boolean } = {}) {
  const removed: string[] = [];
  const commands: Array<{ command: string; args: string[] }> = [];
  let closeListener: ((...args: unknown[]) => void) | undefined;
  const child = {
    killCalled: false,
    kill() {
      this.killCalled = true;
      queueMicrotask(() => closeListener?.(null));
      return true;
    },
    once(event: "error" | "close", listener: (...args: unknown[]) => void) {
      if (event === "close") closeListener = listener;
    },
    stderr: { on() {} },
  };
  const dependencies: VideoTranscodeDependencies = {
    ffmpegPath: "/ffmpeg",
    tempDirectory: () => "/tmp",
    writeFile: async () => {},
    readFile: async () => options.output ?? new Uint8Array([1, 2, 3]),
    unlink: async (path) => { removed.push(path); },
    spawn(command, args) {
      commands.push({ command, args });
      if (!options.timeout) queueMicrotask(() => closeListener?.(options.closeCode ?? 0));
      return child;
    },
    setTimeout(callback, _delay) {
      if (options.timeout) queueMicrotask(callback);
      return 1 as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout() {},
  };
  return { dependencies, removed, commands, child };
}

test("the transcoder removes temporary source and output on success", async () => {
  const fake = fakeDependencies();
  const output = await new VideoTranscoder(fake.dependencies).transcode(
    new Blob(["source"]),
    { width: 641, height: 361 },
  );
  assert.equal(fake.commands[0]?.command, "/ffmpeg");
  assert.equal(output.width, 640);
  assert.equal(output.height, 360);
  assert.equal(fake.removed.length, 2);
});

test("the transcoder terminates and cleans up on timeout and bad output", async () => {
  const timeout = fakeDependencies({ timeout: true });
  await assert.rejects(
    new VideoTranscoder(timeout.dependencies).transcode(new Blob(["source"]), { width: 640, height: 360 }),
    (error: unknown) => error instanceof VideoTranscodeError && error.code === "timeout",
  );
  assert.equal(timeout.child.killCalled, true);
  assert.equal(timeout.removed.length, 2);

  const oversized = fakeDependencies({ output: new Uint8Array(VIDEO_OUTPUT_MAX_BYTES + 1) });
  await assert.rejects(
    new VideoTranscoder(oversized.dependencies).transcode(new Blob(["source"]), { width: 640, height: 360 }),
    /Invalid transcoded video output/,
  );
  assert.equal(oversized.removed.length, 2);
});
