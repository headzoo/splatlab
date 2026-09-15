import { BlobStoreNotFoundError, del, put } from "@vercel/blob";

import { isOwnedScreenshotPathname, isVercelBlobUrl } from "./blob-path";

const PLACEHOLDER = /replace-with-your|your-blob-token|your-blob-store/i;

export type BlobAuthOptions = { token: string } | { storeId: string };

export type PutOwnedBlobInput = {
  pathname: string;
  body: File | Blob;
  contentType: string;
  addRandomSuffix?: boolean;
  allowOverwrite?: boolean;
};

function envValue(name: string) {
  return process.env[name]?.trim() || undefined;
}

function isPlaceholder(value: string) {
  return PLACEHOLDER.test(value);
}

export function blobReadWriteToken() {
  const token = envValue("BLOB_READ_WRITE_TOKEN");
  if (!token || isPlaceholder(token)) {
    return undefined;
  }
  return token;
}

export function blobStoreId() {
  const storeId = envValue("BLOB_STORE_ID");
  if (!storeId || isPlaceholder(storeId)) return undefined;
  return storeId;
}

export function blobCommandOptions(): BlobAuthOptions | undefined {
  const token = blobReadWriteToken();
  const storeId = blobStoreId();
  const oidc = envValue("VERCEL_OIDC_TOKEN");
  const onVercel = process.env.VERCEL === "1";

  // handleUpload cannot use OIDC, but put/del can. Prefer the connected store
  // on Vercel so a stale or placeholder read-write token cannot target a
  // deleted store while BLOB_STORE_ID still points at the live one.
  if (onVercel && storeId && oidc) {
    return { storeId };
  }
  if (token) {
    return { token };
  }
  if (storeId && oidc) {
    return { storeId };
  }
  return undefined;
}

export function hasBlobStore() {
  return Boolean(blobCommandOptions());
}

export function blobStoreIdForLogs() {
  const storeId = blobStoreId();
  if (storeId) {
    return storeId.startsWith("store_") ? storeId.slice("store_".length) : storeId;
  }
  const token = blobReadWriteToken();
  return token?.split("_")[3];
}

export async function putOwnedBlob({
  pathname,
  body,
  contentType,
  addRandomSuffix = true,
  allowOverwrite = false,
}: PutOwnedBlobInput) {
  const auth = blobCommandOptions();
  if (!auth) {
    throw new Error("Image storage isn't configured on this server.");
  }

  try {
    return await put(pathname, body, {
      access: "public",
      addRandomSuffix,
      allowOverwrite,
      contentType,
      ...auth,
    });
  } catch (error) {
    console.error("Failed to upload blob", {
      storeId: blobStoreIdForLogs(),
      auth: "token" in auth ? "token" : "oidc",
      error,
    });
    if (error instanceof BlobStoreNotFoundError) {
      throw new Error(
        "Image storage isn't available. Connect the Vercel Blob store to this project and redeploy.",
      );
    }
    throw error;
  }
}

async function deleteBlob(target: string) {
  const auth = blobCommandOptions();
  if (!auth) return false;
  try {
    await del(target, auth);
    return true;
  } catch (error) {
    console.error("Failed to delete blob", {
      storeId: blobStoreIdForLogs(),
      error,
    });
    return false;
  }
}

export async function deleteOwnedBlob(url: string | null | undefined) {
  if (!url || !isVercelBlobUrl(url)) return false;
  return deleteBlob(url);
}

export async function deleteOwnedScreenshotBlob(
  ownerId: string,
  pathname: string,
) {
  if (!isOwnedScreenshotPathname(ownerId, pathname)) return false;
  return deleteBlob(pathname);
}
