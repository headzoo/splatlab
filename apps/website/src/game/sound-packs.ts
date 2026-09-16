import musicLoopSeconds from "../../../game/audio/music-loops.json";

import type { MusicTrack } from "@/game/music-player";

/**
 * The authored length of every music loop, written by
 * `python3 apps/game/tools/audio.py encode-music` beside the encoded files so
 * the runtime can never disagree with what was actually encoded.
 */
const MUSIC_LOOP_SECONDS: Record<
  string,
  { gameplay_loop: number; boss_loop: number }
> = musicLoopSeconds;

export const SOUND_PACK_IDS = [
  "space_basic_v1",
  "dragons_emberkeep_v1",
  "neutral_green_hills_v1",
  "haunted_graveyard_v1",
  "ice_world_v1",
] as const;

export type SoundPackId = (typeof SOUND_PACK_IDS)[number];

export const DEFAULT_SOUND_PACK_ID: SoundPackId = "space_basic_v1";

/**
 * Map data stays semantic and never names an audio file, so the pack is derived
 * from the theme ID a map already carries. Prefixes rather than exact IDs so a
 * new `..._maze_02` or `..._02` variant inherits its theme's audio.
 */
const PACK_BY_THEME_PREFIX: ReadonlyArray<readonly [string, SoundPackId]> = [
  ["neutral_green_hills", "neutral_green_hills_v1"],
  ["haunted_graveyard", "haunted_graveyard_v1"],
  ["dragons_emberkeep", "dragons_emberkeep_v1"],
  ["ice_world", "ice_world_v1"],
  ["space", "space_basic_v1"],
];

export function resolveSoundPackId(themeId: string | null | undefined): SoundPackId {
  if (!themeId) return DEFAULT_SOUND_PACK_ID;
  const match = PACK_BY_THEME_PREFIX.find(([prefix]) => themeId.startsWith(prefix));
  return match ? match[1] : DEFAULT_SOUND_PACK_ID;
}

export const SOUND_PACK_EFFECT_CUES = [
  "jump",
  "land",
  "collectible",
  "enemy_defeat",
  "player_damage",
  "player_death",
  "respawn",
  "weapon_swing",
  "weapon_hit",
  "fire",
  "checkpoint",
  "goal",
] as const;

export type SoundPackEffectCue = (typeof SOUND_PACK_EFFECT_CUES)[number];

const audioUrl = (packId: SoundPackId, file: string, extension: string) =>
  `/game-assets/audio/${packId}/${file}.${extension}`;

export function soundPackEffectUrl(packId: SoundPackId, cue: SoundPackEffectCue): string {
  return audioUrl(packId, cue, "wav");
}

/**
 * Music is served as Opus because the authored WAV masters are 2.9 MB each and
 * are fetched the instant a kid presses play.
 *
 * `loopSeconds` is the authored length from `music-loops.json`, and it is not
 * decoration. Opus decodes at 48 kHz with pre-skip padding, so the decoded
 * buffer is longer than the loop; repeating it whole would reopen the seam that
 * `tools/audio.py` validates. Effects stay WAV: they are a few KB, they never
 * loop, and they are only fetched when their event fires.
 */
export function soundPackMusicTracks(
  packId: SoundPackId,
): Record<"gameplay" | "boss", MusicTrack> {
  const loops = MUSIC_LOOP_SECONDS[packId];
  return {
    gameplay: {
      url: audioUrl(packId, "gameplay_loop", "ogg"),
      volume: 0.32,
      loopSeconds: loops.gameplay_loop,
    },
    boss: {
      url: audioUrl(packId, "boss_loop", "ogg"),
      volume: 0.38,
      loopSeconds: loops.boss_loop,
    },
  };
}
