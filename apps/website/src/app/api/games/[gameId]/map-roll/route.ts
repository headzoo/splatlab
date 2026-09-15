import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  mapRollInputSchema,
  rollGameMap,
} from "@/lib/random-map/map-roll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ gameId: string }>;
};

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ message: "Sign in to make a new map." }, { status: 401, ...noStore });
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = mapRollInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "That map choice was not valid." }, { status: 400, ...noStore });
  }

  try {
    const { gameId } = await context.params;
    const outcome = await rollGameMap(session.user.id, gameId, parsed.data);
    switch (outcome.status) {
      case "rolled":
        return NextResponse.json(outcome.result, noStore);
      case "confirmation_required":
        return NextResponse.json(
          { message: "This will replace your map edits. Please confirm first." },
          { status: 409, ...noStore },
        );
      case "conflict":
        return NextResponse.json(
          {
            message: "This game changed in another tab. Refresh before making a new map.",
            revision: outcome.gameRevision,
          },
          { status: 409, ...noStore },
        );
      case "not_found":
        return NextResponse.json({ message: "Game not found." }, { status: 404, ...noStore });
    }
  } catch (error) {
    console.error("Map roll failed", error);
    return NextResponse.json(
      { message: "We couldn't make a new map. Your game is still safe." },
      { status: 500, ...noStore },
    );
  }
}
