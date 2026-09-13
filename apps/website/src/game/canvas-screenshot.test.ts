import assert from "node:assert/strict";
import test from "node:test";

import {
  buildScreenshotFilename,
  createCanvasScreenshotBlob,
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
