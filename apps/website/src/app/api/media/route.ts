import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { hasBlobStore, isBlobStorageConfigError } from "@/lib/blob-store";
import { listMedia, saveScreenshotUpload } from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const gameIdSchema = z.string().trim().min(1).max(80);

function formString(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : null;
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json(
      { message: "Sign in to see your media library." },
      { status: 401 },
    );
  }

  try {
    const media = await listMedia(session.user.id);
    return NextResponse.json(
      { media },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to list media", error);
    return NextResponse.json(
      { message: "We couldn't load your media library." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json(
      { message: "Sign in to save that screenshot." },
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
  const rawGameId = form ? formString(form, "gameId") : null;
  const gameIdResult = rawGameId ? gameIdSchema.safeParse(rawGameId) : null;

  if (
    !form ||
    !(file instanceof File) ||
    (rawGameId && !gameIdResult?.success)
  ) {
    return NextResponse.json(
      { message: "That screenshot was not valid." },
      { status: 400 },
    );
  }

  try {
    const result = await saveScreenshotUpload(
      session.user.id,
      file,
      gameIdResult?.success ? gameIdResult.data : null,
    );

    if (result.status === "limit") {
      return NextResponse.json(
        {
          message:
            "Your media library is full. Delete a screenshot to save another.",
        },
        { status: 409 },
      );
    }

    if (result.status === "invalid") {
      return NextResponse.json(
        { message: "That screenshot was not valid." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { media: result.media },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to save screenshot", error);
    if (isBlobStorageConfigError(error)) {
      return NextResponse.json(
        { message: error.message },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { message: "We couldn't save that screenshot." },
      { status: 500 },
    );
  }
}
