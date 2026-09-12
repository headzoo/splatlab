import { NextResponse } from "next/server";

import { updateGameInputSchema } from "@/lib/game-contract";
import { deleteGame, getGame, updateGame } from "@/lib/games";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ gameId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json({ message: "Sign in to open that game." }, { status: 401 });
  }

  try {
    const { gameId } = await context.params;
    const game = await getGame(session.user.id, gameId);

    if (!game) {
      return NextResponse.json({ message: "Game not found." }, { status: 404 });
    }

    return NextResponse.json(
      { game },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to get game", error);
    return NextResponse.json(
      { message: "We couldn't open that game." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json({ message: "Sign in to save that game." }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = updateGameInputSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "That game update was not valid." }, { status: 400 });
  }

  try {
    const { gameId } = await context.params;
    const result = await updateGame(session.user.id, gameId, parsed.data);

    if (result.status === "not_found") {
      return NextResponse.json({ message: "Game not found." }, { status: 404 });
    }

    if (result.status === "conflict") {
      return NextResponse.json(
        {
          message: "This game changed in another tab. Refresh before editing it again.",
          game: result.game,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ game: result.game });
  } catch (error) {
    console.error("Failed to update game", error);
    return NextResponse.json(
      { message: "We couldn't save your latest change." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json({ message: "Sign in to delete that game." }, { status: 401 });
  }

  try {
    const { gameId } = await context.params;
    const deleted = await deleteGame(session.user.id, gameId);

    if (!deleted) {
      return NextResponse.json({ message: "Game not found." }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete game", error);
    return NextResponse.json(
      { message: "We couldn't delete that game." },
      { status: 500 },
    );
  }
}
