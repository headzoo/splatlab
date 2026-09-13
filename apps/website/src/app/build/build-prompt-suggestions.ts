import type { GamePreviewKind } from "@/lib/game-contract";

export const ADD_LEVEL_PROMPT = "Add another level";

/**
 * Cooper's only tools are read_game_physics and patch_game_physics, so every
 * suggestion has to map onto an editable path in PLATFORMER_EDITABLE_FIELDS.
 * The maze runtime never receives the physics document, so a maze game is only
 * offered the level picker, which the chat handles without Cooper.
 */
const PLATFORMER_PHYSICS_PROMPTS = [
  "Make me jump higher",
  "Make me run faster",
  "Make me fall slower",
  "Let me fly",
] as const;

const GAME_TYPE_PROMPTS = {
  platformer: PLATFORMER_PHYSICS_PROMPTS,
  maze: [],
} as const satisfies Record<GamePreviewKind, readonly string[]>;

export function buildPromptSuggestions(gameType: GamePreviewKind) {
  return [ADD_LEVEL_PROMPT, ...GAME_TYPE_PROMPTS[gameType]];
}
