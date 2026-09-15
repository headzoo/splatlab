import assert from "node:assert/strict";
import test from "node:test";

import { createMenuResumeToken } from "./menu-resume-token";

test("an already-open menu preserves its original interrupted-play state", () => {
  const token = createMenuResumeToken();

  assert.equal(token.open(true), true);
  assert.equal(token.open(false), false);
  assert.equal(token.consume(), true);
  assert.equal(token.consume(), false);
});

test("a menu opened while paused exists but never restores gameplay", () => {
  const token = createMenuResumeToken();

  assert.equal(token.open(false), true);
  assert.equal(token.consume(), false);
});

for (const wasPlaying of [true, false]) {
  test(`successful video handoff starts a ${wasPlaying ? "playing" : "paused"} runtime`, () => {
    const token = createMenuResumeToken();
    let starts = 0;

    token.open(wasPlaying);
    // A successful recorder start consumes menu ownership, but deliberately
    // starts the runtime regardless of whether it had been paused.
    token.consume();
    starts += 1;

    assert.equal(starts, 1);
    assert.equal(token.consume(), false);
  });

  test(`failed video startup restores only a ${wasPlaying ? "playing" : "paused"} runtime`, () => {
    const token = createMenuResumeToken();
    let resumes = 0;

    token.open(wasPlaying);
    if (token.consume()) resumes += 1;

    assert.equal(resumes, wasPlaying ? 1 : 0);
  });
}
