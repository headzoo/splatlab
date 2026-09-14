import assert from "node:assert/strict";
import test from "node:test";

import { createSpritePreloader, spritePreloadTotal } from "./sprite-preload";

const fakeImage = {} as HTMLImageElement;
const loadNothing = async () => fakeImage;

test("the bar only ever moves forward, and lands exactly on full", async () => {
  const reported: number[] = [];
  const track = createSpritePreloader(4, (fraction) => reported.push(fraction), loadNothing);

  await Promise.all(["a", "b", "c", "d"].map(track));

  assert.deepEqual(reported, [0.25, 0.5, 0.75, 1]);
});

/**
 * A body can pull in a sheet the count did not anticipate. Overshooting would
 * render a fill wider than its track, so the fraction stays clamped.
 */
test("an unexpected extra download cannot push the bar past full", async () => {
  const reported: number[] = [];
  const track = createSpritePreloader(2, (fraction) => reported.push(fraction), loadNothing);

  await track("a");
  await track("b");
  await track("c");

  assert.deepEqual(reported, [0.5, 1, 1]);
});

test("a preloader with nothing to fetch cannot report a nonsense fraction", async () => {
  const reported: number[] = [];
  const track = createSpritePreloader(0, (fraction) => reported.push(fraction), loadNothing);

  await track("a");

  assert.deepEqual(reported, [1]);
});

/**
 * Only the recoloured human bodies fetch skin and hair masks, so the total has
 * to follow the body the player picked or the bar stalls short of full.
 */
test("the total counts the appearance masks only for bodies that use them", () => {
  assert.equal(
    spritePreloadTotal({ sheetCount: 10, playerAssetId: "neutral_human_01" }),
    12,
  );
  assert.equal(
    spritePreloadTotal({ sheetCount: 10, playerAssetId: "neutral_girl_01" }),
    12,
  );
  assert.equal(
    spritePreloadTotal({ sheetCount: 10, playerAssetId: "neutral_robot_01" }),
    10,
  );
  assert.equal(
    spritePreloadTotal({
      sheetCount: 10,
      playerAssetId: "neutral_robot_01",
      extraSheets: 2,
    }),
    12,
  );
});
