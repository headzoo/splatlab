import assert from "node:assert/strict";
import test from "node:test";

import {
  buildScreenshotFilename,
  buildVideoFilename,
  createCanvasScreenshotBlob,
  createVideoCapturePosterBlob,
  gameThumbnailDimensions,
} from "./canvas-screenshot";

test("screenshot filenames are safe, map-specific PNG names", () => {
  const filename = buildScreenshotFilename(
    " Haunted Maze / Level 1 ",
    new Date("2026-09-13T14:05:09.123Z"),
  );

  assert.equal(
    filename,
    "splat-lab-haunted-maze-level-1-2026-09-13T14-05-09Z.png",
  );
});

test("video filenames are safe, map-specific MP4 names", () => {
  const filename = buildVideoFilename(
    " Haunted Maze / Level 1 ",
    new Date("2026-09-13T14:05:09.123Z"),
  );

  assert.equal(
    filename,
    "splat-lab-haunted-maze-level-1-2026-09-13T14-05-09Z.mp4",
  );
});

test("canvas screenshots request a PNG blob", async () => {
  const expected = new Blob(["png"], { type: "image/png" });
  let requestedType = "";
  const canvas = {
    toBlob(callback: BlobCallback, type?: string) {
      requestedType = type ?? "";
      callback(expected);
    },
  } as Pick<HTMLCanvasElement, "toBlob">;

  const actual = await createCanvasScreenshotBlob(canvas);

  assert.equal(requestedType, "image/png");
  assert.equal(actual, expected);
});

test("canvas screenshot export fails when the browser returns no blob", async () => {
  const canvas = {
    toBlob(callback: BlobCallback) {
      callback(null);
    },
  } as Pick<HTMLCanvasElement, "toBlob">;

  await assert.rejects(
    createCanvasScreenshotBlob(canvas),
    /could not be saved as a PNG/,
  );
});

test("video capture posters request a scaled PNG blob", async () => {
  const expected = new Blob(["png"], { type: "image/png" });
  let requestedType = "";
  const source = {
    width: 1920,
    height: 1080,
  } as HTMLCanvasElement;
  const posterCanvas = {
    width: 720,
    height: 405,
    getContext: () => ({
      imageSmoothingEnabled: true,
      drawImage: () => undefined,
    }),
    toBlob(callback: BlobCallback, type?: string) {
      requestedType = type ?? "";
      callback(expected);
    },
  } as unknown as HTMLCanvasElement;

  const originalCreateElement = globalThis.document?.createElement;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: (tag: string) => (tag === "canvas" ? posterCanvas : originalCreateElement?.call(document, tag)),
    },
  });

  try {
    const actual = await createVideoCapturePosterBlob(source);
    assert.equal(requestedType, "image/png");
    assert.equal(actual, expected);
  } finally {
    if (originalCreateElement) {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: globalThis.document,
      });
    }
  }
});

test("game thumbnails preserve their ratio and stay within 720 pixels wide", () => {
  assert.deepEqual(gameThumbnailDimensions(1920, 1080), {
    width: 720,
    height: 405,
  });
  assert.deepEqual(gameThumbnailDimensions(640, 480), {
    width: 640,
    height: 480,
  });
});
