import assert from "node:assert/strict";
import test from "node:test";

import {
  elementSupportsFullscreen,
  exitDocumentFullscreen,
  fullscreenApiAvailable,
  fullscreenButtonLabel,
  fullscreenElement,
  requestElementFullscreen,
  type FullscreenCapableDocument,
  type FullscreenCapableElement,
} from "./fullscreen";

const fakeElement = {} as Element;

test("fullscreenApiAvailable needs both an enabled flag and an exit method", () => {
  assert.equal(fullscreenApiAvailable(null), false);
  assert.equal(fullscreenApiAvailable({}), false);
  assert.equal(fullscreenApiAvailable({ fullscreenEnabled: true }), false);
  assert.equal(
    fullscreenApiAvailable({ fullscreenEnabled: false, exitFullscreen: async () => {} }),
    false,
  );
  assert.equal(
    fullscreenApiAvailable({ fullscreenEnabled: true, exitFullscreen: async () => {} }),
    true,
  );
  assert.equal(
    fullscreenApiAvailable({
      webkitFullscreenEnabled: true,
      webkitExitFullscreen: () => {},
    }),
    true,
  );
});

test("elementSupportsFullscreen rejects elements with no request method", () => {
  assert.equal(elementSupportsFullscreen(null), false);
  assert.equal(elementSupportsFullscreen({}), false);
  assert.equal(elementSupportsFullscreen({ requestFullscreen: async () => {} }), true);
  assert.equal(elementSupportsFullscreen({ webkitRequestFullscreen: () => {} }), true);
});

test("fullscreenElement reads the standard property before the prefixed one", () => {
  assert.equal(fullscreenElement(null), null);
  assert.equal(fullscreenElement({}), null);
  assert.equal(fullscreenElement({ webkitFullscreenElement: fakeElement }), fakeElement);
  assert.equal(
    fullscreenElement({ fullscreenElement: fakeElement, webkitFullscreenElement: null }),
    fakeElement,
  );
});

test("requestElementFullscreen prefers the standard method and reports success", async () => {
  const calls: string[] = [];
  const element: FullscreenCapableElement = {
    requestFullscreen: async () => {
      calls.push("standard");
    },
    webkitRequestFullscreen: () => {
      calls.push("webkit");
    },
  };

  assert.equal(await requestElementFullscreen(element), true);
  assert.deepEqual(calls, ["standard"]);
});

test("requestElementFullscreen falls back to the prefixed method", async () => {
  const calls: string[] = [];
  assert.equal(
    await requestElementFullscreen({
      webkitRequestFullscreen: () => {
        calls.push("webkit");
      },
    }),
    true,
  );
  assert.deepEqual(calls, ["webkit"]);
});

test("requestElementFullscreen reports failure instead of throwing", async () => {
  assert.equal(await requestElementFullscreen(null), false);
  assert.equal(await requestElementFullscreen({}), false);
  assert.equal(
    await requestElementFullscreen({
      requestFullscreen: async () => {
        throw new Error("gesture refused");
      },
    }),
    false,
  );
});

test("exitDocumentFullscreen handles both spellings and refusals", async () => {
  const calls: string[] = [];
  const doc: FullscreenCapableDocument = {
    exitFullscreen: async () => {
      calls.push("standard");
    },
    webkitExitFullscreen: () => {
      calls.push("webkit");
    },
  };

  assert.equal(await exitDocumentFullscreen(doc), true);
  assert.deepEqual(calls, ["standard"]);

  assert.equal(
    await exitDocumentFullscreen({
      webkitExitFullscreen: () => {
        calls.push("webkit");
      },
    }),
    true,
  );
  assert.deepEqual(calls, ["standard", "webkit"]);

  assert.equal(await exitDocumentFullscreen(null), false);
  assert.equal(await exitDocumentFullscreen({}), false);
  assert.equal(
    await exitDocumentFullscreen({
      exitFullscreen: async () => {
        throw new Error("already windowed");
      },
    }),
    false,
  );
});

test("fullscreenButtonLabel switches between enter and exit wording", () => {
  assert.equal(fullscreenButtonLabel(false), "⤢ Full screen");
  assert.equal(fullscreenButtonLabel(true), "⤡ Exit full screen");
});
