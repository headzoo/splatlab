import assert from "node:assert/strict";
import test from "node:test";

import {
  DISPLAY_NAME_AVATARS,
  UNSET_DISPLAY_NAME,
  buildDisplayNameOptions,
  displayNameAvatarSrc,
  hasChosenDisplayName,
  isValidDisplayNameAvatarId,
  isValidGeneratedDisplayName,
} from "./display-name";

test("generated Lab names are unique Title Noun pairs", () => {
  const names = buildDisplayNameOptions();

  assert.equal(names.length, 8);
  assert.equal(new Set(names).size, 8);

  for (const name of names) {
    assert.match(name, /^[A-Z][a-z]+ [A-Z][a-z]+$/);
    assert.equal(isValidGeneratedDisplayName(name), true);
    assert.notEqual(name, UNSET_DISPLAY_NAME);
  }
});

test("the display-name validator accepts generated names and rejects extras", () => {
  const [name] = buildDisplayNameOptions(1);

  assert.equal(isValidGeneratedDisplayName(name), true);
  assert.equal(isValidGeneratedDisplayName(UNSET_DISPLAY_NAME), false);
  assert.equal(isValidGeneratedDisplayName(""), false);
  assert.equal(isValidGeneratedDisplayName("Captain Zebra Extra"), false);
  assert.equal(isValidGeneratedDisplayName("captain zebra"), false);
});

test("unset Lab Creator names are treated as not chosen", () => {
  assert.equal(hasChosenDisplayName(UNSET_DISPLAY_NAME), false);
  assert.equal(hasChosenDisplayName(""), false);
  assert.equal(hasChosenDisplayName(null), false);
  assert.equal(hasChosenDisplayName("Captain Zebra"), true);
});

test("portrait ids map to the eight fixed Lab name images", () => {
  assert.equal(DISPLAY_NAME_AVATARS.length, 8);
  assert.equal(isValidDisplayNameAvatarId("lab-name-01"), true);
  assert.equal(isValidDisplayNameAvatarId("lab-name-08"), true);
  assert.equal(isValidDisplayNameAvatarId("lab-name-09"), false);
  assert.equal(displayNameAvatarSrc("lab-name-03"), "/brand/lab-names/03.png");
  assert.equal(displayNameAvatarSrc("missing"), null);
});
