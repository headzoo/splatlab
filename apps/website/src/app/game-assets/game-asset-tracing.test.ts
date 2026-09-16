import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  gameRuntimeExcludedFiles,
  gameRuntimeFiles,
} from "../../../next.config";

import { GAME_ASSET_PATHS } from "./[...asset]/route";

/**
 * The tracing globs are resolved from the project root, the same way Next
 * resolves `outputFileTracingIncludes`, so a served path is compared as
 * `../game/<path>`.
 */
const tracedName = (assetPath: string) => `../game/${assetPath}`;

/**
 * Only `*` is supported on purpose. Next matches these with picomatch, which
 * also understands `**` and extglobs, so a pattern using them would be matched
 * too loosely here and the guard would pass while the build dropped files.
 * Refusing them keeps this honest rather than approximate.
 */
function matchesGlob(pattern: string, candidate: string) {
  assert.ok(
    !pattern.includes("**") && !/[?+@!()[\]{}]/.test(pattern),
    `${pattern} uses glob syntax this check cannot verify`,
  );
  const expression = pattern
    .split("*")
    .map((literal) => literal.replace(/[.+^${}()|[\]\\]/g, "\\$&"))
    .join("[^/]*");
  return new RegExp(`^${expression}$`).test(candidate);
}

/**
 * A matcher that accidentally matched everything would make the guards below
 * pass while the deployment still dropped files, so it is pinned here.
 */
test("the glob matcher discriminates", () => {
  assert.equal(matchesGlob("../game/sprites/*.png", "../game/sprites/a.png"), true);
  assert.equal(matchesGlob("../game/sprites/*.png", "../game/sprites/a.wav"), false);
  assert.equal(
    matchesGlob("../game/backgrounds/*.png", "../game/sprites/a.png"),
    false,
  );
  assert.equal(
    matchesGlob("../game/audio/*/*.wav", "../game/audio/space_basic_v1/jump.wav"),
    true,
  );
  assert.equal(
    matchesGlob("../game/sprites/*.png", "../game/sprites/nested/a.png"),
    false,
    "* must not cross a directory boundary",
  );
  assert.equal(
    matchesGlob(
      "../game/backgrounds/background_ice_world_*.png",
      "../game/backgrounds/background_space_moon_mid_01.png",
    ),
    false,
    "the glob list this replaced missed the Space backgrounds exactly this way",
  );
});

test("every asset the route serves is carried into the deployment", () => {
  const missing = GAME_ASSET_PATHS.filter(
    (assetPath) =>
      !gameRuntimeFiles.some((glob) => matchesGlob(glob, tracedName(assetPath))),
  );

  assert.deepEqual(
    missing,
    [],
    "these served assets match no outputFileTracingIncludes glob, so they would 404 in production",
  );
});

test("no asset the route serves is excluded from the deployment again", () => {
  const excluded = GAME_ASSET_PATHS.filter((assetPath) =>
    gameRuntimeExcludedFiles.some((glob) =>
      matchesGlob(glob, tracedName(assetPath)),
    ),
  );

  assert.deepEqual(excluded, [], "excludes are applied after includes and win");
});

/**
 * The generation masters are 188 MB against 8 MB of runtime sprites, so an
 * include glob that swept them in would bloat every deployment.
 */
test("the high-resolution generation masters stay out of the deployment", () => {
  assert.ok(
    gameRuntimeExcludedFiles.some((glob) =>
      matchesGlob(glob, "../game/sprites/neutral_lango_01-source.png"),
    ),
    "a -source master must be excluded",
  );
  assert.equal(
    GAME_ASSET_PATHS.some((assetPath) => assetPath.includes("-source")),
    false,
    "the route must never serve a generation master",
  );
});

/** A path in the allowlist that is not on disk is a guaranteed runtime 404. */
test("every asset the route promises to serve exists on disk", async () => {
  const absent: string[] = [];
  for (const assetPath of GAME_ASSET_PATHS) {
    try {
      await access(path.resolve(process.cwd(), `../game/${assetPath}`));
    } catch {
      absent.push(assetPath);
    }
  }

  assert.deepEqual(
    absent,
    [],
    "these allowlisted assets are missing from disk and would 404",
  );
});
