import assert from "node:assert/strict";
import test from "node:test";

import cooperRecipe from "../../../game/sprite-specs/space_cooper_01.json";
import ghostRecipe from "../../../game/sprite-specs/space_ghost_01.json";
import humanRecipe from "../../../game/sprite-specs/space_human_01.json";
import robotRecipe from "../../../game/sprite-specs/space_robot_01.json";

import {
  directionalDefeatedFrameIndexes,
  playerDefeatedEventSheet,
  playerDefeatedEventVisual,
} from "./platformer/player-death";

test("all approved Space hero defeated events use the authored sheet contract", () => {
  for (const { playerAssetId, recipe } of [
    { playerAssetId: "space_cooper_01" as const, recipe: cooperRecipe },
    { playerAssetId: "space_human_01" as const, recipe: humanRecipe },
    { playerAssetId: "space_ghost_01" as const, recipe: ghostRecipe },
    { playerAssetId: "space_robot_01" as const, recipe: robotRecipe },
  ]) {
    const eventSheet = playerDefeatedEventSheet(playerAssetId);
    const authored = recipe.eventSheets.defeated;
    assert.ok(eventSheet);
    assert.equal(eventSheet.imageAssetId, `${playerAssetId}_defeated`);
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
    assert.deepEqual(
      directionalDefeatedFrameIndexes(eventSheet, "left"),
      [0, 1, 2, 3],
    );
    assert.deepEqual(
      directionalDefeatedFrameIndexes(eventSheet, "right"),
      [4, 5, 6, 7],
    );
  }
});

test("themed heroes reuse the existing body-matched defeated event sheets", () => {
  for (const playerAssetId of [
    "neutral_cooper_01",
    "haunted_cooper_01",
    "dragon_cooper_01",
  ] as const) {
    assert.equal(
      playerDefeatedEventSheet(playerAssetId)?.imageAssetId,
      "space_cooper_01_defeated",
    );
  }
  assert.equal(
    playerDefeatedEventSheet("dragon_human_01")?.imageAssetId,
    "space_human_01_defeated",
  );
  assert.equal(
    playerDefeatedEventSheet("haunted_ghost_01")?.imageAssetId,
    "space_ghost_01_defeated",
  );
  assert.equal(
    playerDefeatedEventSheet("neutral_robot_01")?.imageAssetId,
    "space_robot_01_defeated",
  );
});

test("heroes without compatible event art retain the safe no-animation fallback", () => {
  assert.equal(playerDefeatedEventSheet("neutral_girl_01"), null);
  assert.equal(playerDefeatedEventSheet("space_girl_01"), null);
  assert.equal(playerDefeatedEventSheet("dragon_girl_01"), null);
});

test("defeated events advance at authored FPS and hold their final directional frame", () => {
  assert.equal(playerDefeatedEventVisual("space_cooper_01", "left", -1)?.frameIndex, 0);
  assert.equal(playerDefeatedEventVisual("space_cooper_01", "left", 100)?.frameIndex, 1);
  assert.equal(playerDefeatedEventVisual("space_cooper_01", "right", 200)?.frameIndex, 6);
  assert.equal(playerDefeatedEventVisual("space_cooper_01", "right", 10_000)?.frameIndex, 7);
  assert.equal(playerDefeatedEventVisual("neutral_cooper_01", "right", 0)?.frameIndex, 4);
  assert.equal(playerDefeatedEventVisual("neutral_girl_01", "right", 0), null);
});
