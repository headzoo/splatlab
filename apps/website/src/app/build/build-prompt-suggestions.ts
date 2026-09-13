import type { GamePreviewKind, GameTheme } from "@/lib/game-contract";

const THEME_PROMPTS = {
  green_hills: "Add more enemies",
  graveyard: "Add more ghosts",
  space: "Add more aliens",
  dragon_world: "More fireballs",
} as const satisfies Record<GameTheme, string>;

const GAME_TYPE_PROMPTS = {
  platformer: ["Reduce the gravity", "Add more hazards", "Add more coins"],
  maze: ["Make the maze harder", "Add more hazards", "Add another key"],
} as const satisfies Record<GamePreviewKind, readonly string[]>;

export function buildPromptSuggestions(
  gameType: GamePreviewKind,
  theme: GameTheme,
) {
  return [...GAME_TYPE_PROMPTS[gameType], THEME_PROMPTS[theme]];
}
