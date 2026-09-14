import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { deleteMedia, getPublicMedia } from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ mediaId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { mediaId } = await context.params;
    const media = await getPublicMedia(mediaId);

    if (!media) {
      return NextResponse.json({ message: "Image not found." }, { status: 404 });
    }

    return NextResponse.json(
      { media },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to load media", error);
    return NextResponse.json(
      { message: "We couldn't open that image." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json(
      { message: "Sign in to delete that image." },
      { status: 401 },
    );
  }

  try {
    const { mediaId } = await context.params;
    const deleted = await deleteMedia(session.user.id, mediaId);

    if (!deleted) {
      return NextResponse.json({ message: "Image not found." }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete media", error);
    return NextResponse.json(
      { message: "We couldn't delete that image." },
      { status: 500 },
    );
  }
}
