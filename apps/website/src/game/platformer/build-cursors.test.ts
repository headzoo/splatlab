import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  PLATFORMER_OBJECT_TOOLS,
  isPlatformerPalettePaintTool,
  platformerEditorCursor,
  togglePlatformerPaletteTool,
} from "./map-editing";

const CURSOR_DIR = path.resolve(
  import.meta.dirname,
  "../../../public/brand/build",
);

test("palette paint tools toggle back to select when clicked again", () => {
  assert.equal(togglePlatformerPaletteTool("coin", "coin"), "select");
  assert.equal(togglePlatformerPaletteTool("ground", "coin"), "coin");
  assert.equal(togglePlatformerPaletteTool("select", "coin"), "coin");
});

test("isPlatformerPalettePaintTool covers terrain and object palette tools only", () => {
  assert.equal(isPlatformerPalettePaintTool("coin"), true);
  assert.equal(isPlatformerPalettePaintTool("hazard"), true);
  assert.equal(isPlatformerPalettePaintTool("erase"), false);
  assert.equal(isPlatformerPalettePaintTool("move"), false);
  assert.equal(isPlatformerPalettePaintTool("select"), false);
});

test("platformerEditorCursor maps build tools to cursor modes", () => {
  assert.equal(platformerEditorCursor(undefined), undefined);
  assert.equal(platformerEditorCursor("move"), "pan");
  assert.equal(platformerEditorCursor("select"), "select");
  assert.equal(platformerEditorCursor("erase"), "erase");

  for (const tool of ["ground", "platform", "obstacle", "hazard"] as const) {
    assert.equal(platformerEditorCursor(tool), "paint", tool);
  }

  for (const tool of PLATFORMER_OBJECT_TOOLS) {
    assert.equal(platformerEditorCursor(tool), "paint", tool);
  }
});

test("build editor cursor PNGs are checked in and non-empty", () => {
  for (const filename of ["paint-brush-cursor.png", "eraser-cursor.png"]) {
    const filePath = path.join(CURSOR_DIR, filename);
    const bytes = readFileSync(filePath);
    assert.ok(bytes.byteLength > 0, filename);
    assert.equal(bytes[0], 0x89);
    assert.equal(bytes[1], 0x50);
    assert.equal(bytes[2], 0x4e);
    assert.equal(bytes[3], 0x47);
  }
});
