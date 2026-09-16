import { PLATFORMER_ART_SLOTS, type PlayerAssetId } from "@/lib/game-contract";

import {
  collectedCoinAssetId,
  imageKeyForAssetId,
  IMAGE_URLS,
  resolveMapVisuals,
  worldArtAssetId,
  type ImageKey,
} from "./art-catalog";
import { playerAttackEventSheet } from "./player-attack";
import { playerDefeatedEventSheet } from "./player-death";
import type { PlatformerMapSpec } from "./types";

/**
 * The sheets one level needs before it can draw.
 *
 * The runtime used to fetch all 107 entries in `IMAGE_URLS` for every level,
 * which meant a Space level downloaded Dragon World's backgrounds and every
 * other world's bosses to show a starfield. Backgrounds alone were 22.6 MB.
 *
 * This walks the *composed* map - the one `GamePlayer` builds from the saved
 * game's terrain, object, and art edits - so borrowed art is included wherever
 * a kid put it. A level's own world is only the starting point.
 */
export function platformerLevelSheets(
  map: PlatformerMapSpec,
  playerAssetId: PlayerAssetId,
): ImageKey[] {
  const keys = new Set<ImageKey>();

  /**
   * Mirrors how the canvas looks a sheet up: an asset id first, then the id
   * used directly as a key. Unlike the canvas this refuses a key that is not
   * really in the catalog, so a typo cannot become a silent fetch of nothing.
   */
  const addAsset = (assetId: string | undefined) => {
    if (!assetId) return;
    const key = imageKeyForAssetId(assetId)
      ?? (assetId in IMAGE_URLS ? (assetId as ImageKey) : undefined);
    if (key) keys.add(key);
  };

  // The level's own kit, with every borrowed slot already swapped in. The
  // terrain and pickup sheets are taken as a set rather than matched against
  // the tiles actually painted: all eight are about 110 KB together, and a
  // level that gains its first hazard mid-edit should not pop a blank tile.
  const visuals = resolveMapVisuals(map.presentation);
  for (const layer of visuals.backgroundLayers) keys.add(layer.image);
  keys.add(visuals.ground);
  keys.add(visuals.platform);
  keys.add(visuals.obstacle);
  keys.add(visuals.hazard);
  keys.add(visuals.coin);
  keys.add(visuals.coinCollected);
  keys.add(visuals.checkpoint);
  keys.add(visuals.goal);

  // A tile painted from another world names its own art, so one level can show
  // Graveyard ground beside its own.
  for (const layer of map.layers) {
    for (const override of layer.spriteOverrides ?? []) {
      addAsset(override.assetId);
    }
  }

  const objectTypes = new Set(map.objects.map((object) => object.type));

  for (const object of map.objects) {
    addAsset(object.assetId);
    if (object.assetId) {
      if (object.type === "collectible") {
        addAsset(collectedCoinAssetId(object.assetId));
      }
      if (object.type === "platform_spring") {
        addAsset(`${object.assetId}_compressed`);
      }
    }
    // Projectiles are never placed, so they are only discoverable here.
    if (object.rangedAttack && "projectileAssetId" in object.rangedAttack) {
      addAsset(object.rangedAttack.projectileAssetId);
    }
  }

  // The canvas falls back to these when an object names art the level did not
  // load. That only ever worked because everything was loaded, so each one is
  // brought along exactly when the object type that can reach it is present.
  if (objectTypes.has("enemy_spawn")) addAsset("neutral_ghost_01");
  if (objectTypes.has("flying_object")) {
    addAsset("neutral_green_hills_flying_cooper_01");
  }
  if (objectTypes.has("platform_spring")) {
    addAsset("ice_world_platformer_spring_01");
    addAsset("ice_world_platformer_spring_01_compressed");
  }
  if (objectTypes.has("extra_life")) keys.add("extraLife");

  for (const entry of map.presentation.hud ?? []) {
    keys.add(entry.type === "lives" ? "hudLife" : "hudCoin");
  }

  // Bursts fire on an extra life and on winning, so they are needed by any
  // level that can be finished.
  keys.add("victory");
  keys.add("weapon");

  // The hero, plus the event sheets only some bodies have.
  addAsset(playerAssetId);
  addAsset(playerAttackEventSheet(playerAssetId)?.imageAssetId);
  addAsset(playerDefeatedEventSheet(playerAssetId)?.imageAssetId);

  return [...keys];
}

/**
 * Every sheet a world can lend, for warming up a palette the moment a kid
 * selects that world rather than when they place their first tile from it.
 *
 * The toolbox buttons fetch their own previews through CSS, so without this the
 * art is proven to exist on a button while the canvas still has nothing to draw
 * with.
 */
export function platformerWorldPaletteSheets(worldId: string): ImageKey[] {
  const keys = new Set<ImageKey>();
  const add = (assetId: string) => {
    const key = imageKeyForAssetId(assetId)
      ?? (assetId in IMAGE_URLS ? (assetId as ImageKey) : undefined);
    if (key) keys.add(key);
  };

  for (const slot of PLATFORMER_ART_SLOTS) {
    const assetId = worldArtAssetId(worldId, slot);
    add(assetId);
    if (slot === "coin") add(collectedCoinAssetId(assetId));
    if (slot === "spring") add(`${assetId}_compressed`);
  }

  return [...keys];
}
