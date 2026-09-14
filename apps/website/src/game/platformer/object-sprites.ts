import type { ArtWorldId, PlatformerObjectKind } from "@/lib/game-contract";

import {
  levelArtAssetId,
  themedObjectAssets,
  worldArtAssetId,
  type PlatformerArtBorrows,
} from "./art-catalog";

/**
 * Where one frame lives inside a checked-in sprite sheet. Builder previews
 * always show the top-left frame, which is the idle pose on character sheets
 * and the first animation step everywhere else.
 */
export type PlatformerSpriteFrame = {
  assetId: string;
  columns: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
};

type SheetGeometry = Omit<PlatformerSpriteFrame, "assetId">;

const CHARACTER_SHEET: SheetGeometry = { columns: 5, rows: 4, frameWidth: 64, frameHeight: 64 };
const BOSS_SHEET: SheetGeometry = { columns: 5, rows: 2, frameWidth: 128, frameHeight: 128 };
const TILE_SHEET: SheetGeometry = { columns: 2, rows: 2, frameWidth: 64, frameHeight: 64 };
const GOAL_SHEET: SheetGeometry = { columns: 2, rows: 2, frameWidth: 64, frameHeight: 96 };
const SINGLE_FRAME: SheetGeometry = { columns: 1, rows: 1, frameWidth: 64, frameHeight: 64 };

/** Extra lives reuse the HUD life icon on every background. */
const EXTRA_LIFE_ASSET_ID = "space_platformer_hud_lives_01";

/** What a level looks like: its world, plus whatever art it has borrowed. */
export type PlatformerArtPresentation = {
  backgroundId: string;
  artBorrows?: PlatformerArtBorrows;
};

/**
 * The sprite frame a builder button should show for one object kind on one
 * level, so the button previews the art that placing it would really use.
 * Levels the catalog does not cover fall back to Green Hills.
 *
 * `world` is the world the kid has chosen to paint from. Without one the button
 * shows what this level wears.
 */
export function platformerObjectSpriteFrame(
  presentation: PlatformerArtPresentation,
  kind: PlatformerObjectKind,
  playerAssetId: string,
  world?: ArtWorldId,
): PlatformerSpriteFrame {
  const themed = world
    ? {
        spring: worldArtAssetId(world, "spring"),
        flying: worldArtAssetId(world, "flying"),
        enemy: worldArtAssetId(world, "enemy"),
        boss: worldArtAssetId(world, "boss"),
      }
    : themedObjectAssets(presentation);
  const wearing = (slot: "coin" | "checkpoint" | "goal") =>
    world ? worldArtAssetId(world, slot) : levelArtAssetId(presentation, slot);
  switch (kind) {
    case "spawn":
      return { assetId: playerAssetId, ...CHARACTER_SHEET };
    case "coin":
      return { assetId: wearing("coin"), ...TILE_SHEET };
    case "extra_life":
      return { assetId: EXTRA_LIFE_ASSET_ID, ...SINGLE_FRAME };
    case "platform_spring":
      return { assetId: themed.spring, ...SINGLE_FRAME };
    case "enemy":
      return { assetId: themed.enemy, ...CHARACTER_SHEET };
    case "boss":
      return { assetId: themed.boss, ...BOSS_SHEET };
    case "flying_object":
      return { assetId: themed.flying, ...TILE_SHEET };
    case "checkpoint":
      return { assetId: wearing("checkpoint"), ...TILE_SHEET };
    case "goal":
      return { assetId: wearing("goal"), ...GOAL_SHEET };
  }
}
