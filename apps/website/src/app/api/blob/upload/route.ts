import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import {
  THUMBNAIL_MAX_BYTES,
  thumbnailBlobPathname,
} from "@/lib/blob-path";
import { hasBlobStore, isBlobStorageConfigError, putOwnedBlob } from "@/lib/blob-store";
import { getGame } from "@/lib/games";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const kindSchema = z.literal("thumbnail");
const gameIdSchema = z.string().trim().min(1).max(80);

function formString(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : null;
}

function uploadErrorResponse(error: unknown) {
  if (isBlobStorageConfigError(error)) {
    return NextResponse.json({ message: error.message }, { status: 503 });
  }
  console.error("Failed to upload blob", error);
  return NextResponse.json(
    { message: "We couldn't save that image." },
    { status: 400 },
  );
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json(
      { message: "Sign in to save that image." },
      { status: 401 },
    );
  }

  if (!hasBlobStore()) {
    return NextResponse.json(
      {
        message:
          "Image storage isn't configured on this server. Connect the Vercel Blob store to this project and redeploy.",
      },
      { status: 503 },
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const kindResult = form
    ? kindSchema.safeParse(formString(form, "kind"))
    : null;

  if (!form || !(file instanceof File) || !kindResult?.success) {
    return NextResponse.json(
      { message: "That image upload was not valid." },
      { status: 400 },
    );
  }

  const rawGameId = formString(form, "gameId");
  const gameIdResult = rawGameId ? gameIdSchema.safeParse(rawGameId) : null;
  if (rawGameId && !gameIdResult?.success) {
    return NextResponse.json(
      { message: "That image upload was not valid." },
      { status: 400 },
    );
  }

  const gameId = gameIdResult?.success ? gameIdResult.data : null;
  if (
    file.type !== "image/webp" ||
    file.size <= 0 ||
    file.size > THUMBNAIL_MAX_BYTES
  ) {
    return NextResponse.json(
      { message: "That image upload was not valid." },
      { status: 400 },
    );
  }

  try {
    const pathname = await thumbnailPathForGame(session.user.id, gameId);

    const uploaded = await putOwnedBlob({
      pathname,
      body: file,
      contentType: "image/webp",
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    return NextResponse.json({
      url: uploaded.url,
      pathname: uploaded.pathname,
      contentType: uploaded.contentType,
    });
  } catch (error) {
    if (error instanceof UploadRequestError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }
    return uploadErrorResponse(error);
  }
}

class UploadRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function thumbnailPathForGame(userId: string, gameId: string | null) {
  if (!gameId) {
    throw new UploadRequestError("That game image was not valid.", 400);
  }
  const game = await getGame(userId, gameId);
  if (!game) {
    throw new UploadRequestError("Game not found.", 404);
  }
  return thumbnailBlobPathname(userId, gameId);
}
