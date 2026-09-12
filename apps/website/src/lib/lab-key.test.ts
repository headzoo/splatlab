import assert from "node:assert/strict";
import test from "node:test";

import {
  createLabKeyLookup,
  generateLabKey,
  hashLabKey,
  normalizeLabKey,
  verifyLabKey,
} from "./lab-key";

test("generated Lab Keys use the HackYard format", () => {
  for (let index = 0; index < 100; index += 1) {
    assert.match(generateLabKey(), /^[A-Z]+-[A-Z]+-[A-Z]+-\d{2}$/);
  }
});

test("Lab Keys normalize kid-friendly separators and casing", () => {
  assert.equal(normalizeLabKey("  taco moon-frog_82  "), "TACO-MOON-FROG-82");
  assert.equal(normalizeLabKey("taco\u2013moon\u2013frog\u201382"), "TACO-MOON-FROG-82");
  assert.equal(normalizeLabKey("not-a-lab-key"), null);
});

test("lookup digests are stable and peppered", () => {
  const first = createLabKeyLookup("TACO-MOON-FROG-82", "pepper-one");
  const second = createLabKeyLookup("TACO-MOON-FROG-82", "pepper-one");
  const other = createLabKeyLookup("TACO-MOON-FROG-82", "pepper-two");

  assert.equal(first, second);
  assert.notEqual(first, other);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("Lab Key verifiers accept only the original key", async () => {
  const hash = await hashLabKey("TACO-MOON-FROG-82");

  assert.equal(await verifyLabKey("TACO-MOON-FROG-82", hash), true);
  assert.equal(await verifyLabKey("TACO-MOON-FROG-83", hash), false);
  assert.equal(await verifyLabKey("TACO-MOON-FROG-82", "broken"), false);
});
