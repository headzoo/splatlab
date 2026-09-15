/**
 * The looks an enemy or boss may wear, keyed by the level's background. This is
 * the single registry behind both the builder's object toolbox and Cooper's
 * appearance tool, so the two can never drift apart. Every value must also be a
 * key in `IMAGE_URLS` in platformer-game.tsx, or the sprite silently falls back
 * to `neutral_ghost_01`.
 */
export type CharacterOption = { value: string; label: string };

export const ENEMY_CHARACTERS: Record<string, readonly CharacterOption[]> = {
  neutral_green_hills_01: [
    { value: "neutral_cooper_01", label: "Cooper" },
    { value: "neutral_jamie_01", label: "Jamie" },
    { value: "neutral_vix_01", label: "Vix" },
    { value: "neutral_human_01", label: "Human" },
    { value: "neutral_ghost_01", label: "Ghost" },
    { value: "neutral_robot_01", label: "Robot" },
    { value: "neutral_zombie_01", label: "Zombie" },
  ],
  space_orbital_outpost_01: [
    { value: "space_cooper_01", label: "Space Cooper" },
    { value: "neutral_vix_01", label: "Vix" },
    { value: "space_human_01", label: "Astronaut" },
    { value: "space_ghost_01", label: "Space ghost" },
    { value: "space_robot_01", label: "Space robot" },
  ],
  haunted_graveyard_01: [
    { value: "haunted_cooper_01", label: "Haunted Cooper" },
    { value: "neutral_vix_01", label: "Vix" },
    { value: "haunted_human_01", label: "Haunted human" },
    { value: "haunted_ghost_01", label: "Haunted ghost" },
    { value: "haunted_robot_01", label: "Haunted robot" },
    { value: "haunted_spirit_orb_01", label: "Spirit orb" },
  ],
  dragons_emberkeep_01: [
    { value: "dragon_cooper_01", label: "Dragon Cooper" },
    { value: "neutral_vix_01", label: "Vix" },
    { value: "dragon_human_01", label: "Dragon rider" },
    { value: "dragon_ghost_01", label: "Dragon ghost" },
    { value: "dragon_dragon_01", label: "Dragon" },
  ],
  ice_world_01: [
    { value: "ice_world_cooper_01", label: "Ice Cooper" },
    { value: "neutral_vix_01", label: "Vix" },
    { value: "ice_world_human_01", label: "Ice human" },
    { value: "ice_world_girl_01", label: "Ice girl" },
    { value: "ice_world_ghost_01", label: "Ice ghost" },
    { value: "ice_world_robot_01", label: "Ice robot" },
  ],
};

export const BOSS_CHARACTERS: Record<string, readonly CharacterOption[]> = {
  neutral_green_hills_01: [{ value: "neutral_green_hills_boss_01", label: "Green Hills boss" }],
  space_orbital_outpost_01: [{ value: "space_boss_01", label: "Space boss" }],
  haunted_graveyard_01: [{ value: "haunted_boss_01", label: "Haunted boss" }],
  dragons_emberkeep_01: [{ value: "dragons_emberkeep_boss_01", label: "Emberkeep boss" }],
  ice_world_01: [{ value: "ice_world_boss_01", label: "Glacier Brute" }],
};

/** The looks available to one object kind on one background. */
export function charactersFor(
  backgroundId: string,
  role: "enemy" | "boss",
): readonly CharacterOption[] {
  const table = role === "boss" ? BOSS_CHARACTERS : ENEMY_CHARACTERS;
  return table[backgroundId] ?? table.neutral_green_hills_01;
}
