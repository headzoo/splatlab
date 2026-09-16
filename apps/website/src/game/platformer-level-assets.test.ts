import assert from "node:assert/strict";
import test from "node:test";

import { ART_WORLD_IDS, PLATFORMER_ART_SLOTS } from "@/lib/game-contract";

import { GAME_PLAYER_CONTENT } from "./game-player-content";
import {
  collectedCoinAssetId,
  imageKeyForAssetId,
  IMAGE_URLS,
  worldArtAssetId,
  type ImageKey,
} from "./platformer/art-catalog";
import {
  platformerLevelSheets,
  platformerWorldPaletteSheets,
} from "./platformer/level-assets";
import type { PlatformerMapSpec } from "./platformer/types";
import { mazeLevelSheets } from "./top-down/art-catalog";

const campaign = GAME_PLAYER_CONTENT.maps;

/** Every asset id a map names, by any of the routes the canvas reads. */
function assetsNamedBy(map: PlatformerMapSpec) {
  const named = new Set<string>();
  for (const layer of map.layers) {
    for (const override of layer.spriteOverrides ?? []) {
      if (override.assetId) named.add(override.assetId);
    }
  }
  for (const object of map.objects) {
    if (object.assetId) {
      named.add(object.assetId);
      if (object.type === "collectible") {
        named.add(collectedCoinAssetId(object.assetId));
      }
      if (object.type === "platform_spring") {
        named.add(`${object.assetId}_compressed`);
      }
    }
    if (object.rangedAttack && "projectileAssetId" in object.rangedAttack) {
      named.add(object.rangedAttack.projectileAssetId);
    }
  }
  return named;
}

test("every asset a checked-in level names is preloaded", () => {
  for (const { source, map } of campaign) {
    const sheets = new Set(platformerLevelSheets(map, "neutral_cooper_01"));
    for (const assetId of assetsNamedBy(map)) {
      const key = imageKeyForAssetId(assetId)
        ?? (assetId in IMAGE_URLS ? (assetId as ImageKey) : undefined);
      if (!key) continue;
      assert.ok(sheets.has(key), `${source} never loads ${assetId}`);
    }
  }
});

test("a level only preloads sheets the catalog really has", () => {
  for (const { source, map } of campaign) {
    for (const key of platformerLevelSheets(map, "neutral_human_01")) {
      assert.ok(key in IMAGE_URLS, `${source} asked for ${key}`);
    }
  }
});

/**
 * Backgrounds are the whole reason this exists: they were 22.6 MB of the 27.1 MB
 * every level used to download, and no level can borrow another world's.
 */
test("a level loads its own backgrounds and nobody else's", () => {
  const iceWorld = campaign.find(
    (level) => level.map.presentation.backgroundId === "ice_world_01",
  );
  assert.ok(iceWorld);
  const urls = platformerLevelSheets(iceWorld.map, "neutral_cooper_01").map(
    (key) => IMAGE_URLS[key],
  );
  const backgrounds = urls.filter((url) => url.includes("/backgrounds/"));

  assert.equal(backgrounds.length, 3, "Ice World wears three parallax layers");
  for (const url of backgrounds) {
    assert.match(url, /background_ice_world_/, url);
  }
});

test("no level preloads the whole catalog any more", () => {
  for (const { source, map } of campaign) {
    const count = platformerLevelSheets(map, "neutral_cooper_01").length;
    assert.ok(
      count < Object.keys(IMAGE_URLS).length / 2,
      `${source} still loads ${count} of ${Object.keys(IMAGE_URLS).length} sheets`,
    );
  }
});

/**
 * A kid can paint one tile from another world without borrowing the slot, so a
 * per-tile override is the one route that can name anything at all.
 */
test("a tile painted from another world brings that world's sheet", () => {
  const greenHills = campaign[0].map;
  const borrowed = worldArtAssetId("haunted_graveyard_01", "ground");
  const painted: PlatformerMapSpec = {
    ...greenHills,
    layers: greenHills.layers.map((layer) =>
      layer.id === "terrain"
        ? { ...layer, spriteOverrides: [{ x: 1, y: 1, assetId: borrowed }] }
        : layer,
    ),
  };

  const before = new Set(platformerLevelSheets(greenHills, "neutral_cooper_01"));
  const after = new Set(platformerLevelSheets(painted, "neutral_cooper_01"));
  const key = imageKeyForAssetId(borrowed);

  assert.ok(key);
  assert.equal(before.has(key), false, "Green Hills does not wear it already");
  assert.ok(after.has(key), "painting it must load it");
});

