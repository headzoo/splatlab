"use client";

import { upload } from "@vercel/blob/client";

import { authClient } from "@/lib/auth-client";
import {
  screenshotBlobPathname,
  thumbnailBlobPathname,
  type LabUploadKind,
} from "@/lib/blob-path";

export async function ensureLabSessionUserId() {
  let current = await authClient.getSession();

  if (!current.data) {
    const created = await authClient.signIn.anonymous();
    if (created.error) {
      throw new Error(created.error.message);
    }
    current = await authClient.getSession();
  }

  if (!current.data) {
    throw new Error("Sign in to save that image.");
  }

  return current.data.user.id;
}

export async function uploadLabImage(
  file: File,
  kind: LabUploadKind,
  gameId?: string,
) {
  const userId = await ensureLabSessionUserId();
  const pathname =
    kind === "thumbnail"
      ? thumbnailBlobPathname(userId, gameId ?? "")
      : screenshotBlobPathname(userId, crypto.randomUUID());

  return upload(pathname, file, {
    access: "public",
    handleUploadUrl: "/api/blob/upload",
    clientPayload: JSON.stringify({
      kind,
      gameId: gameId ?? null,
    }),
  });
}
