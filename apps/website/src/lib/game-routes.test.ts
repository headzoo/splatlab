import assert from "node:assert/strict";
import test from "node:test";

import { buildGamePath, playGamePath } from "./game-routes";

test("existing games use a build path segment instead of a query parameter", () => {
  assert.equal(buildGamePath("game-123"), "/build/game-123");
  assert.equal(buildGamePath("game/with spaces"), "/build/game%2Fwith%20spaces");
});

test("shared games use a play path segment", () => {
  assert.equal(playGamePath("game-123"), "/play/game-123");
  assert.equal(playGamePath("game/with spaces"), "/play/game%2Fwith%20spaces");
});
