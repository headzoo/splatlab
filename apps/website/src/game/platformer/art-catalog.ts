import {
  ART_WORLD_IDS,
  PLATFORMER_ART_SLOTS,
  type ArtWorldId,
  type PlatformerArtSlot,
} from "@/lib/game-contract";

import { GAME_PLAYER_CONTENT } from "../game-player-content";

export { PLATFORMER_ART_SLOTS, type PlatformerArtSlot };

/**
 * Every image the platformer can draw, and which of them each world wears.
 *
 * This is the only table that decides what a world looks like. The canvas, the
 * builder's terrain and object buttons, and Cooper's tools all read it, so a
 * world cannot look like one thing in the game and another on a button.
 */
export const assetUrl = (path: string) => `/game-assets/${path}`;

export const IMAGE_URLS = {
  greenBackgroundFar: assetUrl("backgrounds/background_neutral_green_hills_castle_far_01.png"),
  greenBackgroundMid: assetUrl("backgrounds/background_neutral_green_hills_waterfalls_mid_01.png"),
  greenBackgroundNear: assetUrl("backgrounds/background_neutral_green_hills_foliage_near_01.png"),
  spaceBackgroundFar: assetUrl("backgrounds/background_space_stars_far_01.png"),
  spaceBackgroundMid: assetUrl("backgrounds/background_space_moon_mid_01.png"),
  spaceBackgroundNear: assetUrl("backgrounds/background_space_station_near_01.png"),
  hauntedBackground: assetUrl("backgrounds/background_haunted_graveyard_01.png"),
  dragonsBackgroundFar: assetUrl("backgrounds/background_dragons_ash_far_01.png"),
  dragonsBackgroundMid: assetUrl("backgrounds/background_dragons_volcano_mid_01.png"),
  dragonsBackgroundNear: assetUrl("backgrounds/background_dragons_ruins_near_01.png"),
  iceBackgroundFar: assetUrl("backgrounds/background_ice_world_mountains_far_01.png"),
  iceBackgroundMid: assetUrl("backgrounds/background_ice_world_glaciers_mid_01.png"),
  iceBackgroundNear: assetUrl("backgrounds/background_ice_world_crystals_near_01.png"),
  greenGround: assetUrl("sprites/neutral_green_hills_platformer_ground_01.png"),
  greenPlatform: assetUrl("sprites/neutral_green_hills_platformer_platform_01.png"),
  greenObstacle: assetUrl("sprites/neutral_green_hills_platformer_obstacle_01.png"),
  greenHazard: assetUrl("sprites/neutral_green_hills_platformer_hazard_01.png"),
  spaceGround: assetUrl("sprites/space_platformer_ground_01.png"),
  spacePlatform: assetUrl("sprites/space_platformer_platform_01.png"),
  spaceObstacle: assetUrl("sprites/space_platformer_obstacle_01.png"),
  spaceHazard: assetUrl("sprites/space_platformer_hazard_01.png"),
  hauntedGround: assetUrl("sprites/haunted_graveyard_platformer_ground_01.png"),
  hauntedPlatform: assetUrl("sprites/haunted_graveyard_platformer_platform_01.png"),
  hauntedObstacle: assetUrl("sprites/haunted_graveyard_platformer_obstacle_01.png"),
  hauntedHazard: assetUrl("sprites/haunted_graveyard_platformer_hazard_01.png"),
  haunted_graveyard_platformer_spring_01: assetUrl("sprites/haunted_graveyard_platformer_spring_01.png"),
  haunted_graveyard_platformer_spring_01_compressed: assetUrl("sprites/haunted_graveyard_platformer_spring_01_compressed.png"),
  dragonsGround: assetUrl("sprites/dragons_emberkeep_platformer_ground_01.png"),
  dragonsPlatform: assetUrl("sprites/dragons_emberkeep_platformer_platform_01.png"),
  dragonsObstacle: assetUrl("sprites/dragons_emberkeep_platformer_obstacle_01.png"),
  dragonsHazard: assetUrl("sprites/dragons_emberkeep_platformer_hazard_01.png"),
  iceGround: assetUrl("sprites/ice_world_platformer_ground_01.png"),
  icePlatform: assetUrl("sprites/ice_world_platformer_platform_01.png"),
  iceObstacle: assetUrl("sprites/ice_world_platformer_obstacle_01.png"),
  iceHazard: assetUrl("sprites/ice_world_platformer_hazard_01.png"),
  ice_world_cooper_01: assetUrl("sprites/ice_world_cooper_01.png"),
  ice_world_human_01: assetUrl("sprites/ice_world_human_01.png"),
  ice_world_girl_01: assetUrl("sprites/ice_world_girl_01.png"),
  ice_world_ghost_01: assetUrl("sprites/ice_world_ghost_01.png"),
  ice_world_robot_01: assetUrl("sprites/ice_world_robot_01.png"),
  ice_world_platformer_spring_01: assetUrl("sprites/ice_world_platformer_spring_01.png"),
  ice_world_platformer_spring_01_compressed: assetUrl("sprites/ice_world_platformer_spring_01_compressed.png"),
  neutral_cooper_01: assetUrl("sprites/neutral_cooper_01.png"),
  neutral_human_01: assetUrl("sprites/neutral_human_01.png"),
  neutral_girl_01: assetUrl("sprites/neutral_girl_01.png"),
  neutral_ghost_01: assetUrl("sprites/neutral_ghost_01.png"),
  neutral_robot_01: assetUrl("sprites/neutral_robot_01.png"),
  haunted_cooper_01: assetUrl("sprites/haunted_cooper_01.png"),
  haunted_human_01: assetUrl("sprites/haunted_human_01.png"),
  haunted_girl_01: assetUrl("sprites/haunted_girl_01.png"),
  haunted_ghost_01: assetUrl("sprites/haunted_ghost_01.png"),
  haunted_robot_01: assetUrl("sprites/haunted_robot_01.png"),
  space_cooper_01: assetUrl("sprites/space_cooper_01.png"),
  space_human_01: assetUrl("sprites/space_human_01.png"),
  space_girl_01: assetUrl("sprites/space_girl_01.png"),
  space_ghost_01: assetUrl("sprites/space_ghost_01.png"),
  space_robot_01: assetUrl("sprites/space_robot_01.png"),
  dragon_cooper_01: assetUrl("sprites/dragon_cooper_01.png"),
  dragon_human_01: assetUrl("sprites/dragon_human_01.png"),
  dragon_girl_01: assetUrl("sprites/dragon_girl_01.png"),
  dragon_ghost_01: assetUrl("sprites/dragon_ghost_01.png"),
  space_cooper_01_attack: assetUrl("sprites/space_cooper_01_attack.png"),
  space_human_01_attack: assetUrl("sprites/space_human_01_attack.png"),
  space_cooper_01_defeated: assetUrl("sprites/space_cooper_01_defeated.png"),
  space_human_01_defeated: assetUrl("sprites/space_human_01_defeated.png"),
  space_ghost_01_defeated: assetUrl("sprites/space_ghost_01_defeated.png"),
  space_robot_01_defeated: assetUrl("sprites/space_robot_01_defeated.png"),
  weapon: assetUrl("sprites/short_sword_v1.png"),
  spaceCoin: assetUrl("sprites/space_platformer_coin_01.png"),
  spaceCoinCollected: assetUrl("sprites/space_platformer_coin_01_collected.png"),
  spaceCheckpoint: assetUrl("sprites/space_platformer_checkpoint_01.png"),
  spaceGoal: assetUrl("sprites/space_platformer_goal_01.png"),
  dragonsCoin: assetUrl("sprites/dragons_emberkeep_platformer_coin_01.png"),
  dragonsCoinCollected: assetUrl("sprites/dragons_emberkeep_platformer_coin_01_collected.png"),
  iceCoin: assetUrl("sprites/ice_world_platformer_coin_01.png"),
  iceCoinCollected: assetUrl("sprites/ice_world_platformer_coin_01_collected.png"),
  dragonsCheckpoint: assetUrl("sprites/dragons_emberkeep_platformer_checkpoint_01.png"),
  dragonsGoal: assetUrl("sprites/dragons_emberkeep_platformer_goal_01.png"),
  hudCoin: assetUrl("sprites/space_platformer_hud_coins_01.png"),
  hudLife: assetUrl("sprites/space_platformer_hud_lives_01.png"),
  extraLife: assetUrl("sprites/shared_platformer_easter_egg_01.png"),
  victory: assetUrl("sprites/shared_victory_burst_01.png"),
  neutral_zombie_01: assetUrl("sprites/neutral_zombie_01.png"),
  neutral_green_hills_boss_01: assetUrl("sprites/neutral_green_hills_boss_01.png"),
  neutral_green_hills_flying_cooper_01: assetUrl("sprites/neutral_green_hills_flying_cooper_01.png"),
  space_boss_01: assetUrl("sprites/space_boss_01.png"),
  haunted_spirit_orb_01: assetUrl("sprites/haunted_spirit_orb_01.png"),
  haunted_boss_01: assetUrl("sprites/haunted_boss_01.png"),
  haunted_flying_cooper_bat_01: assetUrl("sprites/haunted_flying_cooper_bat_01.png"),
  haunted_tombstone_01: assetUrl("sprites/haunted_tombstone_01.png"),
  haunted_graveyard_flaming_pumpkin_01: assetUrl("sprites/haunted_graveyard_flaming_pumpkin_01.png"),
  dragon_dragon_01: assetUrl("sprites/dragon_dragon_01.png"),
  dragons_emberkeep_fireball_01: assetUrl("sprites/dragons_emberkeep_fireball_01.png"),
  dragons_emberkeep_flying_fireball_01: assetUrl("sprites/dragons_emberkeep_flying_fireball_01.png"),
  dragons_emberkeep_boss_01: assetUrl("sprites/dragons_emberkeep_boss_01.png"),
  ice_world_boss_01: assetUrl("sprites/ice_world_boss_01.png"),
  ice_world_crystal_projectile_01: assetUrl("sprites/ice_world_crystal_projectile_01.png"),
} as const;

