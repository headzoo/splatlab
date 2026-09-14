import {
  ART_WORLDS,
  artWorld,
  levelArtAssetId,
  worldsOwningSlot,
  type ArtWorld,
} from "../game/platformer/art-catalog";
import { PLATFORMER_ART_SLOTS, type PlatformerArtSlot } from "./game-contract";
import type { GameDocument } from "./game-contract";
import { GameObjectEditError, type ActivePlatformerLevel } from "./game-objects";
import type { CooperSpecChange } from "./cooper-spec-change";

/**
 * What a kid calls each part of a level. These are the words `set_level_art`
 * takes, because "platforms" is what a kid says and `platform` is what the map
 * calls the tiles they stand on.
 */
const PART_NAMES: Record<PlatformerArtSlot, string> = {
  ground: "ground",
  platform: "platforms",
  obstacle: "blocks",
  hazard: "spikes",
  coin: "coins",
  checkpoint: "checkpoints",
  goal: "goal",
  spring: "springs",
  flying: "flying things",
  enemy: "enemies",
  boss: "bosses",
};

export const LEVEL_ART_PARTS = PLATFORMER_ART_SLOTS.map((slot) => PART_NAMES[slot]);

function slotForPart(part: string): PlatformerArtSlot {
  const wanted = part.trim().toLowerCase();
  const slot = PLATFORMER_ART_SLOTS.find((candidate) => PART_NAMES[candidate] === wanted);
  if (!slot) {
    throw new GameObjectEditError(
      `Cooper cannot change the art for "${part}". The parts Cooper can change are: ${LEVEL_ART_PARTS.join(", ")}.`,
      `unknown part ${part}`,
    );
  }
  return slot;
}

/**
 * Every world is namable, not only the ones that own the part being asked
 * about, because a refusal that names the worlds which do own it teaches the
 * kid more than a tool that cannot be called at all.
 */
export const LEVEL_ART_WORLD_NAMES = ART_WORLDS.map((world) => world.name);

function worldNamed(name: string): ArtWorld {
  const wanted = name.trim().toLowerCase();
  const world = ART_WORLDS.find((candidate) => candidate.name.toLowerCase() === wanted);
  if (!world) {
    throw new GameObjectEditError(
      `Cooper does not know a world called "${name}".`,
      `unknown world ${name}`,
    );
  }
  return world;
}

/**
 * What this level is wearing for every part, and where else each part could
 * come from. Coverage is uneven - only three worlds drew their own coins - so
 * the worlds that would just hand back somebody else's art are left out.
 */
export function describeLevelArt(level: ActivePlatformerLevel) {
  const { presentation } = level.map;
  const home = artWorld(presentation.backgroundId);
  return {
    world: home?.name ?? presentation.backgroundId,
    note: "Changing a part swaps that art everywhere in this level, and on the button the kid paints with.",
    parts: PLATFORMER_ART_SLOTS.map((slot) => {
      const borrowed = presentation.artBorrows?.[slot];
      return {
        part: PART_NAMES[slot],
        wearing: (borrowed ? artWorld(borrowed)?.name : null) ?? home?.name ?? "its own",
        borrowed: Boolean(borrowed),
        canBorrowFrom: worldsOwningSlot(slot).map((world) => world.name),
      };
    }),
  };
}

/**
 * Dresses one part of the level being shown in another world's art. Pure: the
 * caller saves the change. Refusals name the worlds that do own the part, so a
 * kid asking Green Hills for coins is told who has them rather than being told
 * no twice.
 */
export function planLevelArt(
  spec: GameDocument,
  level: ActivePlatformerLevel,
  part: string,
  world: string,
): Required<Pick<CooperSpecChange, "platformerLevelArt">>
  & { part: string; world: string; assetId: string } {
  const slot = slotForPart(part);
  const chosen = worldNamed(world);
  const owners = worldsOwningSlot(slot);
  if (!owners.some((owner) => owner.id === chosen.id)) {
    throw new GameObjectEditError(
      `${chosen.name} does not have its own ${PART_NAMES[slot]}. You can borrow ${PART_NAMES[slot]} from ${listNames(owners)}.`,
      `${chosen.id} does not own ${slot}`,
    );
  }

  const rows = spec.platformerLevelArt.filter(
    (entry) => !(entry.mapSource === level.mapSource && entry.slot === slot),
  );
  // A level going back to its own world drops the row rather than storing a
  // borrow from itself, so the saved game stays the shortest thing that is true.
  const platformerLevelArt = chosen.id === level.map.presentation.backgroundId
    ? rows
    : [...rows, { mapSource: level.mapSource, slot, world: chosen.id }];

  return {
    platformerLevelArt,
    part: PART_NAMES[slot],
    world: chosen.name,
    assetId: levelArtAssetId(
      { backgroundId: level.map.presentation.backgroundId, artBorrows: { [slot]: chosen.id } },
      slot,
    ),
  };
}

function listNames(worlds: readonly ArtWorld[]): string {
  const names = worlds.map((world) => world.name);
  if (names.length <= 1) return names[0] ?? "no world";
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}
