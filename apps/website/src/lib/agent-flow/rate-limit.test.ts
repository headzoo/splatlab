import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENTFLOW_DAILY_LIMIT_MAX,
  AGENTFLOW_RATE_LIMIT_MAX,
  AGENTFLOW_RATE_LIMIT_WINDOW_MS,
  AgentflowRateLimiter,
  agentflowDailyLimitKey,
  agentflowRateLimitKey,
} from "./rate-limit";

function resetMemory() {
  globalThis.splatLabAgentflowRateLimitMemory = [];
}

function entryFor(key: string) {
  return globalThis.splatLabAgentflowRateLimitMemory?.find((entry) => entry.key === key);
}

/** Ages both windows by `ms`, standing in for the passage of time. */
function rewind(ms: number) {
  for (const entry of globalThis.splatLabAgentflowRateLimitMemory ?? []) {
    entry.lastRequest -= ms;
  }
}

test("the burst window still denies the seventh request in a minute", async () => {
  resetMemory();
  const limiter = new AgentflowRateLimiter({ forceMemory: true });

  for (let attempt = 0; attempt < AGENTFLOW_RATE_LIMIT_MAX; attempt += 1) {
    assert.equal((await limiter.consume("owner-a")).allowed, true);
  }

  const denied = await limiter.consume("owner-a");
  assert.equal(denied.allowed, false);
  if (denied.allowed) return;
  assert.equal(denied.scope, "burst");
  assert.ok(denied.retryAfterSeconds >= 1 && denied.retryAfterSeconds <= 60);
});

test("a burst denial does not spend a daily slot", async () => {
  resetMemory();
  const limiter = new AgentflowRateLimiter({ forceMemory: true });

  for (let attempt = 0; attempt < AGENTFLOW_RATE_LIMIT_MAX + 3; attempt += 1) {
    await limiter.consume("owner-a");
  }

  assert.equal(
    entryFor(agentflowDailyLimitKey("owner-a"))?.count,
    AGENTFLOW_RATE_LIMIT_MAX,
    "only requests that cleared the burst gate should count against the day",
  );
});

test("the daily cap denies an owner who has burst-limited their way through the day", async () => {
  resetMemory();
  const limiter = new AgentflowRateLimiter({ forceMemory: true });

  // Spend the whole daily allowance, rolling the burst window forward so it is
  // never the limiter that answers.
  for (let spent = 0; spent < AGENTFLOW_DAILY_LIMIT_MAX; spent += AGENTFLOW_RATE_LIMIT_MAX) {
    for (let attempt = 0; attempt < AGENTFLOW_RATE_LIMIT_MAX; attempt += 1) {
      assert.equal((await limiter.consume("owner-a")).allowed, true);
    }
    rewind(AGENTFLOW_RATE_LIMIT_WINDOW_MS);
  }

  const denied = await limiter.consume("owner-a");
  assert.equal(denied.allowed, false);
  if (denied.allowed) return;
  assert.equal(denied.scope, "daily");
  assert.ok(denied.retryAfterSeconds > 60, "a daily denial should not suggest retrying in a minute");
});

test("the two windows are counted under separate keys", async () => {
  resetMemory();
  const limiter = new AgentflowRateLimiter({ forceMemory: true });

  await limiter.consume("owner-a");

  assert.notEqual(agentflowRateLimitKey("owner-a"), agentflowDailyLimitKey("owner-a"));
  assert.equal(entryFor(agentflowRateLimitKey("owner-a"))?.count, 1);
  assert.equal(entryFor(agentflowDailyLimitKey("owner-a"))?.count, 1);
});

test("owners are limited independently of each other", async () => {
  resetMemory();
  const limiter = new AgentflowRateLimiter({ forceMemory: true });

  for (let attempt = 0; attempt < AGENTFLOW_RATE_LIMIT_MAX; attempt += 1) {
    await limiter.consume("owner-a");
  }

  assert.equal((await limiter.consume("owner-a")).allowed, false);
  assert.equal((await limiter.consume("owner-b")).allowed, true);
});
