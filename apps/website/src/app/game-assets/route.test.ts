import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "./[...asset]/route";

test("the website serves approved coin collection sheets", async () => {
  for (const filename of [
    "space_platformer_coin_01_collected.png",
    "dragons_emberkeep_platformer_coin_01_collected.png",
    "ice_world_platformer_coin_01_collected.png",
  ]) {
    const response = await GET(
      new Request(`http://localhost/game-assets/sprites/${filename}`),
      { params: Promise.resolve({ asset: ["sprites", filename] }) },
    );

    assert.equal(response.status, 200, filename);
    assert.equal(response.headers.get("Content-Type"), "image/png", filename);
    assert.ok((await response.arrayBuffer()).byteLength > 0, filename);
  }
});

test("the website serves every approved Space character defeated event sheet", async () => {
  for (const filename of [
    "space_cooper_01_defeated.png",
    "space_human_01_defeated.png",
    "space_ghost_01_defeated.png",
    "space_robot_01_defeated.png",
  ]) {
    const response = await GET(
      new Request(`http://localhost/game-assets/sprites/${filename}`),
      { params: Promise.resolve({ asset: ["sprites", filename] }) },
    );

    assert.equal(response.status, 200, filename);
    assert.equal(response.headers.get("Content-Type"), "image/png", filename);
    assert.ok((await response.arrayBuffer()).byteLength > 0, filename);
  }
});

test("the website serves the approved sword and attack sheets used by /build", async () => {
  for (const filename of [
    "short_sword_v1.png",
    "space_cooper_01_attack.png",
    "space_human_01_attack.png",
  ]) {
    const response = await GET(
      new Request(`http://localhost/game-assets/sprites/${filename}`),
      { params: Promise.resolve({ asset: ["sprites", filename] }) },
    );

    assert.equal(response.status, 200, filename);
    assert.equal(response.headers.get("Content-Type"), "image/png", filename);
    assert.ok((await response.arrayBuffer()).byteLength > 0, filename);
  }
});

test("the website serves setup character, mask, and maze theme assets", async () => {
  for (const asset of [
    ["sprites", "neutral_human_01.png"],
    ["sprites", "haunted_robot_01.png"],
    ["sprites", "space_human_01.png"],
    ["sprites", "space_girl_01.png"],
    ["sprites", "dragon_cooper_01.png"],
    ["sprite-masks", "space_human_01-skin-mask.png"],
    ["sprite-masks", "space_human_01-hair-mask.png"],
    ["sprite-masks", "space_girl_01-skin-mask.png"],
    ["sprite-masks", "space_girl_01-hair-mask.png"],
    ["sprites", "haunted_graveyard_maze_floor_01.png"],
    ["sprites", "space_maze_wall_01.png"],
    ["sprites", "dragons_emberkeep_maze_door_01.png"],
    ["sprites", "haunted_graveyard_flaming_pumpkin_01.png"],
    ["sprites", "dragons_emberkeep_fireball_01.png"],
    ["sprites", "dragons_emberkeep_flying_fireball_01.png"],
    ["sprites", "ice_world_boss_01.png"],
    ["sprites", "ice_world_boss_01_defeated.png"],
    ["sprites", "ice_world_crystal_projectile_01.png"],
    ["sprites", "ice_world_cooper_01.png"],
    ["sprites", "ice_world_human_01.png"],
    ["sprites", "ice_world_girl_01.png"],
    ["sprites", "ice_world_ghost_01.png"],
    ["sprites", "ice_world_robot_01.png"],
    ["sprites", "ice_world_platformer_coin_01.png"],
    ["sprites", "ice_world_platformer_spring_01.png"],
    ["sprites", "ice_world_platformer_spring_01_compressed.png"],
    ["sprites", "haunted_graveyard_platformer_spring_01.png"],
    ["sprites", "haunted_graveyard_platformer_spring_01_compressed.png"],
    ["sprite-masks", "ice_world_human_01-skin-mask.png"],
    ["sprite-masks", "ice_world_human_01-hair-mask.png"],
    ["sprite-masks", "ice_world_girl_01-skin-mask.png"],
    ["sprite-masks", "ice_world_girl_01-hair-mask.png"],
  ]) {
    const response = await GET(
      new Request(`http://localhost/game-assets/${asset.join("/")}`),
      { params: Promise.resolve({ asset }) },
    );

    assert.equal(response.status, 200, asset.join("/"));
    assert.equal(response.headers.get("Content-Type"), "image/png", asset.join("/"));
    assert.ok((await response.arrayBuffer()).byteLength > 0, asset.join("/"));
  }
});
