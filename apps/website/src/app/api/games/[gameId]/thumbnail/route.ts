import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  blobUrlMatchesPathname,
  isOwnedThumbnailPathname,
} from "@/lib/blob-path";
import { gameThumbnailInputSchema } from "@/lib/game-contract";
import { saveGameThumbnail } from "@/lib/games";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ gameId: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json(
      { message: "Sign in to save that game image." },
      { status: 401 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = gameThumbnailInputSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: "That game image was not valid." },
      { status: 400 },
    );
  }

  const { gameId } = await context.params;

  if (
    !blobUrlMatchesPathname(parsed.data.url, parsed.data.pathname) ||
    !isOwnedThumbnailPathname(session.user.id, gameId, parsed.data.pathname)
  ) {
    return NextResponse.json(
      { message: "That game image was not valid." },
      { status: 400 },
    );
  }

  try {
    const saved = await saveGameThumbnail(
      session.user.id,
      gameId,
      parsed.data.url,
    );

    if (!saved) {
      return NextResponse.json({ message: "Game not found." }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Failed to save game thumbnail", error);
    return NextResponse.json(
      { message: "We couldn't save that game image." },
      { status: 500 },
    );
  }
}
