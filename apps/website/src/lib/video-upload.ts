import {
  VIDEO_MAX_DURATION_MS,
  blobUrlMatchesPathname,
  isVideoPosterFile,
  isVideoUploadWithinRequestLimit,
  isOwnedVideoPathname,
  isOwnedVideoPosterPathname,
  resolveVideoSourceContentType,
} from "./blob-path";
import {
  type MediaStorage,
  type VideoMediaAssetDto,
  finalizeVideoUpload,
  mediaStorage,
  releaseVideoUpload,
  reserveVideoUpload,
} from "./media";
import {
  normalizeVideoDimensions,
  type VideoTranscodeResult,
} from "./video-transcode";

export type VideoUploadInput = {
  source: File;
  poster: File;
  gameId?: string | null;
  durationMs: number;
  width: number;
  height: number;
  signal?: AbortSignal;
};

export type VideoUploadResult =
  | { status: "created"; media: VideoMediaAssetDto }
  | { status: "limit" }
  | { status: "invalid" };

type VideoUploadDependencies = {
  reserve: typeof reserveVideoUpload;
  finalize: typeof finalizeVideoUpload;
  release: typeof releaseVideoUpload;
  storage: MediaStorage;
  transcode: (
    source: Blob,
    dimensions: { width: number; height: number },
    signal?: AbortSignal,
    sourceMeta?: { contentType?: string; filename?: string },
  ) => Promise<VideoTranscodeResult>;
};

const defaultDependencies: VideoUploadDependencies = {
  reserve: reserveVideoUpload,
  finalize: finalizeVideoUpload,
  release: releaseVideoUpload,
  storage: mediaStorage,
  transcode: async () => {
    throw new Error("Video transcoder is not configured.");
  },
};

function isValidInput(input: VideoUploadInput) {
  return (
    resolveVideoSourceContentType(input.source.type, input.source.name) !== null &&
    isVideoUploadWithinRequestLimit(input.source.size, input.poster.size) &&
    isVideoPosterFile(input.poster) &&
    Number.isInteger(input.durationMs) &&
    input.durationMs >= 1 &&
    input.durationMs <= VIDEO_MAX_DURATION_MS &&
    normalizeVideoDimensions(input.width, input.height) !== null
  );
}

export class VideoUploadService {
  constructor(private readonly dependencies: VideoUploadDependencies) {}

  async save(ownerId: string, input: VideoUploadInput): Promise<VideoUploadResult> {
    if (!isValidInput(input)) return { status: "invalid" };
    const reservationResult = await this.dependencies.reserve(ownerId, input.gameId);
    if (reservationResult.status !== "reserved") return reservationResult;
    const { reservation } = reservationResult;
    try {
      const result = await this.dependencies.transcode(
        input.source,
        { width: input.width, height: input.height },
        input.signal,
        { contentType: input.source.type, filename: input.source.name },
      );
      const uploads = await Promise.allSettled([
        this.dependencies.storage.put({
          pathname: reservation.pathname,
          body: new Blob([Uint8Array.from(result.bytes)], { type: "video/mp4" }),
          contentType: "video/mp4",
          addRandomSuffix: false,
          allowOverwrite: false,
        }),
        this.dependencies.storage.put({
          pathname: reservation.posterPathname,
          body: input.poster,
          contentType: "image/png",
          addRandomSuffix: false,
          allowOverwrite: false,
        }),
      ]);
      const [videoUpload, posterUpload] = uploads;
      if (
        videoUpload?.status !== "fulfilled" ||
        posterUpload?.status !== "fulfilled"
      ) {
        throw new Error("Video upload failed.");
      }
      const video = videoUpload.value;
      const poster = posterUpload.value;
      if (
        video.pathname !== reservation.pathname ||
        video.contentType !== "video/mp4" ||
        !isOwnedVideoPathname(ownerId, video.pathname) ||
        !blobUrlMatchesPathname(video.url, video.pathname) ||
        poster.pathname !== reservation.posterPathname ||
        poster.contentType !== "image/png" ||
        !isOwnedVideoPosterPathname(ownerId, poster.pathname) ||
        !blobUrlMatchesPathname(poster.url, poster.pathname)
      ) {
        throw new Error("Video storage returned invalid blob references.");
      }
      const media = await this.dependencies.finalize(reservation, {
        video: { ...video, byteSize: result.bytes.byteLength },
        poster,
        durationMs: Math.min(input.durationMs, result.durationMs, VIDEO_MAX_DURATION_MS),
        width: result.width,
        height: result.height,
      });
      if (!media) throw new Error("Video reservation expired before finalization.");
      return { status: "created", media };
    } catch (error) {
      await this.dependencies.release(reservation, this.dependencies.storage);
      throw error;
    }
  }
}

export function createVideoUploadService(
  transcode: VideoUploadDependencies["transcode"],
  overrides: Partial<Omit<VideoUploadDependencies, "transcode">> = {},
) {
  return new VideoUploadService({ ...defaultDependencies, ...overrides, transcode });
}
