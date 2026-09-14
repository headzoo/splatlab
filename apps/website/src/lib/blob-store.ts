import { del } from "@vercel/blob";

import { isVercelBlobUrl } from "./blob-path";

export function blobReadWriteToken() {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim() || undefined;
}

export function hasBlobStore() {
  return Boolean(blobReadWriteToken());
}

export async function deleteOwnedBlob(url: string | null | undefined) {
  const token = blobReadWriteToken();
  if (!url || !isVercelBlobUrl(url) || !token) return;
  try {
    await del(url, { token });
  } catch (error) {
    console.error("Failed to delete blob", error);
  }
}
