import assert from "node:assert/strict";
import test from "node:test";

import { buildGamePath } from "./game-routes";

test("existing games use a build path segment instead of a query parameter", () => {
  assert.equal(buildGamePath("game-123"), "/build/game-123");
  assert.equal(buildGamePath("game/with spaces"), "/build/game%2Fwith%20spaces");
});
