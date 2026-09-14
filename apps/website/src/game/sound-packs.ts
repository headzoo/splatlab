import type { MusicTrack } from "@/game/music-player";

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

const audioUrl = (packId: SoundPackId, file: string) => `/game-assets/audio/${packId}/${file}.wav`;

export function soundPackEffectUrl(packId: SoundPackId, cue: SoundPackEffectCue): string {
  return audioUrl(packId, cue);
}

export function soundPackMusicTracks(
  packId: SoundPackId,
): Record<"gameplay" | "boss", MusicTrack> {
  return {
    gameplay: { url: audioUrl(packId, "gameplay_loop"), volume: 0.32 },
    boss: { url: audioUrl(packId, "boss_loop"), volume: 0.38 },
  };
}
