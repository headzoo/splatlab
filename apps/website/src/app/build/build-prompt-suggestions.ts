import type { GamePreviewKind } from "@/lib/game-contract";

export const ADD_LEVEL_PROMPT = "Add another level";

/**
 * Every suggestion has to map onto something Cooper's tools can do: an editable
 * path in PLATFORMER_EDITABLE_FIELDS, a kind in COOPER_OBJECT_KINDS, or one of
 * the look and lives tools. The maze runtime receives none of these, so a maze
 * game is only offered the level picker, which the chat handles without Cooper.
 */
const PLATFORMER_PROMPTS = [
  "Add more coins",
  "Add more enemies",
  "Give me 10 lives",
  "Make me jump higher",
  "Make me run faster",
] as const;

const GAME_TYPE_PROMPTS = {
  platformer: PLATFORMER_PROMPTS,
  maze: [],
} as const satisfies Record<GamePreviewKind, readonly string[]>;

export function buildPromptSuggestions(gameType: GamePreviewKind) {
  return [ADD_LEVEL_PROMPT, ...GAME_TYPE_PROMPTS[gameType]];
}
