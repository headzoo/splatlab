const PNG_MIME_TYPE = "image/png";
const WEBP_MIME_TYPE = "image/webp";
const THUMBNAIL_MAX_WIDTH = 720;
const THUMBNAIL_WEBP_QUALITY = 0.82;

type ScreenshotCanvas = Pick<HTMLCanvasElement, "toBlob">;

export type GameThumbnailCapture = () => Promise<Blob>;

function buildMediaFilename(
  gameId: string,
  extension: "png" | "mp4",
  capturedAt = new Date(),
) {
  const safeGameId = gameId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "game";
  const timestamp = capturedAt
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replaceAll(":", "-");

  return `splat-lab-${safeGameId}-${timestamp}.${extension}`;
}

export function buildScreenshotFilename(
  gameId: string,
  capturedAt = new Date(),
) {
  return buildMediaFilename(gameId, "png", capturedAt);
}

export function buildVideoFilename(gameId: string, capturedAt = new Date()) {
  return buildMediaFilename(gameId, "mp4", capturedAt);
}

export function createCanvasScreenshotBlob(canvas: ScreenshotCanvas) {
  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("The game canvas could not be saved as a PNG."));
      }, PNG_MIME_TYPE);
    } catch (error) {
      reject(error);
    }
  });
}

export function gameThumbnailDimensions(width: number, height: number) {
  if (width <= 0 || height <= 0) {
    return { width: 1, height: 1 };
  }

  const scale = Math.min(1, THUMBNAIL_MAX_WIDTH / width);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function encodeCanvasThumbnailBlob(canvas: ScreenshotCanvas) {
  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("The game thumbnail could not be created."));
      }, WEBP_MIME_TYPE, THUMBNAIL_WEBP_QUALITY);
    } catch (error) {
      reject(error);
    }
  });
}

export async function createCanvasThumbnailBlob(
  source: HTMLCanvasElement,
) {
  const dimensions = gameThumbnailDimensions(source.width, source.height);
  const thumbnail = document.createElement("canvas");
  thumbnail.width = dimensions.width;
  thumbnail.height = dimensions.height;
  const context = thumbnail.getContext("2d");

  if (!context) {
    throw new Error("The game thumbnail canvas is unavailable.");
  }

  context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0, dimensions.width, dimensions.height);
  return encodeCanvasThumbnailBlob(thumbnail);
}

export async function createVideoCapturePosterBlob(
  source: HTMLCanvasElement,
) {
  const dimensions = gameThumbnailDimensions(source.width, source.height);
  const poster = document.createElement("canvas");
  poster.width = dimensions.width;
  poster.height = dimensions.height;
  const context = poster.getContext("2d");

  if (!context) {
    throw new Error("The video poster canvas is unavailable.");
  }

  context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0, dimensions.width, dimensions.height);
  return createCanvasScreenshotBlob(poster);
}

export function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadBlobFromUrl(url: string, filename: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("The file could not be downloaded.");
  }
  triggerBrowserDownload(await response.blob(), filename);
}
