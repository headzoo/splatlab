import assert from "node:assert/strict";
import test from "node:test";

import { HERO_CHOICES } from "./hero-catalog";

test("first-time hero choices include every named hero before generic bodies", () => {
  assert.deepEqual(HERO_CHOICES.slice(0, 2), [
    { value: "cooper", label: "Cooper", tone: "yellow" },
    {
      value: "rupert",
      label: "Rupert",
      tone: "teal",
      tagline: "I'll be there in ten.",
    },
  ]);
  assert.deepEqual(
    HERO_CHOICES.slice(0, 6).map((hero) => hero.value),
    ["cooper", "rupert", "jamie", "vix", "leenie", "lango"],
  );
  assert.deepEqual(HERO_CHOICES[4], {
    value: "leenie",
    label: "Leenie",
    tone: "coral",
  });
  assert.deepEqual(HERO_CHOICES[5], {
    value: "lango",
    label: "Lango",
    tone: "midnight",
    tagline: "If it doesn't exist, I'll build it.",
  });
});