/**
 * The builder allows every slot to come from a different world at once. That is
 * the worst case for this collector, so it is pinned rather than assumed.
 */
test("a level borrowing every slot from every world resolves every sheet", () => {
  const base = campaign[0].map;
  const artBorrows = Object.fromEntries(
    PLATFORMER_ART_SLOTS.map((slot, index) => [
      slot,
      ART_WORLD_IDS[index % ART_WORLD_IDS.length],
    ]),
  );
  const mixed: PlatformerMapSpec = {
    ...base,
    presentation: { ...base.presentation, artBorrows },
    // One tile painted from each world, on top of the borrows.
    layers: base.layers.map((layer) =>
      layer.id === "terrain"
        ? {
            ...layer,
            spriteOverrides: ART_WORLD_IDS.map((world, index) => ({
              x: index + 1,
              y: 1,
              assetId: worldArtAssetId(world, "ground"),
            })),
          }
        : layer,
    ),
  };

  const sheets = platformerLevelSheets(mixed, "neutral_human_01");

  for (const key of sheets) {
    assert.ok(key in IMAGE_URLS, `mixed level asked for ${key}`);
  }
  for (const world of ART_WORLD_IDS) {
    const key = imageKeyForAssetId(worldArtAssetId(world, "ground"));
    assert.ok(key);
    assert.ok(sheets.includes(key), `mixed level never loads ${world} ground`);
  }
  // Still nowhere near the whole catalog, because backgrounds cannot be
  // borrowed and objects only cost what is actually placed.
  assert.ok(
    sheets.length < Object.keys(IMAGE_URLS).length / 2,
    `mixed level loads ${sheets.length} sheets`,
  );
});

test("a hero's attack and defeat sheets travel with the hero", () => {
  const map = campaign[0].map;
  const cooper = platformerLevelSheets(map, "space_cooper_01");

  assert.ok(cooper.includes("space_cooper_01"));
  assert.ok(cooper.includes("space_cooper_01_attack"));
  assert.ok(cooper.includes("space_cooper_01_defeated"));

  // Rupert has no event art at all, so nothing extra may be demanded for him.
  const rupert = platformerLevelSheets(map, "neutral_rupert_01");
  assert.ok(rupert.includes("neutral_rupert_01"));
  assert.equal(
    rupert.some((key) => key.endsWith("_attack")),
    false,
  );
});

/**
 * The canvas falls back to these when an object names art the level does not
 * wear. That only worked because everything was loaded, so a level without the
 * matching object type must not pay for them - and one with it must.
 */
test("a draw-time fallback is loaded only when its object type is present", () => {
  const base = campaign[0].map;
  const withoutEnemies: PlatformerMapSpec = {
    ...base,
    objects: base.objects.filter((object) => object.type !== "enemy_spawn"),
  };

  assert.ok(
    platformerLevelSheets(base, "neutral_cooper_01").includes("neutral_ghost_01"),
    "a level with enemies needs the fallback enemy sheet",
  );
  assert.equal(
    platformerLevelSheets(withoutEnemies, "neutral_cooper_01").includes(
      "neutral_ghost_01",
    ),
    false,
    "a level with no enemies must not fetch it",
  );
});

test("a palette world offers every slot it can lend, and only real sheets", () => {
  for (const world of ART_WORLD_IDS) {
    const sheets = platformerWorldPaletteSheets(world);
    for (const key of sheets) {
      assert.ok(key in IMAGE_URLS, `${world} palette asked for ${key}`);
    }
    for (const slot of PLATFORMER_ART_SLOTS) {
      const key = imageKeyForAssetId(worldArtAssetId(world, slot));
      assert.ok(key);
      assert.ok(sheets.includes(key), `${world} palette omits ${slot}`);
    }
  }
});

test("a maze loads its own theme's tiles and nobody else's", () => {
  for (const { source, map } of GAME_PLAYER_CONTENT.mazes) {
    const sheets = mazeLevelSheets(map.id);

    assert.equal(sheets.length, 7, `${source} loads seven sheets`);
    assert.equal(new Set(sheets).size, 7, `${source} has no duplicates`);
    assert.ok(sheets.includes("enemy"));
    assert.ok(sheets.includes("hazard"));

    // The five themed slots must all share one prefix, or the maze is mixing
    // themes it never asked for.
    const themed = sheets.filter((key) => key !== "enemy" && key !== "hazard");
    const prefixes = new Set(
      themed.map((key) => key.replace(/(Floor|Wall|Obstacle|Key|Door)$/, "")),
    );
    assert.equal(prefixes.size, 1, `${source} mixes themes: ${[...themed]}`);
  }
});
