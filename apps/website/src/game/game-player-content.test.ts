import assert from "node:assert/strict";
import test from "node:test";

import { GAME_PLAYER_CONTENT } from "./game-player-content";

test("platformer content follows the displayed campaign order", () => {
  assert.deepEqual(
    GAME_PLAYER_CONTENT.maps.map(({ source, label }) => ({ source, label })),
    [
      { source: "level-1.json", label: "Green Hills" },
      { source: "level-3.json", label: "Graveyard" },
      { source: "level-2.json", label: "Space" },
      { source: "level-4.json", label: "Dragon World" },
    ],
  );
});
