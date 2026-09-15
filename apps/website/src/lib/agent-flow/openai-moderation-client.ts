import "server-only";

import {
  MODERATION_UNAVAILABLE,
  UNAVAILABLE_MODERATOR,
  UNFLAGGED,
  type ContentModerator,
  type ModerationVerdict,
} from "./moderation";

const OPENAI_MODERATIONS_URL = "https://api.openai.com/v1/moderations";
const DEFAULT_MODERATION_MODEL = "omni-moderation-latest";
/**
 * Screening runs twice per turn on the critical path, so it gets a much
 * tighter budget than the 30s model call. A slow provider returns the explicit
 * unavailable verdict instead of pushing the turn past the route's 60s ceiling.
 */
const DEFAULT_TIMEOUT_MS = 5_000;

type ModerationResult = {
  flagged?: unknown;
  categories?: unknown;
};

type ModerationPayload = {
  results?: unknown;
};

function flaggedCategories(categories: unknown): readonly string[] {
  if (!categories || typeof categories !== "object") return [];
  return Object.entries(categories)
    .filter(([, tripped]) => tripped === true)
    .map(([category]) => category);
}

function readVerdict(payload: ModerationPayload): ModerationVerdict | null {
  if (!Array.isArray(payload.results) || payload.results.length !== 1) return null;
  const [first] = payload.results as readonly ModerationResult[];
  if (
    !first ||
    typeof first !== "object" ||
    typeof first.flagged !== "boolean" ||
    !first.categories ||
    typeof first.categories !== "object" ||
    Array.isArray(first.categories) ||
    !Object.values(first.categories).every((value) => typeof value === "boolean")
  ) {
    return null;
  }
  return first.flagged
    ? { flagged: true, categories: flaggedCategories(first.categories) }
    : UNFLAGGED;
}

/**
 * Returns a distinct unavailable verdict on provider failure. Callers fail
 * closed with a kid-friendly retry response, without mistaking an outage for
 * unsafe content.
 */
export class OpenAIContentModerator implements ContentModerator {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(environment: NodeJS.ProcessEnv = process.env, timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.apiKey = environment.OPENAI_API_KEY?.trim() ?? "";
    this.model = environment.OPENAI_MODERATION_MODEL?.trim() || DEFAULT_MODERATION_MODEL;
    this.timeoutMs = Math.max(1_000, Math.min(timeoutMs, 30_000));
  }

  async screen(text: string, signal?: AbortSignal): Promise<ModerationVerdict> {
    if (!text.trim()) return UNFLAGGED;
    if (!this.apiKey) return MODERATION_UNAVAILABLE;

    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

    try {
      const response = await fetch(OPENAI_MODERATIONS_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model, input: text }),
        signal: combined,
      });
      if (!response.ok) {
        console.warn("Moderation request failed, withholding turn", {
          status: response.status,
        });
        return MODERATION_UNAVAILABLE;
      }
      const verdict = readVerdict(await response.json() as ModerationPayload);
      if (!verdict) {
        console.warn("Moderation returned an invalid payload, withholding turn");
        return MODERATION_UNAVAILABLE;
      }
      return verdict;
    } catch (error) {
      console.warn("Moderation request errored, withholding turn", error);
      return MODERATION_UNAVAILABLE;
    }
  }
}

export function createContentModerator(environment: NodeJS.ProcessEnv = process.env): ContentModerator {
  if (!environment.OPENAI_API_KEY?.trim()) {
    console.warn("OPENAI_API_KEY is unset, build chat will fail closed");
    return UNAVAILABLE_MODERATOR;
  }
  return new OpenAIContentModerator(environment);
}
