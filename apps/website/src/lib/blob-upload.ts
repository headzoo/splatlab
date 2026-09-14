"use client";

import { authClient } from "@/lib/auth-client";
import type { LabUploadKind } from "@/lib/blob-path";

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

function errorMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  return fallback;
}

export async function uploadLabImage(
  file: File,
  kind: LabUploadKind,
  gameId?: string,
) {
  await ensureLabSessionUserId();

  const form = new FormData();
  form.set("file", file);
  form.set("kind", kind);
  if (gameId) form.set("gameId", gameId);

  const response = await fetch("/api/blob/upload", {
    method: "POST",
    body: form,
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(errorMessage(payload, "We couldn't save that image."));
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    !("url" in payload) ||
    !("pathname" in payload) ||
    typeof payload.url !== "string" ||
    typeof payload.pathname !== "string"
  ) {
    throw new Error("We couldn't save that image.");
  }

  return {
    url: payload.url,
    pathname: payload.pathname,
  };
}