export type ImageKey = keyof typeof IMAGE_URLS;

export type MapVisualProfile = {
  color: string;
  backgroundLayers: Array<{
    image: ImageKey;
    parallax: number;
    heightRatio: number;
    opacity: number;
    verticalAnchor: "center" | "bottom";
  }>;
  ground: ImageKey;
  platform: ImageKey;
  obstacle: ImageKey;
  hazard: ImageKey;
  hazardColumns: number;
  hazardFrames: number;
  coin: ImageKey;
  coinCollected: ImageKey;
  checkpoint: ImageKey;
  goal: ImageKey;
};

export const GREEN_HILLS_VISUALS: MapVisualProfile = {
  color: "#4dbcf2",
  backgroundLayers: [
    { image: "greenBackgroundFar", parallax: 0.1, heightRatio: 1, opacity: 0.78, verticalAnchor: "center" },
    { image: "greenBackgroundMid", parallax: 0.34, heightRatio: 0.94, opacity: 0.88, verticalAnchor: "bottom" },
    { image: "greenBackgroundNear", parallax: 0.66, heightRatio: 0.82, opacity: 0.94, verticalAnchor: "bottom" },
  ],
  ground: "greenGround",
  platform: "greenPlatform",
  obstacle: "greenObstacle",
  hazard: "greenHazard",
  hazardColumns: 2,
  hazardFrames: 4,
  coin: "spaceCoin",
  coinCollected: "spaceCoinCollected",
  checkpoint: "spaceCheckpoint",
  goal: "spaceGoal",
};

