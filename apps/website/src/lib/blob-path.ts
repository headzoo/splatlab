export const SCREENSHOT_MAX_BYTES = 8 * 1024 * 1024;
export const THUMBNAIL_MAX_BYTES = 1 * 1024 * 1024;
export const MAX_SCREENSHOTS_PER_USER = 48;

const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const BLOB_HOST_SUFFIX = ".blob.vercel-storage.com";

export type LabUploadKind = "screenshot" | "thumbnail";

export function isSafeId(value: string) {
  return SAFE_ID.test(value) && value.length > 0 && value.length <= 80;
}

export function screenshotBlobPathname(userId: string, mediaId: string) {
  if (!isSafeId(userId) || !isSafeId(mediaId)) {
    throw new Error("Invalid screenshot path.");
  }
  return `users/${userId}/screenshots/${mediaId}.png`;
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
