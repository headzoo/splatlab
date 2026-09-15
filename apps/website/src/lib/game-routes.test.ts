import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGamePath,
  mediaEmbedPath,
  mediaSharePath,
  playGamePath,
} from "./game-routes";

test("existing games use a build path segment instead of a query parameter", () => {
  assert.equal(buildGamePath("game-123"), "/build/game-123");
  assert.equal(buildGamePath("game/with spaces"), "/build/game%2Fwith%20spaces");
});

test("shared games use a play path segment", () => {
  assert.equal(playGamePath("game-123"), "/play/game-123");
  assert.equal(playGamePath("game/with spaces"), "/play/game%2Fwith%20spaces");
});

test("shared screenshots use a media path segment", () => {
  assert.equal(mediaSharePath("shot-123"), "/media/shot-123");
  assert.equal(mediaSharePath("shot/with spaces"), "/media/shot%2Fwith%20spaces");
});

test("shared videos use an embed path segment", () => {
  assert.equal(mediaEmbedPath("clip-123"), "/media/clip-123/embed");
  assert.equal(
    mediaEmbedPath("clip/with spaces"),
    "/media/clip%2Fwith%20spaces/embed",
  );
});
