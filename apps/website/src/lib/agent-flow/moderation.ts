/**
 * Content screening for the kid-facing build chat. This sits outside the flow
 * graph on purpose: a Condition Agent node would be one more model call reading
 * the same attacker-influenced text, so it can be talked out of its job. These
 * checks are deterministic and the model cannot reach them.
 */

export type ModerationVerdict = Readonly<{
  flagged: boolean;
  /** Provider category ids that tripped. Server logs only, never shown to a kid. */
  categories: readonly string[];
}>;

export const UNFLAGGED: ModerationVerdict = Object.freeze({ flagged: false, categories: Object.freeze([]) });

export interface ContentModerator {
  screen(text: string, signal?: AbortSignal): Promise<ModerationVerdict>;
}

/**
 * Cooper's reply when a kid's message is flagged. It stays in voice and points
 * back at the game rather than naming what tripped, so a kid is redirected
 * instead of scolded.
 */
export const COOPER_INBOUND_REDIRECT =
  "Let's keep this about your game. Tell me how you want it to play, like faster running or higher jumps, and I'll change it.";

/** Cooper's reply when his own drafted message is flagged. */
export const COOPER_OUTBOUND_REDIRECT =
  "Oops, my words came out muddled there. Ask me that again and I'll try it a different way.";

/** Used when no provider is configured, and by tests that are not exercising screening. */
export const ALLOW_ALL_MODERATOR: ContentModerator = Object.freeze({
  async screen(): Promise<ModerationVerdict> {
    return UNFLAGGED;
  },
});

/**
 * Screening never fails a turn. A moderation outage should not take the
 * builder down for every kid using it, and the agent's blast radius is already
 * bounded by the tool allowlist and each tool's own validation. Providers fail
 * open internally too; this is the backstop for a moderator that throws.
 */
export async function safeScreen(
  text: string,
  moderator: ContentModerator,
  signal?: AbortSignal,
): Promise<ModerationVerdict> {
  try {
    return await moderator.screen(text, signal);
  } catch (error) {
    console.warn("Moderation threw, allowing text", error);
    return UNFLAGGED;
  }
}

/**
 * Swaps a flagged draft for the redirect. Callers run this before the message
 * reaches the transcript, so flagged text is never persisted and never replays
 * into a later turn's context.
 */
export async function screenCooperMessage(
  drafted: string,
  moderator: ContentModerator,
  signal?: AbortSignal,
): Promise<string> {
  const verdict = await safeScreen(drafted, moderator, signal);
  if (!verdict.flagged) return drafted;
  console.warn("Cooper reply was withheld by moderation", { categories: verdict.categories });
  return COOPER_OUTBOUND_REDIRECT;
}
