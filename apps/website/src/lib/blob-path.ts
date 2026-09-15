export const SCREENSHOT_MAX_BYTES = 8 * 1024 * 1024;
export const THUMBNAIL_MAX_BYTES = 1 * 1024 * 1024;
export const MAX_SCREENSHOTS_PER_USER = 48;
export const VIDEO_MAX_PER_USER = 24;
// Vercel Functions accept a maximum 4.5 MB request body. Reserve ample space
// for multipart boundaries and fields so file bytes can never exceed it.
export const VIDEO_MULTIPART_MAX_BYTES = 4 * 1024 * 1024;
export const VIDEO_MULTIPART_OVERHEAD_BYTES = 64 * 1024;
export const VIDEO_SOURCE_MAX_BYTES = 3 * 1024 * 1024;
export const VIDEO_POSTER_MAX_BYTES = 512 * 1024;
export const VIDEO_OUTPUT_MAX_BYTES = 20 * 1024 * 1024;
export const VIDEO_MIN_DURATION_MS = 1;
export const VIDEO_MAX_DURATION_MS = 10_000;
export const VIDEO_MIN_DIMENSION = 2;
export const VIDEO_MAX_DIMENSION = 1_920;
export const VIDEO_SUPPORTED_SOURCE_CONTENT_TYPES = [
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
] as const;

const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const BLOB_HOST_SUFFIX = ".blob.vercel-storage.com";

export type LabUploadKind = "screenshot" | "thumbnail";

export function normalizeVideoSourceContentType(contentType: string) {
  const normalized = contentType.trim().toLowerCase().replace(/\s+/g, "");
  if (normalized === "video/mp4;codecs=avc1.42e01e") {
    return "video/mp4;codecs=avc1.42E01E" as const;
  }
  if (normalized === "video/mp4") return "video/mp4" as const;
  if (normalized === "video/webm") return "video/webm" as const;
  if (normalized === "video/webm;codecs=vp9") {
    return "video/webm;codecs=vp9" as const;
  }
  if (normalized === "video/webm;codecs=vp8") {
    return "video/webm;codecs=vp8" as const;
  }
  return null;
}

export function resolveVideoSourceContentType(
  contentType: string,
  filename = "",
) {
  const normalized = normalizeVideoSourceContentType(contentType);
  if (normalized) return normalized;
  const lowered = contentType.trim().toLowerCase().replace(/\s+/g, "");
  if (lowered.startsWith("video/webm")) {
    return normalizeVideoSourceContentType("video/webm");
  }
  if (lowered.startsWith("video/mp4")) {
    return normalizeVideoSourceContentType("video/mp4");
  }
  const lower = filename.trim().toLowerCase();
  if (lower.endsWith(".webm")) return normalizeVideoSourceContentType("video/webm");
  if (lower.endsWith(".mp4")) return normalizeVideoSourceContentType("video/mp4");
  return null;
}

export function isVideoPosterFile(file: Pick<File, "type" | "name">) {
  if (file.type === "image/png") return true;
  if (file.type !== "" && file.type !== "application/octet-stream") return false;
  return file.name.trim().toLowerCase().endsWith(".png");
}

export function videoSourceTempExtension(contentType: string, filename = "") {
  const resolved = resolveVideoSourceContentType(contentType, filename);
  return resolved?.startsWith("video/mp4") ? ".mp4" : ".webm";
}

export function isVideoUploadWithinRequestLimit(
  sourceBytes: number,
  posterBytes: number,
) {
  return (
    Number.isSafeInteger(sourceBytes) &&
    Number.isSafeInteger(posterBytes) &&
    sourceBytes > 0 &&
    posterBytes > 0 &&
    sourceBytes <= VIDEO_SOURCE_MAX_BYTES &&
    posterBytes <= VIDEO_POSTER_MAX_BYTES &&
    sourceBytes + posterBytes + VIDEO_MULTIPART_OVERHEAD_BYTES <=
      VIDEO_MULTIPART_MAX_BYTES
  );
}

