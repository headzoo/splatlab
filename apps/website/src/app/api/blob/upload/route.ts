import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import {
  isOwnedUploadPathname,
  SCREENSHOT_MAX_BYTES,
  THUMBNAIL_MAX_BYTES,
  type LabUploadKind,
} from "@/lib/blob-path";
import { blobReadWriteToken } from "@/lib/blob-store";
import { getGame } from "@/lib/games";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uploadPayloadSchema = z
  .object({
    kind: z.enum(["screenshot", "thumbnail"]),
    gameId: z.string().trim().min(1).max(80).nullable().optional(),
  })
  .strict();

function parseUploadPayload(clientPayload: string | null) {
  if (!clientPayload) return null;
  try {
    return uploadPayloadSchema.parse(JSON.parse(clientPayload));
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) {
    return NextResponse.json(
      { message: "That image upload was not valid." },
      { status: 400 },
    );
  }

  const session = await auth.api.getSession({ headers: request.headers });

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      token: blobReadWriteToken(),
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!session) {
          throw new Error("Sign in to save that image.");
        }

        const payload = parseUploadPayload(clientPayload);
        if (!payload) {
          throw new Error("That image upload was not valid.");
        }

        const kind: LabUploadKind = payload.kind;
        const gameId = payload.gameId ?? null;

        if (kind === "thumbnail") {
          if (!gameId) {
            throw new Error("That game image was not valid.");
          }
          const game = await getGame(session.user.id, gameId);
          if (!game) {
            throw new Error("Game not found.");
          }
        }

        if (!isOwnedUploadPathname(session.user.id, pathname, kind, gameId)) {
          throw new Error("That image upload was not valid.");
        }

        return {
          allowedContentTypes:
            kind === "thumbnail" ? ["image/webp"] : ["image/png"],
          addRandomSuffix: true,
          maximumSizeInBytes:
            kind === "thumbnail" ? THUMBNAIL_MAX_BYTES : SCREENSHOT_MAX_BYTES,
          validUntil: Date.now() + 60_000,
          tokenPayload: JSON.stringify({
            userId: session.user.id,
            kind,
            gameId,
          }),
        };
      },
      onUploadCompleted: async () => {
        // Metadata is stored by the confirm APIs so local development works
        // without the Blob completion webhook.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error("Failed to authorize blob upload", error);
    return NextResponse.json(
      { message: "We couldn't save that image." },
      { status: 400 },
    );
  }
}