const WORLD_VISUALS: Record<string, MapVisualProfile> = {
  neutral_green_hills_01: GREEN_HILLS_VISUALS,
  space_orbital_outpost_01: {
    color: "#07091d",
    backgroundLayers: [
      { image: "spaceBackgroundFar", parallax: 0.12, heightRatio: 1, opacity: 0.72, verticalAnchor: "center" },
      { image: "spaceBackgroundMid", parallax: 0.38, heightRatio: 0.94, opacity: 0.86, verticalAnchor: "bottom" },
      { image: "spaceBackgroundNear", parallax: 0.68, heightRatio: 0.82, opacity: 0.92, verticalAnchor: "bottom" },
    ],
    ground: "spaceGround",
    platform: "spacePlatform",
    obstacle: "spaceObstacle",
    hazard: "spaceHazard",
    hazardColumns: 2,
    hazardFrames: 4,
    coin: "spaceCoin",
    coinCollected: "spaceCoinCollected",
    checkpoint: "spaceCheckpoint",
    goal: "spaceGoal",
  },
  haunted_graveyard_01: {
    color: "#17143f",
    backgroundLayers: [
      { image: "hauntedBackground", parallax: 0.24, heightRatio: 1, opacity: 1, verticalAnchor: "bottom" },
    ],
    ground: "hauntedGround",
    platform: "hauntedPlatform",
    obstacle: "hauntedObstacle",
    hazard: "hauntedHazard",
    hazardColumns: 4,
    hazardFrames: 8,
    coin: "spaceCoin",
    coinCollected: "spaceCoinCollected",
    checkpoint: "spaceCheckpoint",
    goal: "spaceGoal",
  },
  dragons_emberkeep_01: {
    color: "#241225",
    backgroundLayers: [
      { image: "dragonsBackgroundFar", parallax: 0.1, heightRatio: 1, opacity: 0.58, verticalAnchor: "center" },
      { image: "dragonsBackgroundMid", parallax: 0.34, heightRatio: 0.94, opacity: 0.88, verticalAnchor: "bottom" },
      { image: "dragonsBackgroundNear", parallax: 0.66, heightRatio: 0.82, opacity: 0.94, verticalAnchor: "bottom" },
    ],
    ground: "dragonsGround",
    platform: "dragonsPlatform",
    obstacle: "dragonsObstacle",
    hazard: "dragonsHazard",
    hazardColumns: 2,
    hazardFrames: 4,
    coin: "dragonsCoin",
    coinCollected: "dragonsCoinCollected",
    checkpoint: "dragonsCheckpoint",
    goal: "dragonsGoal",
  },
  ice_world_01: {
    color: "#bcecff",
    backgroundLayers: [
      { image: "iceBackgroundFar", parallax: 0.1, heightRatio: 1, opacity: 0.78, verticalAnchor: "center" },
      { image: "iceBackgroundMid", parallax: 0.34, heightRatio: 0.94, opacity: 0.88, verticalAnchor: "bottom" },
      { image: "iceBackgroundNear", parallax: 0.66, heightRatio: 0.82, opacity: 0.94, verticalAnchor: "bottom" },
    ],
    ground: "iceGround",
    platform: "icePlatform",
    obstacle: "iceObstacle",
    hazard: "iceHazard",
    hazardColumns: 2,
    hazardFrames: 4,
    coin: "iceCoin",
    coinCollected: "iceCoinCollected",
    checkpoint: "spaceCheckpoint",
    goal: "spaceGoal",
  },
};