export function isSafeId(value: string) {
  return SAFE_ID.test(value) && value.length > 0 && value.length <= 80;
}

export function screenshotBlobPathname(userId: string, mediaId: string) {
  if (!isSafeId(userId) || !isSafeId(mediaId)) {
    throw new Error("Invalid screenshot path.");
  }
  return `users/${userId}/screenshots/${mediaId}.png`;
}

export function videoBlobPathname(userId: string, mediaId: string) {
  if (!isSafeId(userId) || !isSafeId(mediaId)) {
    throw new Error("Invalid video path.");
  }
  return `users/${userId}/videos/${mediaId}.mp4`;
}

export function videoPosterBlobPathname(userId: string, mediaId: string) {
  if (!isSafeId(userId) || !isSafeId(mediaId)) {
    throw new Error("Invalid video poster path.");
  }
  return `users/${userId}/videos/${mediaId}-poster.png`;
}

export function thumbnailBlobPathname(userId: string, gameId: string) {
  if (!isSafeId(userId) || !isSafeId(gameId)) {
    throw new Error("Invalid thumbnail path.");
  }
  return `users/${userId}/games/${gameId}/thumbnail.webp`;
}

export function isOwnedScreenshotPathname(userId: string, pathname: string) {
  if (!isSafeId(userId) || pathname.length > 512 || pathname.includes("..")) {
    return false;
  }
  const prefix = `users/${userId}/screenshots/`;
  if (!pathname.startsWith(prefix)) return false;
  const filename = pathname.slice(prefix.length);
  return filename.length > 0 && !filename.includes("/") && /\.png$/i.test(filename);
}

function matchesOwnedVideoPathname(
  userId: string,
  pathname: string,
  filenamePattern: RegExp,
) {
  if (!isSafeId(userId) || pathname.length > 512 || pathname.includes("..")) {
    return false;
  }
  const prefix = `users/${userId}/videos/`;
  if (!pathname.startsWith(prefix)) return false;
  const filename = pathname.slice(prefix.length);
  return (
    filename.length > 0 &&
    !filename.includes("/") &&
    filenamePattern.test(filename)
  );
}

export function isOwnedVideoPathname(userId: string, pathname: string) {
  return matchesOwnedVideoPathname(userId, pathname, /^[A-Za-z0-9_-]+\.mp4$/);
}

export function isOwnedVideoPosterPathname(userId: string, pathname: string) {
  return matchesOwnedVideoPathname(
    userId,
    pathname,
    /^[A-Za-z0-9_-]+-poster\.png$/,
  );
}

export function isOwnedThumbnailPathname(
  userId: string,
  gameId: string,
  pathname: string,
) {
  if (
    !isSafeId(userId) ||
    !isSafeId(gameId) ||
    pathname.length > 512 ||
    pathname.includes("..")
  ) {
    return false;
  }
  const prefix = `users/${userId}/games/${gameId}/`;
  if (!pathname.startsWith(prefix)) return false;
  return /^thumbnail[-A-Za-z0-9_]*\.webp$/i.test(pathname.slice(prefix.length));
}

export function isOwnedUploadPathname(
  userId: string,
  pathname: string,
  kind: LabUploadKind,
  gameId?: string | null,
) {
  if (kind === "screenshot") {
    return isOwnedScreenshotPathname(userId, pathname);
  }
  return Boolean(gameId && isOwnedThumbnailPathname(userId, gameId, pathname));
}

export function isVercelBlobUrl(url: string) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === "blob.vercel-storage.com" ||
        parsed.hostname.endsWith(BLOB_HOST_SUFFIX))
    );
  } catch {
    return false;
  }
}

export function blobUrlMatchesPathname(url: string, pathname: string) {
  if (!isVercelBlobUrl(url)) return false;
  try {
    const parsed = new URL(url);
    const decoded = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    return decoded === pathname || decoded.endsWith(`/${pathname}`);
  } catch {
    return false;
  }
}
