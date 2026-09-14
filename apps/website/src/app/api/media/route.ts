import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  createScreenshot,
  listMedia,
  mediaUploadInputSchema,
} from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const body: unknown = await request.json().catch(() => null);
  const parsed = mediaUploadInputSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: "That screenshot was not valid." },
      { status: 400 },
    );
  }

  try {
    const result = await createScreenshot(session.user.id, parsed.data);

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

    return NextResponse.json({ media: result.media }, { status: 201 });
  } catch (error) {
    console.error("Failed to save screenshot", error);
    return NextResponse.json(
      { message: "We couldn't save that screenshot." },
      { status: 500 },
    );
  }
}