export type ThemedObjectAssets = {
  enemy: string;
  boss: string;
  flying: string;
  spring: string;
};

/**
 * The art each placed object wears on a given world. Worlds without their own
 * flying or spring sprite borrow one, so every entry names a real asset
 * instead of hiding a fallback at the call site.
 */
const WORLD_OBJECT_ASSETS: Record<string, ThemedObjectAssets> = {
  neutral_green_hills_01: {
    enemy: "neutral_ghost_01",
    boss: "neutral_green_hills_boss_01",
    flying: "neutral_green_hills_flying_cooper_01",
    spring: "ice_world_platformer_spring_01",
  },
  space_orbital_outpost_01: {
    enemy: "space_ghost_01",
    boss: "space_boss_01",
    flying: "neutral_green_hills_flying_cooper_01",
    spring: "ice_world_platformer_spring_01",
  },
  haunted_graveyard_01: {
    enemy: "haunted_ghost_01",
    boss: "haunted_boss_01",
    flying: "haunted_flying_cooper_bat_01",
    spring: "haunted_graveyard_platformer_spring_01",
  },
  dragons_emberkeep_01: {
    enemy: "dragon_ghost_01",
    boss: "dragons_emberkeep_boss_01",
    flying: "dragons_emberkeep_flying_fireball_01",
    spring: "ice_world_platformer_spring_01",
  },
  ice_world_01: {
    enemy: "ice_world_ghost_01",
    boss: "ice_world_boss_01",
    flying: "neutral_green_hills_flying_cooper_01",
    spring: "ice_world_platformer_spring_01",
  },
};

const FALLBACK_WORLD = "neutral_green_hills_01";

/** Which world each slot of a level is currently wearing, when not its own. */
export type PlatformerArtBorrows = Partial<Record<PlatformerArtSlot, string>>;

/**
 * Slots the canvas reads out of a visual profile, and the fields that have to
 * travel together. A hazard image is useless without its sheet geometry, and a
 * coin without the frame it turns into when collected.
 */
const VISUAL_SLOT_FIELDS = {
  ground: ["ground"],
  platform: ["platform"],
  obstacle: ["obstacle"],
  hazard: ["hazard", "hazardColumns", "hazardFrames"],
  coin: ["coin", "coinCollected"],
  checkpoint: ["checkpoint"],
  goal: ["goal"],
} as const satisfies Partial<Record<PlatformerArtSlot, readonly (keyof MapVisualProfile)[]>>;

