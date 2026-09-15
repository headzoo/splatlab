import assert from "node:assert/strict";
import test from "node:test";

import cooperRecipe from "../../../game/sprite-specs/space_cooper_01.json";
import humanRecipe from "../../../game/sprite-specs/space_human_01.json";
import shortSword from "../../../game/weapon-specs/short_sword_v1.json";

import {
  directionalAttackFrameIndexes,
  playerAttackEventSheet,
  playerAttackEventVisual,
  playerWeaponAttackPose,
} from "./platformer/player-attack";
import type { WeaponSpec } from "./platformer/types";

const weapon = shortSword as unknown as WeaponSpec;

test("the /build player uses each approved Space attack sheet", () => {
  for (const { playerAssetId, recipe } of [
    { playerAssetId: "space_cooper_01" as const, recipe: cooperRecipe },
    { playerAssetId: "space_human_01" as const, recipe: humanRecipe },
  ]) {
    const eventSheet = playerAttackEventSheet(playerAssetId);
    const authored = recipe.eventSheets.attack;
    assert.ok(eventSheet);
    assert.equal(eventSheet.imageAssetId, `${playerAssetId}_attack`);
    assert.deepEqual(
      {
        columns: eventSheet.columns,
        rows: eventSheet.rows,
        frameWidth: eventSheet.frameWidth,
        frameHeight: eventSheet.frameHeight,
        frameLabels: eventSheet.frameLabels,
        anchor: eventSheet.anchor,
        fps: eventSheet.fps,
        loop: eventSheet.loop,
      },
      {
        ...authored.sheet,
        frameLabels: authored.frameLabels,
        anchor: authored.alignment.anchor,
        fps: authored.animation.fps,
        loop: authored.animation.loop,
      },
    );
    assert.deepEqual(directionalAttackFrameIndexes(eventSheet, "left"), [0, 1, 2, 3]);
    assert.deepEqual(directionalAttackFrameIndexes(eventSheet, "right"), [4, 5, 6, 7]);
  }
});

test("attack animation advances at the authored FPS and stays mechanically optional", () => {
  assert.equal(playerAttackEventVisual("space_cooper_01", "left", 0)?.frameIndex, 0);
  assert.equal(playerAttackEventVisual("space_human_01", "right", 100)?.frameIndex, 5);
  assert.equal(playerAttackEventVisual("space_human_01", "right", 10_000)?.frameIndex, 7);
  assert.equal(playerAttackEventVisual("space_ghost_01", "right", 0), null);
  assert.equal(playerAttackEventVisual("neutral_cooper_01", "right", 0), null);
  assert.equal(playerAttackEventVisual("neutral_rupert_01", "right", 0), null);
  assert.equal(playerAttackEventVisual("neutral_jamie_01", "right", 0), null);
  assert.equal(playerAttackEventVisual("neutral_vix_01", "right", 0), null);
  assert.equal(playerAttackEventVisual("neutral_leenie_01", "right", 0), null);
  assert.equal(playerAttackEventVisual("neutral_lango_01", "right", 0), null);
});

test("every /build hero gets a visible sword swing without fabricating character art", () => {
  assert.deepEqual(
    playerWeaponAttackPose(weapon, "space_human_01", "right", 0),
    weapon.visual.characters.space_human_01.directions.right[0],
  );
  assert.deepEqual(
    playerWeaponAttackPose(weapon, "neutral_cooper_01", "right", 0),
    weapon.visual.characters.space_cooper_01.directions.right[0],
  );
  assert.deepEqual(
    playerWeaponAttackPose(weapon, "space_ghost_01", "left", 3),
    weapon.visual.characters.space_cooper_01.directions.left[3],
  );
});
