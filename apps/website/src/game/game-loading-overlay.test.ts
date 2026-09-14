import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "@/app/game-assets/[...asset]/route";

import { GAME_PLAYER_CONTENT } from "./game-player-content";
import { loadingBackdrop } from "./platformer/art-catalog";
import { mazeLoadingBackdrop, resolveMazeVisuals } from "./top-down/art-catalog";

/**
 * Fetches the backdrop through the same route the browser uses, so a loading
 * screen pointed at a missing background fails here instead of showing a bare
 * colour to the player.
 */
async function servedStatus(url: string) {
  const asset = url.replace("/game-assets/", "").split("/");
  const response = await GET(new Request(`http://localhost${url}`), {
    params: Promise.resolve({ asset }),
  });
  return response.status;
}

test("every level the site plays has a furthest background to load behind", async () => {
  for (const { source, map } of GAME_PLAYER_CONTENT.maps) {
    const { color, imageUrl } = loadingBackdrop(map.presentation);
    assert.ok(color, `${source} backdrop colour`);
    assert.ok(imageUrl, `${source} furthest background`);
    assert.equal(await servedStatus(imageUrl), 200, imageUrl);
  }
});

/**
 * The furthest layer is the one that can stand alone. A mid or near layer is
 * drawn expecting something behind it, so picking the wrong one would show the
 * player a half-empty sky.
 */
test("the loading backdrop is the level's furthest parallax layer", () => {
  const greenHills = loadingBackdrop({ backgroundId: "neutral_green_hills_01" });
  assert.equal(
    greenHills.imageUrl,
    "/game-assets/backgrounds/background_neutral_green_hills_castle_far_01.png",
  );
});

/**
 * Mazes ship no background art, so their theme colour is the entire backdrop.
 * Distinct colours also prove none of the checked-in mazes quietly fell back to
 * the Green Hills profile.
 */
test("every maze the site plays loads behind its own theme colour", () => {
  const colors = GAME_PLAYER_CONTENT.mazes.map(({ source, map }) => {
    const { color, imageUrl } = mazeLoadingBackdrop(map.id);
    assert.equal(color, resolveMazeVisuals(map.id).color, source);
    assert.ok(color, `${source} backdrop colour`);
    assert.equal(imageUrl, undefined, `${source} has no background image`);
    return color;
  });

  assert.equal(new Set(colors).size, colors.length);
});
