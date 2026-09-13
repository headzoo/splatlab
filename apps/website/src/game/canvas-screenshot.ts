const PNG_MIME_TYPE = "image/png";
const WEBP_MIME_TYPE = "image/webp";
const THUMBNAIL_MAX_WIDTH = 720;
const THUMBNAIL_WEBP_QUALITY = 0.82;

type ScreenshotCanvas = Pick<HTMLCanvasElement, "toBlob">;

export type GameThumbnailCapture = () => Promise<string>;

export function buildScreenshotFilename(
  gameId: string,
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

  return `splat-lab-${safeGameId}-${timestamp}.png`;
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

function createCanvasThumbnailBlob(canvas: ScreenshotCanvas) {
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

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("The game thumbnail could not be read."));
    }, { once: true });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("The game thumbnail could not be read."));
    }, { once: true });
    reader.readAsDataURL(blob);
  });
}

export async function createCanvasThumbnailDataUrl(
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
  return blobToDataUrl(await createCanvasThumbnailBlob(thumbnail));
}

export async function downloadCanvasScreenshot(
  canvas: ScreenshotCanvas,
  gameId: string,
) {
  const blob = await createCanvasScreenshotBlob(canvas);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const filename = buildScreenshotFilename(gameId);

  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);

  return filename;
}
