import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import levelOne from "../../../game/maps/level-1.json";
import levelTwo from "../../../game/maps/level-2.json";
import levelThree from "../../../game/maps/level-3.json";
import levelFour from "../../../game/maps/level-4.json";
import levelFive from "../../../game/maps/level-5.json";
import mazeGreenHills from "../../../game/maps/maze_green_hills_01.json";
import mazeSpace from "../../../game/maps/maze_space_01.json";
import mazeGraveyard from "../../../game/maps/maze_graveyard_01.json";
import mazeDragonWorld from "../../../game/maps/maze_dragon_world_01.json";

import {
  DEFAULT_SOUND_PACK_ID,
  SOUND_PACK_EFFECT_CUES,
  SOUND_PACK_IDS,
  resolveSoundPackId,
  soundPackEffectUrl,
  soundPackMusicTracks,
  type SoundPackId,
} from "./sound-packs";

const GAME_ROOT = path.resolve(process.cwd(), "../game");

/** The map objects the site itself loads for /build, not hand-written fixtures. */
const PLATFORMER_LEVELS: ReadonlyArray<[string, string, SoundPackId]> = [
  ["level-1 Green Hills", levelOne.presentation.backgroundId, "neutral_green_hills_v1"],
  ["level-2 Space", levelTwo.presentation.backgroundId, "space_basic_v1"],
  ["level-3 Graveyard", levelThree.presentation.backgroundId, "haunted_graveyard_v1"],
  ["level-4 Dragons", levelFour.presentation.backgroundId, "dragons_emberkeep_v1"],
  ["level-5 Ice World", levelFive.presentation.backgroundId, "ice_world_v1"],
];

const MAZE_LEVELS: ReadonlyArray<[string, string, SoundPackId]> = [
  ["maze_green_hills_01", mazeGreenHills.presentation.mazeThemeId, "neutral_green_hills_v1"],
  ["maze_space_01", mazeSpace.presentation.mazeThemeId, "neutral_green_hills_v1"],
  ["maze_graveyard_01", mazeGraveyard.presentation.mazeThemeId, "haunted_graveyard_v1"],
  ["maze_dragon_world_01", mazeDragonWorld.presentation.mazeThemeId, "dragons_emberkeep_v1"],
];

test("each checked-in platformer level resolves its own themed sound pack", () => {
  for (const [name, themeId, expected] of PLATFORMER_LEVELS) {
    assert.equal(resolveSoundPackId(themeId), expected, name);
  }
});

test("the five platformer levels do not share a sound pack", () => {
  const packs = PLATFORMER_LEVELS.map(([, themeId]) => resolveSoundPackId(themeId));
  assert.equal(new Set(packs).size, PLATFORMER_LEVELS.length);
});

test("each checked-in maze resolves a sound pack from its maze theme", () => {
  for (const [name, themeId, expected] of MAZE_LEVELS) {
    assert.equal(resolveSoundPackId(themeId), expected, name);
  }
});

test("an unknown or missing theme falls back to the starter pack", () => {
  assert.equal(resolveSoundPackId(undefined), DEFAULT_SOUND_PACK_ID);
  assert.equal(resolveSoundPackId(null), DEFAULT_SOUND_PACK_ID);
  assert.equal(resolveSoundPackId(""), DEFAULT_SOUND_PACK_ID);
  assert.equal(resolveSoundPackId("pirates_cove_07"), DEFAULT_SOUND_PACK_ID);
});

test("theme prefixes match so a new variant inherits its theme's audio", () => {
  assert.equal(resolveSoundPackId("ice_world_02"), "ice_world_v1");
  assert.equal(resolveSoundPackId("haunted_graveyard_maze_03"), "haunted_graveyard_v1");
});

test("every sound pack url is backed by a checked-in file", () => {
  for (const packId of SOUND_PACK_IDS) {
    const tracks = soundPackMusicTracks(packId);
    const urls = [
      tracks.gameplay.url,
      tracks.boss.url,
      ...SOUND_PACK_EFFECT_CUES.map((cue) => soundPackEffectUrl(packId, cue)),
    ];
    for (const url of urls) {
      assert.ok(url.startsWith("/game-assets/audio/"), url);
      const file = path.join(GAME_ROOT, url.replace("/game-assets/", ""));
      assert.ok(existsSync(file), `${url} is missing on disk`);
    }
  }
});

/**
 * Music is the only thing big enough to matter over the network - one WAV loop
 * was 2.9 MB - while the effects are a few KB and never loop, so they stay WAV.
 */
test("music is served compressed and effects stay uncompressed", () => {
  for (const packId of SOUND_PACK_IDS) {
    const tracks = soundPackMusicTracks(packId);
    assert.match(tracks.gameplay.url, /\.ogg$/, packId);
    assert.match(tracks.boss.url, /\.ogg$/, packId);
    for (const cue of SOUND_PACK_EFFECT_CUES) {
      assert.match(soundPackEffectUrl(packId, cue), /\.wav$/, `${packId} ${cue}`);
    }
  }
});

/**
 * Opus decodes at 48 kHz with pre-skip padding, so the runtime has to loop on
 * the authored length rather than on the decoded buffer. A track that forgot to
 * carry it would loop through that padding and reopen the validated seam.
 */
test("every music track carries the authored loop length", () => {
  for (const packId of SOUND_PACK_IDS) {
    const tracks = soundPackMusicTracks(packId);
    for (const [cue, track] of Object.entries(tracks)) {
      assert.equal(
        typeof track.loopSeconds,
        "number",
        `${packId} ${cue} has no loopSeconds`,
      );
      assert.ok(track.loopSeconds! > 0, `${packId} ${cue} loops on nothing`);
    }
  }
});
