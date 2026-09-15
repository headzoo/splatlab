import {
  BlobAccessError,
  BlobStoreNotFoundError,
  del,
  put,
} from "@vercel/blob";

import { isOwnedScreenshotPathname, isVercelBlobUrl } from "./blob-path";

const PLACEHOLDER = /replace-with-your|your-blob-token|your-blob-store/i;
const STORAGE_UNAVAILABLE =
  "Image storage isn't available. Connect the Vercel Blob store to this project and redeploy.";

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

function normalizeStoreId(storeId: string) {
  return storeId.startsWith("store_") ? storeId.slice("store_".length) : storeId;
}

function tokenTargetsStore(token: string, storeId: string | undefined) {
  if (!storeId) return true;
  const match = /^vercel_blob_rw_([^_]+)_/.exec(token);
  if (!match) return true;
  return match[1] === normalizeStoreId(storeId);
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

export function blobAuthCandidates(): BlobAuthOptions[] {
  const token = blobReadWriteToken();
  const storeId = blobStoreId();
  const oidc = envValue("VERCEL_OIDC_TOKEN");
  const onVercel = process.env.VERCEL === "1";
  const canUseOidc = Boolean(storeId && (onVercel || oidc));
  const candidates: BlobAuthOptions[] = [];

  if (token && tokenTargetsStore(token, storeId)) {
    candidates.push({ token });
  }
  if (canUseOidc && storeId) {
    candidates.push({ storeId });
  }
  if (token && !candidates.some((candidate) => "token" in candidate)) {
    candidates.push({ token });
  }

  return candidates;
}

export function blobCommandOptions(): BlobAuthOptions | undefined {
  return blobAuthCandidates()[0];
}

export function hasBlobStore() {
  return blobAuthCandidates().length > 0;
}

export function isBlobStorageConfigError(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith("Image storage isn't");
}

export function blobStoreIdForLogs() {
  const storeId = blobStoreId();
  if (storeId) {
    return normalizeStoreId(storeId);
  }
  const token = blobReadWriteToken();
  return token?.split("_")[3];
}

function authKind(auth: BlobAuthOptions) {
  return "token" in auth ? "token" : "oidc";
}

function isRetryableBlobAuthError(error: unknown) {
  return (
    error instanceof BlobAccessError || error instanceof BlobStoreNotFoundError
  );
}

async function withBlobAuth<T>(
  run: (auth: BlobAuthOptions) => Promise<T>,
  onFailure: (error: unknown, auth: BlobAuthOptions) => void,
) {
  const candidates = blobAuthCandidates();
  if (candidates.length === 0) {
    throw new Error("Image storage isn't configured on this server.");
  }

  let lastError: unknown;
  for (const [index, auth] of candidates.entries()) {
    try {
      return await run(auth);
    } catch (error) {
      lastError = error;
      onFailure(error, auth);
      const hasFallback = index < candidates.length - 1;
      if (!hasFallback || !isRetryableBlobAuthError(error)) {
        break;
      }
    }
  }

  if (
    lastError instanceof BlobAccessError ||
    lastError instanceof BlobStoreNotFoundError
  ) {
    throw new Error(STORAGE_UNAVAILABLE);
  }
  throw lastError;
}

export async function putOwnedBlob({
  pathname,
  body,
  contentType,
  addRandomSuffix = true,
  allowOverwrite = false,
}: PutOwnedBlobInput) {
  return withBlobAuth(
    (auth) =>
      put(pathname, body instanceof Blob ? body.slice() : body, {
        access: "public",
        addRandomSuffix,
        allowOverwrite,
        contentType,
        ...auth,
      }),
    (error, auth) => {
      console.error("Failed to upload blob", {
        storeId: blobStoreIdForLogs(),
        auth: authKind(auth),
        error,
      });
    },
  );
}

async function deleteBlob(target: string) {
  try {
    await withBlobAuth(
      (auth) => del(target, auth),
      (error, auth) => {
        console.error("Failed to delete blob", {
          storeId: blobStoreIdForLogs(),
          auth: authKind(auth),
          error,
        });
      },
    );
    return true;
  } catch {
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