type VisualArtSlot = keyof typeof VISUAL_SLOT_FIELDS;
type ObjectArtSlot = keyof ThemedObjectAssets;

function isVisualSlot(slot: PlatformerArtSlot): slot is VisualArtSlot {
  return slot in VISUAL_SLOT_FIELDS;
}

export type ArtWorld = {
  /** The background id a map carries in `presentation.backgroundId`. */
  id: ArtWorldId;
  /** What a kid calls this world, matching the level picker. */
  name: string;
};

function isArtWorldId(value: string): value is ArtWorldId {
  return (ART_WORLD_IDS as readonly string[]).includes(value);
}

/**
 * The worlds art can come from, named the way the level picker names them so
 * Cooper and the game never disagree about what "Dragon World" means. A world
 * the saved game is not allowed to name is left out rather than offered and
 * then rejected on save.
 */
export const ART_WORLDS: readonly ArtWorld[] = (() => {
  const worlds: ArtWorld[] = [];
  for (const entry of GAME_PLAYER_CONTENT.maps) {
    const id = entry.map.presentation.backgroundId;
    if (!isArtWorldId(id) || !WORLD_VISUALS[id]) continue;
    if (worlds.some((world) => world.id === id)) continue;
    worlds.push({ id, name: entry.label });
  }
  return worlds;
})();

export function artWorld(worldId: string): ArtWorld | null {
  return ART_WORLDS.find((world) => world.id === worldId) ?? null;
}

/**
 * The filename prefixes each world's own sprites carry. A world can wear art
 * whose name starts with another world's prefix - Green Hills wears Space
 * coins - and that is exactly how we tell borrowed art from owned art.
 */
const WORLD_SPRITE_PREFIXES: Record<string, readonly string[]> = {
  neutral_green_hills_01: ["neutral_green_hills", "neutral"],
  space_orbital_outpost_01: ["space"],
  haunted_graveyard_01: ["haunted_graveyard", "haunted"],
  dragons_emberkeep_01: ["dragons_emberkeep", "dragons", "dragon"],
  ice_world_01: ["ice_world"],
};

function assetIdFromImageKey(key: ImageKey): string {
  const url = IMAGE_URLS[key];
  return url.slice(url.lastIndexOf("/") + 1).replace(/\.png$/, "");
}

/**
 * Some images are keyed by a nickname - `hauntedHazard` rather than
 * `haunted_graveyard_platformer_hazard_01` - so anything holding a bare asset
 * id, such as a hand-picked tile or a placed pickup, needs this to find its
 * image.
 */
const IMAGE_KEYS_BY_ASSET_ID: Partial<Record<string, ImageKey>> = (() => {
  const keys: Partial<Record<string, ImageKey>> = {};
  for (const key of Object.keys(IMAGE_URLS) as ImageKey[]) {
    const assetId = assetIdFromImageKey(key);
    keys[assetId] ??= key;
  }
  return keys;
})();

export function imageKeyForAssetId(assetId: string | undefined): ImageKey | undefined {
  return assetId ? IMAGE_KEYS_BY_ASSET_ID[assetId] : undefined;
}

/** How many frames a hazard sheet holds, and how they are laid out. */
export type HazardSheet = { columns: number; frames: number };

/**
 * Hazard sheets disagree about their layout - Graveyard drew eight frames
 * across four columns where every other world drew four across two - so a
 * hand-picked hazard tile has to carry its lender's geometry, not the level's.
 */
const HAZARD_SHEETS_BY_ASSET_ID: Partial<Record<string, HazardSheet>> = (() => {
  const sheets: Partial<Record<string, HazardSheet>> = {};
  for (const visuals of [GREEN_HILLS_VISUALS, ...Object.values(WORLD_VISUALS)]) {
    sheets[assetIdFromImageKey(visuals.hazard)] = {
      columns: visuals.hazardColumns,
      frames: visuals.hazardFrames,
    };
  }
  return sheets;
})();

export function hazardSheetForAssetId(assetId: string | undefined): HazardSheet | undefined {
  return assetId ? HAZARD_SHEETS_BY_ASSET_ID[assetId] : undefined;
}

/**
 * The puff a coin turns into once collected. Every coin sheet ships its
 * collected frames beside it under the same name.
 */
