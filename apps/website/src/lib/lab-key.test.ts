import assert from "node:assert/strict";
import test from "node:test";

import {
  createLabKeyLookup,
  createLabKeyChecksum,
  generateLabKey,
  hasValidLabKeyChecksum,
  isChecksummedLabKey,
  hashLabKey,
  normalizeLabKey,
  verifyLabKey,
} from "./lab-key";

const checksumSecret = "test-only-lab-key-checksum-secret";

test("generated Lab Keys use four random blocks and a valid private checksum", () => {
  const generated = new Set<string>();

  for (let index = 0; index < 100; index += 1) {
    const labKey = generateLabKey(checksumSecret);
    assert.match(labKey, /^(?:\d{6}-){4}\d{6}$/);
    assert.equal(isChecksummedLabKey(labKey), true);
    assert.equal(hasValidLabKeyChecksum(labKey, checksumSecret), true);
    generated.add(labKey);
  }

  assert.ok(generated.size > 1);
});

test("Lab Keys normalize kid-friendly separators and casing", () => {
  assert.equal(
    normalizeLabKey("  482917 063541-829304_771625-038451  "),
    "482917-063541-829304-771625-038451",
  );
  assert.equal(
    normalizeLabKey("482917\u2013063541\u2013829304\u2013771625\u2013038451"),
    "482917-063541-829304-771625-038451",
  );
  assert.equal(normalizeLabKey("taco-moon-frog-82"), "TACO-MOON-FROG-82");
  assert.equal(normalizeLabKey("not-a-lab-key"), null);
});

test("private checksums are stable, secret-bound, and reject altered keys", () => {
  const payload = "482917-063541-829304-771625";
  const checksum = createLabKeyChecksum(payload, checksumSecret);
  const labKey = `${payload}-${checksum}`;
  const altered = `482918-${labKey.slice(7)}`;

  assert.match(checksum, /^\d{6}$/);
  assert.equal(createLabKeyChecksum(payload, checksumSecret), checksum);
  assert.notEqual(
    createLabKeyChecksum(payload, "different-checksum-secret"),
    checksum,
  );
  assert.equal(hasValidLabKeyChecksum(labKey, checksumSecret), true);
  assert.equal(hasValidLabKeyChecksum(altered, checksumSecret), false);
  assert.equal(hasValidLabKeyChecksum("TACO-MOON-FROG-82", checksumSecret), false);
});

test("lookup digests are stable and peppered", () => {
  const labKey = "482917-063541-829304-771625-038451";
  const first = createLabKeyLookup(labKey, "pepper-one");
  const second = createLabKeyLookup(labKey, "pepper-one");
  const other = createLabKeyLookup(labKey, "pepper-two");

  assert.equal(first, second);
  assert.notEqual(first, other);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("Lab Key verifiers accept only the original key", async () => {
  const labKey = generateLabKey(checksumSecret);
  const hash = await hashLabKey(labKey);
  const changed = `${labKey.slice(0, -1)}${labKey.endsWith("0") ? "1" : "0"}`;

  assert.equal(await verifyLabKey(labKey, hash), true);
  assert.equal(await verifyLabKey(changed, hash), false);
  assert.equal(await verifyLabKey(labKey, "broken"), false);
});

test("legacy word-based Lab Keys remain verifiable during migration", async () => {
  const labKey = "TACO-MOON-FROG-82";
  const hash = await hashLabKey(labKey);

  assert.equal(isChecksummedLabKey(labKey), false);
  assert.equal(await verifyLabKey(labKey, hash), true);
});
