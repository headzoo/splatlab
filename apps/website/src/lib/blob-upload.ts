"use client";

import { authClient } from "@/lib/auth-client";

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
  kind: "thumbnail",
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

export async function saveLabScreenshot(file: File, gameId?: string) {
  await ensureLabSessionUserId();

  const form = new FormData();
  form.set("file", file);
  if (gameId) form.set("gameId", gameId);

  const response = await fetch("/api/media", {
    method: "POST",
    body: form,
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(errorMessage(payload, "Could not save this image."));
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    !("media" in payload) ||
    !payload.media ||
    typeof payload.media !== "object" ||
    !("id" in payload.media) ||
    typeof payload.media.id !== "string"
  ) {
    throw new Error("Could not save this image.");
  }

  return payload.media;
}

export async function saveLabVideo(
  video: File,
  poster: File,
  details: {
    gameId?: string;
    durationMs: number;
    width: number;
    height: number;
  },
) {
  await ensureLabSessionUserId();

  const form = new FormData();
  form.set("video", video);
  form.set("poster", poster);
  form.set("durationMs", String(details.durationMs));
  form.set("width", String(details.width));
  form.set("height", String(details.height));
  if (details.gameId) form.set("gameId", details.gameId);

  const response = await fetch("/api/media/video", {
    method: "POST",
    body: form,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(errorMessage(payload, "We couldn't save that video."));
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    !("media" in payload) ||
    !payload.media ||
    typeof payload.media !== "object" ||
    !("id" in payload.media) ||
    typeof payload.media.id !== "string" ||
    !("kind" in payload.media) ||
    payload.media.kind !== "video"
  ) {
    throw new Error("We couldn't save that video.");
  }
  return payload.media;
}