export function collectedCoinAssetId(coinAssetId: string): string {
  return `${coinAssetId}_collected`;
}

/** The asset a world wears for one slot, whether that art is its own or not. */
export function worldArtAssetId(worldId: string, slot: PlatformerArtSlot): string {
  if (isVisualSlot(slot)) {
    const visuals = WORLD_VISUALS[worldId] ?? GREEN_HILLS_VISUALS;
    return assetIdFromImageKey(visuals[VISUAL_SLOT_FIELDS[slot][0]] as ImageKey);
  }
  const objects = WORLD_OBJECT_ASSETS[worldId] ?? WORLD_OBJECT_ASSETS[FALLBACK_WORLD];
  return objects[slot as ObjectArtSlot];
}

/** The asset one level wears for a slot, honouring anything it has borrowed. */
export function levelArtAssetId(
  presentation: { backgroundId: string; artBorrows?: PlatformerArtBorrows },
  slot: PlatformerArtSlot,
): string {
  return worldArtAssetId(presentation.artBorrows?.[slot] ?? presentation.backgroundId, slot);
}

/** A world owns a slot when the art it wears there is its own. */
export function worldOwnsSlot(worldId: string, slot: PlatformerArtSlot): boolean {
  const prefixes = WORLD_SPRITE_PREFIXES[worldId];
  if (!prefixes) return false;
  const assetId = worldArtAssetId(worldId, slot);
  return prefixes.some((prefix) => assetId.startsWith(`${prefix}_`));
}

/**
 * The worlds a kid can actually borrow this part from. Coverage is uneven -
 * only three worlds drew their own coins - so offering a world that would
 * hand back somebody else's art is worse than saying no.
 */
export function worldsOwningSlot(slot: PlatformerArtSlot): readonly ArtWorld[] {
  return ART_WORLDS.filter((world) => worldOwnsSlot(world.id, slot));
}

/**
 * What this level looks like: its own world's art, with each borrowed slot
 * swapped in. Every caller that draws terrain or a pickup goes through here so
 * the canvas and the toolbar buttons cannot drift apart.
 */
export function resolveMapVisuals(presentation: {
  backgroundId: string;
  artBorrows?: PlatformerArtBorrows;
}): MapVisualProfile {
  const base = WORLD_VISUALS[presentation.backgroundId] ?? GREEN_HILLS_VISUALS;
  const borrows = presentation.artBorrows;
  if (!borrows) return base;
  let resolved: MapVisualProfile | null = null;
  for (const slot of PLATFORMER_ART_SLOTS) {
    if (!isVisualSlot(slot)) continue;
    const lenderId = borrows[slot];
    if (!lenderId || lenderId === presentation.backgroundId) continue;
    const lender = WORLD_VISUALS[lenderId];
    if (!lender) continue;
    resolved = resolved ?? { ...base };
    for (const field of VISUAL_SLOT_FIELDS[slot]) {
      Object.assign(resolved, { [field]: lender[field] });
    }
  }
  return resolved ?? base;
}

/**
 * What the loading screen shows while the sprites download: the level's
 * furthest background layer, which is the one image that can be drawn before
 * anything else has arrived.
 */
export function loadingBackdrop(presentation: {
  backgroundId: string;
  artBorrows?: PlatformerArtBorrows;
}) {
  const visuals = resolveMapVisuals(presentation);
  const furthest = visuals.backgroundLayers[0];
  return {
    color: visuals.color,
    imageUrl: furthest ? IMAGE_URLS[furthest.image] : undefined,
  };
}

/**
 * The art newly placed objects wear on this level, borrowed slots included.
 * Green Hills stands in for any world without its own object art.
 */
export function themedObjectAssets(presentation: {
  backgroundId: string;
  artBorrows?: PlatformerArtBorrows;
}): ThemedObjectAssets {
  const base = WORLD_OBJECT_ASSETS[presentation.backgroundId] ?? WORLD_OBJECT_ASSETS[FALLBACK_WORLD];
  const borrows = presentation.artBorrows;
  if (!borrows) return base;
  const resolved = { ...base };
  for (const slot of ["enemy", "boss", "flying", "spring"] as const) {
    const lenderId = borrows[slot];
    if (!lenderId || lenderId === presentation.backgroundId) continue;
    if (!WORLD_OBJECT_ASSETS[lenderId]) continue;
    resolved[slot] = worldArtAssetId(lenderId, slot);
  }
  return resolved;
}
