import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "@/app/game-assets/[...asset]/route";
import { PLATFORMER_ART_SLOTS } from "@/lib/game-contract";

import {
  ART_WORLDS,
  collectedCoinAssetId,
  hazardSheetForAssetId,
  imageKeyForAssetId,
  resolveMapVisuals,
  themedObjectAssets,
  worldArtAssetId,
  worldsOwningSlot,
} from "./platformer/art-catalog";

const GREEN_HILLS = "neutral_green_hills_01";
const GRAVEYARD = "haunted_graveyard_01";
const DRAGON_WORLD = "dragons_emberkeep_01";
const ICE_WORLD = "ice_world_01";

/**
 * Art coverage is uneven, and that is the whole reason `set_level_art` has to
 * refuse some worlds. Locking the expected answer means new art showing up is
 * visible in review rather than silently widening what Cooper offers.
 */
test("only the worlds that drew a part are offered as lenders of it", () => {
  const owners = Object.fromEntries(
    PLATFORMER_ART_SLOTS.map((slot) => [
      slot,
      worldsOwningSlot(slot).map((world) => world.name),
    ]),
  );
  const everyWorld = ["Green Hills", "Graveyard", "Space", "Dragon World", "Ice World"];

  assert.deepEqual(owners, {
    ground: everyWorld,
    platform: everyWorld,
    obstacle: everyWorld,
    hazard: everyWorld,
    coin: ["Space", "Dragon World", "Ice World"],
    checkpoint: ["Space", "Dragon World"],
    goal: ["Space", "Dragon World"],
    spring: ["Graveyard", "Ice World"],
    flying: ["Green Hills", "Graveyard", "Dragon World"],
    enemy: everyWorld,
    boss: everyWorld,
  });
});

test("a borrowed hazard brings its own sheet geometry, not the level's", () => {
  const iceAlone = resolveMapVisuals({ backgroundId: ICE_WORLD });
  assert.deepEqual(
    { columns: iceAlone.hazardColumns, frames: iceAlone.hazardFrames },
    { columns: 2, frames: 4 },
  );

  // The Graveyard animates its hazard over eight frames in four columns, so
  // carrying the image across without the geometry would draw a sliced spike.
  const borrowed = resolveMapVisuals({
    backgroundId: ICE_WORLD,
    artBorrows: { hazard: GRAVEYARD },
  });
  assert.equal(borrowed.hazard, "hauntedHazard");
  assert.deepEqual(
    { columns: borrowed.hazardColumns, frames: borrowed.hazardFrames },
    { columns: 4, frames: 8 },
  );
  assert.equal(borrowed.ground, iceAlone.ground, "only the borrowed part changes");
});

test("a borrowed coin brings the frame it turns into when collected", () => {
  const borrowed = resolveMapVisuals({
    backgroundId: GREEN_HILLS,
    artBorrows: { coin: DRAGON_WORLD },
  });
  assert.equal(borrowed.coin, "dragonsCoin");
  assert.equal(borrowed.coinCollected, "dragonsCoinCollected");
});

test("borrowing from a level's own world leaves it exactly as it was", () => {
  assert.deepEqual(
    resolveMapVisuals({ backgroundId: ICE_WORLD, artBorrows: { platform: ICE_WORLD } }),
    resolveMapVisuals({ backgroundId: ICE_WORLD }),
  );
});

test("borrowed object art reaches newly placed objects too", () => {
  const themed = themedObjectAssets({
    backgroundId: ICE_WORLD,
    artBorrows: { enemy: DRAGON_WORLD, spring: GRAVEYARD },
  });
  assert.equal(themed.enemy, "dragon_ghost_01");
  assert.equal(themed.spring, "haunted_graveyard_platformer_spring_01");
  assert.equal(themed.boss, "ice_world_boss_01", "an unborrowed part keeps its own art");
});

/**
 * Anything holding a bare asset id - a tile painted from another world, a
 * pickup placed from one - has to reach the loaded image, and not every image
 * is keyed by its filename.
 */
test("every part of every world can be looked up by its asset id", () => {
  for (const world of ART_WORLDS) {
    for (const slot of PLATFORMER_ART_SLOTS) {
      const assetId = worldArtAssetId(world.id, slot);
      assert.ok(imageKeyForAssetId(assetId), `${world.id} ${slot} (${assetId})`);
    }
  }
  assert.equal(imageKeyForAssetId("hauntedHazard"), undefined, "keys are not asset ids");
});

test("a hand-picked hazard tile carries its lender's sheet geometry", () => {
  assert.deepEqual(
    hazardSheetForAssetId(worldArtAssetId(GRAVEYARD, "hazard")),
    { columns: 4, frames: 8 },
  );
  assert.deepEqual(
    hazardSheetForAssetId(worldArtAssetId(ICE_WORLD, "hazard")),
    { columns: 2, frames: 4 },
  );
  assert.equal(hazardSheetForAssetId(worldArtAssetId(GREEN_HILLS, "ground")), undefined);
});

test("a hand-picked coin knows the frame it turns into when collected", () => {
  for (const world of ART_WORLDS) {
    const collected = collectedCoinAssetId(worldArtAssetId(world.id, "coin"));
    assert.ok(imageKeyForAssetId(collected), collected);
  }
});

/**
 * Fetches through the same route the game and the builder buttons request, so
 * a slot pointing at art nobody shipped fails here rather than drawing nothing.
 */
async function assertSpriteIsServed(assetId: string) {
  const filename = `${assetId}.png`;
  const response = await GET(
    new Request(`http://localhost/game-assets/sprites/${filename}`),
    { params: Promise.resolve({ asset: ["sprites", filename] }) },
  );
  assert.equal(response.status, 200, filename);
}

test("every part of every world points at a sprite the site really serves", async () => {
  for (const world of ART_WORLDS) {
    for (const slot of PLATFORMER_ART_SLOTS) {
      await assertSpriteIsServed(worldArtAssetId(world.id, slot));
    }
  }
});
