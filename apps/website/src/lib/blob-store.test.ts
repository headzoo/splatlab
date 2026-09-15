import assert from "node:assert/strict";
import test from "node:test";

import {
  blobCommandOptions,
  blobReadWriteToken,
  blobStoreId,
  blobStoreIdForLogs,
  hasBlobStore,
} from "./blob-store";

const ENV_KEYS = [
  "BLOB_READ_WRITE_TOKEN",
  "BLOB_STORE_ID",
  "VERCEL",
  "VERCEL_OIDC_TOKEN",
] as const;

function withEnv(
  overrides: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>,
  run: () => void,
) {
  const previous = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  );

  try {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    run();
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("placeholder blob credentials are treated as missing", () => {
  withEnv(
    {
      BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_replace-with-your-blob-token",
      BLOB_STORE_ID: "store_replace-with-your-blob-store-id",
    },
    () => {
      assert.equal(blobReadWriteToken(), undefined);
      assert.equal(blobStoreId(), undefined);
      assert.equal(hasBlobStore(), false);
    },
  );
});

test("local development uses the read-write token", () => {
  withEnv(
    {
      BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_liveStore_secret",
      BLOB_STORE_ID: "store_liveStore",
    },
    () => {
      assert.deepEqual(blobCommandOptions(), {
        token: "vercel_blob_rw_liveStore_secret",
      });
      assert.equal(hasBlobStore(), true);
      assert.equal(blobStoreIdForLogs(), "liveStore");
    },
  );
});

test("current opaque Blob tokens are accepted without a legacy prefix", () => {
  withEnv(
    {
      BLOB_READ_WRITE_TOKEN: "vbl_opaque-token-value",
      BLOB_STORE_ID: "store_liveStore",
    },
    () => {
      assert.equal(blobReadWriteToken(), "vbl_opaque-token-value");
      assert.deepEqual(blobCommandOptions(), {
        token: "vbl_opaque-token-value",
      });
      assert.equal(hasBlobStore(), true);
    },
  );
});

test("Vercel prefers the connected store over a stale read-write token", () => {
  withEnv(
    {
      VERCEL: "1",
      VERCEL_OIDC_TOKEN: "oidc-token",
      BLOB_STORE_ID: "store_connectedStore",
      BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_deletedStore_secret",
    },
    () => {
      assert.deepEqual(blobCommandOptions(), {
        storeId: "store_connectedStore",
      });
      assert.equal(blobStoreIdForLogs(), "connectedStore");
    },
  );
});
