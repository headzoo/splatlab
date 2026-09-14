import type { GamePreviewKind } from "@/lib/game-contract";

export const ADD_LEVEL_PROMPT = "Add another level";

export type PromptSuggestion = {
  label: string;
  /** Sent as the kid's chat message. Absent for the add-level picker. */
  message?: string;
};

/**
 * Every suggestion has to map onto something Cooper's tools can do: an editable
 * path in PLATFORMER_EDITABLE_FIELDS, a kind in COOPER_OBJECT_KINDS, or one of
 * the look and lives tools. The maze runtime receives none of these, so a maze
 * game is only offered the level picker, which the chat handles without Cooper.
 */
const PLATFORMER_PROMPTS = [
  {
    label: "Add more coins",
    message: "Please add more coins to this level.",
  },
  {
    label: "Add more enemies",
    message: "Please add more enemies to this level.",
  },
  {
    label: "Add a boss",
    message: "Please add a boss to this level.",
  },
  {
    label: "Add some springs",
    message: "Please add some springs I can bounce on.",
  },
  {
    label: "Add a checkpoint",
    message: "Please add a checkpoint to this level.",
  },
  {
    label: "Give me 10 lives",
    message: "Please give me 10 lives.",
  },
  {
    label: "Make me jump higher",
    message: "Please make me jump higher.",
  },
  {
    label: "Make me run faster",
    message: "Please make me run faster.",
  },
  {
    label: "Let me fly",
    message: "Please let me fly.",
  },
] as const satisfies readonly PromptSuggestion[];

const ADD_LEVEL_SUGGESTION = {
  label: ADD_LEVEL_PROMPT,
} as const satisfies PromptSuggestion;

const GAME_TYPE_PROMPTS = {
  platformer: PLATFORMER_PROMPTS,
  maze: [],
} as const satisfies Record<GamePreviewKind, readonly PromptSuggestion[]>;

export function buildPromptSuggestions(
  gameType: GamePreviewKind,
): PromptSuggestion[] {
  return [ADD_LEVEL_SUGGESTION, ...GAME_TYPE_PROMPTS[gameType]];
}
