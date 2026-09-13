import type { GamePreviewKind, GameTheme } from "@/lib/game-contract";

import setupChoiceReplies from "./cooper-setup-choice-replies.json";

export type SetupChoiceReplyQuestion = keyof typeof setupChoiceReplies;

export type SetupChoiceReplyValue<Q extends SetupChoiceReplyQuestion> =
  keyof (typeof setupChoiceReplies)[Q];

export const cooperSetupChoiceReplies = setupChoiceReplies satisfies {
  gameType: Record<GamePreviewKind, string>;
  theme: Record<GameTheme, string>;
};

export function setupChoiceReplyFor(
  question: "gameType",
  value: GamePreviewKind | null,
): string | null;
export function setupChoiceReplyFor(
  question: "theme",
  value: GameTheme | null,
): string | null;
export function setupChoiceReplyFor(
  question: SetupChoiceReplyQuestion,
  value: string | null,
) {
  if (!value) return null;
  return (cooperSetupChoiceReplies[question] as Record<string, string>)[value] ?? null;
}
