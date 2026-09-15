import { randomUUID } from "node:crypto";
import { spawn as nodeSpawn } from "node:child_process";
import { promises as nodeFs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ffmpegPath from "ffmpeg-static";

import {
  VIDEO_MAX_DIMENSION,
  VIDEO_MAX_DURATION_MS,
  VIDEO_MIN_DIMENSION,
  VIDEO_OUTPUT_MAX_BYTES,
  videoSourceTempExtension,
} from "./blob-path";

const STDERR_LIMIT = 8 * 1024;
export const VIDEO_TRANSCODE_TIMEOUT_MS = 25_000;

export type VideoDimensions = { width: number; height: number };

export type VideoTranscodeResult = {
  bytes: Uint8Array;
  width: number;
  height: number;
  durationMs: number;
};

export class VideoTranscodeError extends Error {
  constructor(
    message: string,
    readonly code: "timeout" | "aborted" | "failed" | "invalid-output",
    readonly stderr = "",
  ) {
    super(message);
    this.name = "VideoTranscodeError";
  }
}

type Child = {
  kill: (signal?: NodeJS.Signals) => boolean;
  once: (event: "error" | "close", listener: (...args: unknown[]) => void) => void;
  stderr: { on: (event: "data", listener: (data: Uint8Array) => void) => void } | null;
};

export type VideoTranscodeDependencies = {
  ffmpegPath: string | null;
  tempDirectory: () => string;
  writeFile: (path: string, data: Uint8Array) => Promise<void>;
  readFile: (path: string) => Promise<Uint8Array>;
  unlink: (path: string) => Promise<void>;
  spawn: (command: string, args: string[]) => Child;
  setTimeout: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => void;
};

const productionDependencies: VideoTranscodeDependencies = {
  ffmpegPath,
  tempDirectory: tmpdir,
  writeFile: nodeFs.writeFile,
  readFile: nodeFs.readFile,
  unlink: async (path) => {
    await nodeFs.unlink(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  },
  spawn: (command, args) =>
    nodeSpawn(command, args, { shell: false, stdio: ["ignore", "ignore", "pipe"] }) as unknown as Child,
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
};

export function normalizeVideoDimensions(
  width: number,
  height: number,
): VideoDimensions | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < VIDEO_MIN_DIMENSION || height < VIDEO_MIN_DIMENSION) {
    return null;
  }
  const scale = Math.min(1, VIDEO_MAX_DIMENSION / Math.max(width, height));
  const normalizedWidth = Math.floor((width * scale) / 2) * 2;
  const normalizedHeight = Math.floor((height * scale) / 2) * 2;
  if (normalizedWidth < VIDEO_MIN_DIMENSION || normalizedHeight < VIDEO_MIN_DIMENSION) return null;
  return { width: normalizedWidth, height: normalizedHeight };
}

export function buildVideoTranscodePaths(
  tempDirectory: string,
  id: string,
  inputExtension: string,
) {
  const inputPath = join(tempDirectory, `splat-video-${id}-source${inputExtension}`);
  const outputPath = join(tempDirectory, `splat-video-${id}.mp4`);
  return { inputPath, outputPath };
}

export function buildFfmpegArguments(inputPath: string, outputPath: string) {
  return [
    "-y",
    "-fflags",
    "+genpts+igndts",
    "-err_detect",
    "ignore_err",
    "-i",
    inputPath,
    "-t",
    String(VIDEO_MAX_DURATION_MS / 1000),
    "-map_metadata",
    "-1",
    "-an",
    "-vf",
    "scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "28",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-f",
    "mp4",
    outputPath,
  ];
}

export class VideoTranscoder {
  constructor(
    private readonly dependencies: VideoTranscodeDependencies = productionDependencies,
    private readonly timeoutMs = VIDEO_TRANSCODE_TIMEOUT_MS,
  ) {}

  async transcode(
    source: Blob,
    dimensions: VideoDimensions,
    signal?: AbortSignal,
    sourceMeta: { contentType?: string; filename?: string } = {},
  ): Promise<VideoTranscodeResult> {
    const outputDimensions = normalizeVideoDimensions(dimensions.width, dimensions.height);
    if (!outputDimensions) {
      throw new VideoTranscodeError("Invalid video dimensions.", "invalid-output");
    }
    if (!this.dependencies.ffmpegPath) {
      throw new VideoTranscodeError("FFmpeg is unavailable.", "failed");
    }

    const id = randomUUID();
    const inputExtension = videoSourceTempExtension(
      sourceMeta.contentType ?? source.type,
      sourceMeta.filename ?? "",
    );
    const { inputPath, outputPath } = buildVideoTranscodePaths(
      this.dependencies.tempDirectory(),
      id,
      inputExtension,
    );
    try {
      await this.dependencies.writeFile(inputPath, new Uint8Array(await source.arrayBuffer()));
      const bytes = await this.run(inputPath, outputPath, signal);
      if (bytes.byteLength === 0 || bytes.byteLength > VIDEO_OUTPUT_MAX_BYTES) {
        throw new VideoTranscodeError("Invalid transcoded video output.", "invalid-output");
      }
      return {
        bytes,
        ...outputDimensions,
        durationMs: VIDEO_MAX_DURATION_MS,
      };
    } finally {
      await Promise.allSettled([
        this.dependencies.unlink(inputPath),
        this.dependencies.unlink(outputPath),
      ]);
    }
  }

  private run(inputPath: string, outputPath: string, signal?: AbortSignal) {
    return new Promise<Uint8Array>((resolve, reject) => {
      const child = this.dependencies.spawn(
        this.dependencies.ffmpegPath as string,
        buildFfmpegArguments(inputPath, outputPath),
      );
      let settled = false;
      let terminationCode: "timeout" | "aborted" | undefined;
      let stderr = "";
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        this.dependencies.clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        callback();
      };
      const terminate = (code: "timeout" | "aborted") => {
        if (terminationCode || settled) return;
        terminationCode = code;
        child.kill("SIGKILL");
      };
      const abort = () => terminate("aborted");
      const timeout = this.dependencies.setTimeout(() => terminate("timeout"), this.timeoutMs);
      signal?.addEventListener("abort", abort, { once: true });
      child.stderr?.on("data", (chunk) => {
        if (stderr.length < STDERR_LIMIT) stderr += Buffer.from(chunk).toString("utf8").slice(0, STDERR_LIMIT - stderr.length);
      });
      child.once("error", () => finish(() => reject(new VideoTranscodeError("Video conversion failed.", "failed"))));
      child.once("close", (...args) => {
        const code = args[0] as number | null;
        if (terminationCode) {
          finish(() => reject(new VideoTranscodeError("Video conversion did not finish in time.", terminationCode as "timeout" | "aborted")));
          return;
        }
        if (code !== 0) {
          finish(() => reject(new VideoTranscodeError("Video conversion failed.", "failed", stderr)));
          return;
        }
        this.dependencies.readFile(outputPath).then(
          (bytes) => finish(() => resolve(bytes)),
          () => finish(() => reject(new VideoTranscodeError("Video conversion failed.", "failed", stderr))),
        );
      });
    });
  }
}
