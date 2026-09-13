import { randomUUID } from "node:crypto";

import { getPrisma, hasDatabase } from "../prisma";

export const AGENTFLOW_RATE_LIMIT_WINDOW_MS = 60_000;
export const AGENTFLOW_RATE_LIMIT_MAX = 6;
export const AGENTFLOW_RATE_LIMIT_KEY_PREFIX = "agentflow:build-turn:";

/**
 * A spend ceiling rather than an abuse control. The burst window alone allows
 * roughly 8,600 model-bearing turns a day per owner, so this is what actually
 * bounds what one account can cost. The window runs 24h from an owner's first
 * turn, not from midnight.
 */
export const AGENTFLOW_DAILY_LIMIT_WINDOW_MS = 24 * 60 * 60_000;
export const AGENTFLOW_DAILY_LIMIT_MAX = 120;
export const AGENTFLOW_DAILY_LIMIT_KEY_PREFIX = "agentflow:build-turn-daily:";

export type RateLimitScope = "burst" | "daily";

export type RateLimitConsumeResult =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; scope: RateLimitScope; retryAfterSeconds: number }>;

type MemoryRateLimitEntry = {
  key: string;
  count: number;
  lastRequest: number;
};

declare global {
  var splatLabAgentflowRateLimitMemory: MemoryRateLimitEntry[] | undefined;
}

function memoryEntries() {
  globalThis.splatLabAgentflowRateLimitMemory ??= [];
  return globalThis.splatLabAgentflowRateLimitMemory;
}

export function agentflowRateLimitKey(ownerId: string): string {
  return `${AGENTFLOW_RATE_LIMIT_KEY_PREFIX}${ownerId}`;
}

export function agentflowDailyLimitKey(ownerId: string): string {
  return `${AGENTFLOW_DAILY_LIMIT_KEY_PREFIX}${ownerId}`;
}

type WindowConfig = Readonly<{ key: string; windowMs: number; max: number; scope: RateLimitScope }>;

function windowsFor(ownerId: string): readonly WindowConfig[] {
  // Burst is consumed first so a daily-capped owner does not also burn a daily
  // slot, and a burst-limited owner only spends a slot that resets in a minute.
  return [
    { key: agentflowRateLimitKey(ownerId), windowMs: AGENTFLOW_RATE_LIMIT_WINDOW_MS, max: AGENTFLOW_RATE_LIMIT_MAX, scope: "burst" },
    { key: agentflowDailyLimitKey(ownerId), windowMs: AGENTFLOW_DAILY_LIMIT_WINDOW_MS, max: AGENTFLOW_DAILY_LIMIT_MAX, scope: "daily" },
  ];
}

function retryAfterSeconds(lastRequestMs: number, nowMs: number, windowMs: number): number {
  const remainingMs = lastRequestMs + windowMs - nowMs;
  return Math.max(1, Math.ceil(remainingMs / 1_000));
}

function consumeFixedWindow(
  existing: { count: number; lastRequest: number } | undefined,
  nowMs: number,
  window: WindowConfig,
): { next: { count: number; lastRequest: number }; result: RateLimitConsumeResult } {
  if (!existing || nowMs - existing.lastRequest >= window.windowMs) {
    return {
      next: { count: 1, lastRequest: nowMs },
      result: { allowed: true },
    };
  }

  if (existing.count >= window.max) {
    return {
      next: existing,
      result: {
        allowed: false,
        scope: window.scope,
        retryAfterSeconds: retryAfterSeconds(existing.lastRequest, nowMs, window.windowMs),
      },
    };
  }

  return {
    next: { count: existing.count + 1, lastRequest: existing.lastRequest },
    result: { allowed: true },
  };
}

export class AgentflowRateLimiter {
  private readonly forceMemory: boolean;

  constructor(options: { forceMemory?: boolean } = {}) {
    this.forceMemory = options.forceMemory ?? false;
  }

  private get useMemory() {
    return this.forceMemory || !hasDatabase();
  }

  async consume(ownerId: string): Promise<RateLimitConsumeResult> {
    for (const window of windowsFor(ownerId)) {
      const result = this.useMemory
        ? this.consumeMemory(window)
        : await this.consumeDatabase(window);
      if (!result.allowed) return result;
    }
    return { allowed: true };
  }

  private consumeMemory(window: WindowConfig): RateLimitConsumeResult {
    const nowMs = Date.now();
    const entries = memoryEntries();
    const index = entries.findIndex((entry) => entry.key === window.key);
    const existing = index >= 0 ? entries[index] : undefined;
    const { next, result } = consumeFixedWindow(existing, nowMs, window);

    if (index >= 0) {
      entries[index] = { key: window.key, ...next };
    } else {
      entries.push({ key: window.key, ...next });
    }

    return result;
  }

  private async consumeDatabase(window: WindowConfig): Promise<RateLimitConsumeResult> {
    const { key } = window;
    const nowMs = Date.now();
    const prisma = getPrisma();
    const windowStartMs = nowMs - window.windowMs;

    const consumed = await prisma.$queryRaw<Array<{ count: number; lastRequest: bigint }>>`
      INSERT INTO "rate_limit" ("id", "key", "count", "last_request")
      VALUES (${randomUUID()}, ${key}, 1, ${BigInt(nowMs)})
      ON CONFLICT ("key") DO UPDATE
      SET
        "count" = CASE
          WHEN "rate_limit"."last_request" <= ${BigInt(windowStartMs)} THEN 1
          ELSE "rate_limit"."count" + 1
        END,
        "last_request" = CASE
          WHEN "rate_limit"."last_request" <= ${BigInt(windowStartMs)} THEN ${BigInt(nowMs)}
          ELSE "rate_limit"."last_request"
        END
      WHERE "rate_limit"."last_request" <= ${BigInt(windowStartMs)}
         OR "rate_limit"."count" < ${window.max}
      RETURNING "count", "last_request" AS "lastRequest"
    `;
    if (consumed.length === 1) return { allowed: true };

    const [existing] = await prisma.$queryRaw<Array<{ lastRequest: bigint }>>`
      SELECT "last_request" AS "lastRequest"
      FROM "rate_limit"
      WHERE "key" = ${key}
    `;
    if (!existing) {
      throw new Error("Rate limit row disappeared during consumption.");
    }
    return {
      allowed: false,
      scope: window.scope,
      retryAfterSeconds: retryAfterSeconds(Number(existing.lastRequest), nowMs, window.windowMs),
    };
  }
}
