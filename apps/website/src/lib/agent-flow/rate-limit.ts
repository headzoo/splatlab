import { randomUUID } from "node:crypto";

import { getPrisma, hasDatabase } from "../prisma";

export const AGENTFLOW_RATE_LIMIT_WINDOW_MS = 60_000;
export const AGENTFLOW_RATE_LIMIT_MAX = 6;
export const AGENTFLOW_RATE_LIMIT_KEY_PREFIX = "agentflow:build-turn:";

export type RateLimitConsumeResult =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; retryAfterSeconds: number }>;

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

function retryAfterSeconds(lastRequestMs: number, nowMs: number): number {
  const remainingMs = lastRequestMs + AGENTFLOW_RATE_LIMIT_WINDOW_MS - nowMs;
  return Math.max(1, Math.ceil(remainingMs / 1_000));
}

function consumeFixedWindow(
  existing: { count: number; lastRequest: number } | undefined,
  nowMs: number,
): { next: { count: number; lastRequest: number }; result: RateLimitConsumeResult } {
  if (!existing || nowMs - existing.lastRequest >= AGENTFLOW_RATE_LIMIT_WINDOW_MS) {
    return {
      next: { count: 1, lastRequest: nowMs },
      result: { allowed: true },
    };
  }

  if (existing.count >= AGENTFLOW_RATE_LIMIT_MAX) {
    return {
      next: existing,
      result: {
        allowed: false,
        retryAfterSeconds: retryAfterSeconds(existing.lastRequest, nowMs),
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
    const key = agentflowRateLimitKey(ownerId);
    if (this.useMemory) {
      return this.consumeMemory(key);
    }
    return this.consumeDatabase(key);
  }

  private consumeMemory(key: string): RateLimitConsumeResult {
    const nowMs = Date.now();
    const entries = memoryEntries();
    const index = entries.findIndex((entry) => entry.key === key);
    const existing = index >= 0 ? entries[index] : undefined;
    const { next, result } = consumeFixedWindow(existing, nowMs);

    if (index >= 0) {
      entries[index] = { key, ...next };
    } else {
      entries.push({ key, ...next });
    }

    return result;
  }

  private async consumeDatabase(key: string): Promise<RateLimitConsumeResult> {
    const nowMs = Date.now();
    const prisma = getPrisma();
    const windowStartMs = nowMs - AGENTFLOW_RATE_LIMIT_WINDOW_MS;

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
         OR "rate_limit"."count" < ${AGENTFLOW_RATE_LIMIT_MAX}
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
      retryAfterSeconds: retryAfterSeconds(Number(existing.lastRequest), nowMs),
    };
  }
}
