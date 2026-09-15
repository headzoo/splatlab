/**
 * Content screening for the kid-facing build chat. This sits outside the flow
 * graph on purpose: a Condition Agent node would be one more model call reading
 * the same attacker-influenced text, so it can be talked out of its job. The
 * control path is server-owned and the model cannot change or bypass it.
 */

export type ModerationVerdict = Readonly<{
  flagged: boolean;
  /** Provider category ids that tripped. Server logs only, never shown to a kid. */
  categories: readonly string[];
  /** True when no trustworthy moderation verdict was available. */
  unavailable?: true;
}>;

export const UNFLAGGED: ModerationVerdict = Object.freeze({ flagged: false, categories: Object.freeze([]) });
export const MODERATION_UNAVAILABLE: ModerationVerdict = Object.freeze({
  flagged: true,
  categories: Object.freeze([]),
  unavailable: true,
});

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

/** Cooper's reply when the safety check itself cannot produce a verdict. */
export const COOPER_MODERATION_UNAVAILABLE_REDIRECT =
  "My safety checker is taking a quick break. Please try that again in a moment.";

/** Explicit test-only escape hatch; production configuration never selects it. */
export const ALLOW_ALL_MODERATOR: ContentModerator = Object.freeze({
  async screen(): Promise<ModerationVerdict> {
    return UNFLAGGED;
  },
});

/** Secure default for a missing provider or an internal caller that omitted one. */
export const UNAVAILABLE_MODERATOR: ContentModerator = Object.freeze({
  async screen(): Promise<ModerationVerdict> {
    return MODERATION_UNAVAILABLE;
  },
});

const CHARACTER_SUBSTITUTIONS: Readonly<Record<string, string>> = Object.freeze({
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  "$": "s",
  "!": "i",
  "|": "i",
});

const BLOCKED_WORD_PATTERNS: readonly Readonly<{
  category: string;
  pattern: RegExp;
}>[] = Object.freeze([
  { category: "local/profanity", pattern: /^f+u+c+k+(?:e+d|e+r+s?|i+n+g|s+)?$/ },
  { category: "local/profanity", pattern: /^f+c+k+(?:e+d|e+r+s?|i+n+g|s+)?$/ },
  { category: "local/profanity", pattern: /^s+h+i+t+(?:s+|t+y+|t+i+n+g)?$/ },
  { category: "local/profanity", pattern: /^b+i+t+c+h+(?:e+s+|y+)?$/ },
  { category: "local/profanity", pattern: /^a+s+s+$/ },
  { category: "local/profanity", pattern: /^a+s+s+h+o+l+e+s?$/ },
  { category: "local/profanity", pattern: /^b+a+s+t+a+r+d+s?$/ },
  { category: "local/profanity", pattern: /^c+r+a+p+$/ },
  { category: "local/profanity", pattern: /^c+u+n+t+s?$/ },
  { category: "local/profanity", pattern: /^d+a+m+n+$/ },
  { category: "local/profanity", pattern: /^d+i+c+k+(?:s+|h+e+a+d+s?)?$/ },
  { category: "local/profanity", pattern: /^p+u+s+s+(?:y+|i+e+s+)$/ },
  { category: "local/profanity", pattern: /^s+l+u+t+(?:s+|t+y+)?$/ },
  { category: "local/profanity", pattern: /^w+h+o+r+e+s?$/ },
  { category: "local/profanity", pattern: /^h+e+l+l+$/ },
  { category: "local/hate", pattern: /^n+i+g+g+(?:e+r+s?|a+s?)$/ },
  { category: "local/hate", pattern: /^f+a+g+(?:g+o+t+s?|s+)?$/ },
  { category: "local/hate", pattern: /^r+e+t+a+r+d+(?:e+d|s+)?$/ },
  { category: "local/sexual", pattern: /^p+o+r+n+(?:o+g+r+a+p+h+(?:y+|i+c+))?$/ },
  { category: "local/sexual", pattern: /^r+a+p+(?:e+(?:d|r+s?)?|i+n+g|i+s+t+s?)$/ },
]);

function normalizedContent(text: string): Readonly<{
  phrase: string;
  words: readonly string[];
}> {
  const normalized = [...text.normalize("NFKD").toLowerCase()]
    .filter((character) => !/\p{Mark}/u.test(character))
    .map((character) => CHARACTER_SUBSTITUTIONS[character] ?? character)
    .join("")
    .replace(/[^a-z]+/g, " ")
    .trim();
  if (!normalized) return { phrase: "", words: [] };

  const words = normalized.split(/\s+/).map((word) =>
    word.replace(/([a-z])\1{2,}/g, "$1"),
  );
  const reconstructed: string[] = [];
  for (let index = 0; index < words.length;) {
    if (words[index]?.length !== 1) {
      index += 1;
      continue;
    }
    let end = index;
    let joined = "";
    while (end < words.length && words[end]?.length === 1 && joined.length < 20) {
      joined += words[end];
      end += 1;
    }
    if (end - index >= 3) reconstructed.push(joined);
    index = end;
  }
  return {
    phrase: words.join(" "),
    words: [...words, ...reconstructed],
  };
}

/**
 * A small, reviewable backstop for explicit profanity, slurs, sexual terms,
 * and self-harm language. It runs before the network moderator and handles
 * common spacing, punctuation, repeated-letter, and leetspeak evasions.
 */
export function deterministicScreen(text: string): ModerationVerdict {
  const { phrase, words } = normalizedContent(text);
  const categories = new Set<string>();
  for (const word of words) {
    for (const blocked of BLOCKED_WORD_PATTERNS) {
      if (blocked.pattern.test(word)) categories.add(blocked.category);
    }
  }

  if (/\b(?:hurt|kill)\s+myself\b|\bsuicid(?:e|al)\b/.test(phrase)) {
    categories.add("local/self-harm");
  }

  return categories.size > 0
    ? { flagged: true, categories: [...categories] }
    : UNFLAGGED;
}

function isVerdict(value: unknown): value is ModerationVerdict {
  if (!value || typeof value !== "object") return false;
  const verdict = value as Partial<ModerationVerdict>;
  return (
    typeof verdict.flagged === "boolean" &&
    Array.isArray(verdict.categories) &&
    verdict.categories.every((category) => typeof category === "string") &&
    (verdict.unavailable === undefined || verdict.unavailable === true) &&
    (verdict.unavailable !== true || verdict.flagged)
  );
}

/**
 * The local filter runs first. Provider errors and malformed verdicts become a
 * distinct fail-closed verdict so callers can withhold text and show a truthful
 * retry message instead of treating an outage as approval.
 */
export async function safeScreen(
  text: string,
  moderator: ContentModerator,
  signal?: AbortSignal,
): Promise<ModerationVerdict> {
  const deterministic = deterministicScreen(text);
  if (deterministic.flagged) return deterministic;

  try {
    const verdict: unknown = await moderator.screen(text, signal);
    if (isVerdict(verdict)) return verdict;
    console.warn("Moderation returned an invalid verdict, withholding text");
    return MODERATION_UNAVAILABLE;
  } catch (error) {
    console.warn("Moderation threw, withholding text", error);
    return MODERATION_UNAVAILABLE;
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
  if (verdict.unavailable) {
    console.warn("Cooper reply was withheld because moderation was unavailable");
    return COOPER_MODERATION_UNAVAILABLE_REDIRECT;
  }
  if (!verdict.flagged) return drafted;
  console.warn("Cooper reply was withheld by moderation", { categories: verdict.categories });
  return COOPER_OUTBOUND_REDIRECT;
}
