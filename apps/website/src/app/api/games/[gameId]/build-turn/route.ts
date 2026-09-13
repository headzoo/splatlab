import { NextResponse } from "next/server";

import { processBuildTurn } from "@/lib/agent-flow/build-turn-service";
import { buildTurnInputSchema } from "@/lib/agent-flow/http-contract";
import { OpenAIResponsesModelClient } from "@/lib/agent-flow/openai-model-client";
import { createContentModerator } from "@/lib/agent-flow/openai-moderation-client";
import type { ContentModerator } from "@/lib/agent-flow/moderation";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A physics turn can be three sequential Agent calls plus the Condition Agent.
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ gameId: string }>;
};

let modelClient: OpenAIResponsesModelClient | undefined;
let moderator: ContentModerator | undefined;

function getModelClient(): OpenAIResponsesModelClient {
  modelClient ??= new OpenAIResponsesModelClient();
  return modelClient;
}

function getModerator(): ContentModerator {
  moderator ??= createContentModerator();
  return moderator;
}

function noStoreHeaders(): Headers {
  return new Headers({ "Cache-Control": "no-store" });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json(
      { message: "Sign in to chat with Cooper." },
      { status: 401, headers: noStoreHeaders() },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = buildTurnInputSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: "That build message was not valid." },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  try {
    const { gameId } = await context.params;
    const result = await processBuildTurn(
      {
        ownerId: session.user.id,
        gameId,
        input: parsed.data,
      },
      { modelClient: getModelClient, moderator: getModerator() },
    );

    if (result.kind === "error") {
      const headers = noStoreHeaders();
      if (result.retryAfterSeconds !== undefined) {
        headers.set("Retry-After", String(result.retryAfterSeconds));
      }
      return NextResponse.json({ message: result.message }, { status: result.status, headers });
    }

    const headers = noStoreHeaders();
    headers.set("X-Game-Revision", String(result.gameRevision));
    return NextResponse.json(result.body, { headers });
  } catch (error) {
    console.error("Build turn failed", error);
    return NextResponse.json(
      { message: "Cooper couldn't finish that turn." },
      { status: 500, headers: noStoreHeaders() },
    );
  }
}
