import { NextResponse } from "next/server";

import { createGameInputSchema, defaultGameTitle } from "@/lib/game-contract";
import { createGame, listGames } from "@/lib/games";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json({ message: "Sign in to see your games." }, { status: 401 });
  }

  try {
    const games = await listGames(session.user.id);
    return NextResponse.json(
      { games },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to list games", error);
    return NextResponse.json(
      { message: "We couldn't load your games." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json({ message: "Sign in to save a game." }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = createGameInputSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "That game could not be saved." }, { status: 400 });
  }

  try {
    const game = await createGame(session.user.id, {
      title: parsed.data.title ?? defaultGameTitle(parsed.data.spec),
      spec: parsed.data.spec,
    });
    return NextResponse.json({ game }, { status: 201 });
  } catch (error) {
    console.error("Failed to create game", error);
    return NextResponse.json(
      { message: "We couldn't save your game." },
      { status: 500 },
    );
  }
}
