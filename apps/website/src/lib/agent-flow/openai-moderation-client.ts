import "server-only";

import { ALLOW_ALL_MODERATOR, UNFLAGGED, type ContentModerator, type ModerationVerdict } from "./moderation";

const OPENAI_MODERATIONS_URL = "https://api.openai.com/v1/moderations";
const DEFAULT_MODERATION_MODEL = "omni-moderation-latest";
/**
 * Screening runs twice per turn on the critical path, so it gets a much
 * tighter budget than the 30s model call. A slow provider fails open rather
 * than pushing the turn past the route's 60s ceiling.
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

function readVerdict(payload: ModerationPayload): ModerationVerdict {
  if (!Array.isArray(payload.results) || !payload.results.length) return UNFLAGGED;
  const [first] = payload.results as readonly ModerationResult[];
  if (!first || typeof first !== "object" || first.flagged !== true) return UNFLAGGED;
  return { flagged: true, categories: flaggedCategories(first.categories) };
}

/**
 * Fails open by design. A moderation outage should not take the builder down
 * for every kid using it, and the agent's blast radius is already bounded by
 * the tool allowlist and the physics envelope.
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
    if (!this.apiKey || !text.trim()) return UNFLAGGED;

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
        console.warn("Moderation request failed, allowing turn", { status: response.status });
        return UNFLAGGED;
      }
      return readVerdict(await response.json() as ModerationPayload);
    } catch (error) {
      console.warn("Moderation request errored, allowing turn", error);
      return UNFLAGGED;
    }
  }
}

export function createContentModerator(environment: NodeJS.ProcessEnv = process.env): ContentModerator {
  if (!environment.OPENAI_API_KEY?.trim()) {
    console.warn("OPENAI_API_KEY is unset, build chat moderation is disabled");
    return ALLOW_ALL_MODERATOR;
  }
  return new OpenAIContentModerator(environment);
}
