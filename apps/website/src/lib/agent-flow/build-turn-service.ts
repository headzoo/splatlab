import { randomUUID } from "node:crypto";

import { getGame } from "../games";
import { FlowContractError } from "./contract";
import { BuildExecutionError, executeBuildMessage, resumeBuildTurn, type BuildMessageResult } from "./executor";
import type { BuildTurnInput, BuildTurnResponseBody } from "./http-contract";
import {
  COOPER_INBOUND_REDIRECT,
  COOPER_MODERATION_UNAVAILABLE_REDIRECT,
  UNAVAILABLE_MODERATOR,
  safeScreen,
  type ContentModerator,
} from "./moderation";
import {
  ModelConfigurationError,
  type ModelScenarioRequest,
  type ModelTurnRequest,
  ModelOutputError,
  ModelProviderError,
  type ModelClient,
} from "./model-client";
import { AgentflowRateLimiter } from "./rate-limit";
import type { RegisteredFlow } from "./registry";
import { AgentFlowRunStore } from "./run-store";

export type BuildTurnServiceResult =
  | Readonly<{ kind: "success"; body: BuildTurnResponseBody; gameRevision: number }>
  | Readonly<{ kind: "error"; status: number; message: string; retryAfterSeconds?: number }>;

export type ProcessBuildTurnInput = Readonly<{
  ownerId: string;
  gameId: string;
  input: BuildTurnInput;
}>;

export type BuildTurnServiceDependencies = Readonly<{
  modelClient: ModelClient | (() => ModelClient);
  runStore?: AgentFlowRunStore;
  rateLimiter?: AgentflowRateLimiter;
  moderator?: ContentModerator;
  /** Forwarded to the executor; see `BuildExecutorDependencies.flow`. */
  flow?: RegisteredFlow;
}>;

export async function processBuildTurn(
  input: ProcessBuildTurnInput,
  dependencies: BuildTurnServiceDependencies,
): Promise<BuildTurnServiceResult> {
  const moderator = dependencies.moderator ?? UNAVAILABLE_MODERATOR;

  if ("action" in input.input) {
    if (input.input.action === "proceed") {
      const limited = await consumeRateLimit(input.ownerId, dependencies.rateLimiter);
      if (limited) return limited;
    }

    // Feedback is kid-authored and lands in the transcript, so it is screened
    // on the same terms as a message. A blocked decline leaves the run paused
    // so the kid can reword or retry the same action.
    const moderationReply = input.input.feedback
      ? await blockedInputReply(input.input.feedback, moderator)
      : null;
    if (moderationReply) {
      return declineInput(input.ownerId, input.gameId, moderationReply);
    }

    try {
      const result = await resumeBuildTurn(
        {
          ownerId: input.ownerId,
          gameId: input.gameId,
          action: input.input.action,
          feedback: input.input.feedback,
        },
        { modelClient: lazyModelClient(dependencies.modelClient), runStore: dependencies.runStore, moderator, flow: dependencies.flow },
      );
      return {
        kind: "success",
        body: responseBody(result),
        gameRevision: result.gameRevision,
      };
    } catch (error) {
      return mapBuildTurnFailure(error);
    }
  }

  const limited = await consumeRateLimit(input.ownerId, dependencies.rateLimiter);
  if (limited) return limited;

  // Screened before the run starts, so a blocked message never reaches the
  // model, never enters the transcript, and costs nothing beyond this check.
  const moderationReply = await blockedInputReply(input.input.message, moderator);
  if (moderationReply) {
    return declineInput(input.ownerId, input.gameId, moderationReply);
  }

  try {
    const result = await executeBuildMessage(
      {
        ownerId: input.ownerId,
        gameId: input.gameId,
        message: input.input.message,
      },
      {
        modelClient: lazyModelClient(dependencies.modelClient),
        runStore: dependencies.runStore,
        moderator,
        flow: dependencies.flow,
      },
    );

    return {
      kind: "success",
      body: responseBody(result),
      gameRevision: result.gameRevision,
    };
  } catch (error) {
    return mapBuildTurnFailure(error);
  }
}

function responseBody(result: BuildMessageResult): BuildTurnResponseBody {
  return {
    status: result.status,
    cooperMessage: result.cooperMessage,
    runId: result.runId,
    ...(result.physicsDocument ? { physicsDocument: result.physicsDocument } : {}),
    ...(result.specChange ? { specChange: result.specChange } : {}),
    ...(result.gameTitle ? { title: result.gameTitle } : {}),
  };
}

async function blockedInputReply(
  text: string,
  moderator: ContentModerator,
): Promise<string | null> {
  const verdict = await safeScreen(text, moderator);
  if (verdict.unavailable) {
    console.warn("Build message was withheld because moderation was unavailable");
    return COOPER_MODERATION_UNAVAILABLE_REDIRECT;
  }
  if (verdict.flagged) {
    console.warn("Build message was declined by moderation", { categories: verdict.categories });
    return COOPER_INBOUND_REDIRECT;
  }
  return null;
}

/**
 * Answers a blocked message in Cooper's voice instead of as an error and
 * leaves the game untouched. Provider outages get a truthful retry response.
 */
async function declineInput(
  ownerId: string,
  gameId: string,
  cooperMessage: string,
): Promise<BuildTurnServiceResult> {
  const game = await getGame(ownerId, gameId);
  if (!game) return serviceError(404, "Game not found.");
  return {
    kind: "success",
    body: { status: "replied", cooperMessage, runId: randomUUID() },
    gameRevision: game.revision,
  };
}

async function consumeRateLimit(
  ownerId: string,
  configuredLimiter: AgentflowRateLimiter | undefined,
): Promise<Extract<BuildTurnServiceResult, { kind: "error" }> | undefined> {
  const limit = await (configuredLimiter ?? new AgentflowRateLimiter()).consume(ownerId);
  if (limit.allowed) return undefined;
  const message = limit.scope === "daily"
    ? "Cooper has done a lot of building today. Come back tomorrow for more."
    : "Cooper needs a short break. Try again in a moment.";
  return serviceError(429, message, limit.retryAfterSeconds);
}

function lazyModelClient(clientOrFactory: ModelClient | (() => ModelClient)): ModelClient {
  if (typeof clientOrFactory !== "function") return clientOrFactory;

  let client: ModelClient | undefined;
  const getClient = () => (client ??= clientOrFactory());
  return {
    completeTurn: (request: ModelTurnRequest) => getClient().completeTurn(request),
    selectScenario: (request: ModelScenarioRequest) => getClient().selectScenario(request),
  };
}

export function mapBuildTurnFailure(error: unknown): Extract<BuildTurnServiceResult, { kind: "error" }> {
  // Every branch below replaces the cause with a sentence written for a kid, so
  // without this line a failed turn leaves nothing at all in the server log to
  // debug from.
  console.error("Build turn failed", error);

  if (error instanceof BuildExecutionError) {
    switch (error.code) {
      case "game_not_found":
        return serviceError(404, "Game not found.");
      case "active_run":
        return serviceError(409, "Cooper is still working on your last message. Wait for it to finish.");
      case "stale_running":
        return serviceError(409, "Your last build turn expired. Send your message again.");
      case "resume_not_supported":
        return serviceError(400, "That build action is not supported yet.");
      case "no_paused_run":
      case "invalid_pause":
        return serviceError(409, "There is no valid paused build turn to resume.");
      case "flow_hash_mismatch":
        return serviceError(409, "This game's build helper was updated. Refresh and start a new message.");
      default:
        return serviceError(500, "Cooper couldn't finish that turn.");
    }
  }

  if (error instanceof ModelConfigurationError) {
    return serviceError(500, "Cooper isn't available right now.");
  }

  if (error instanceof ModelProviderError) {
    return serviceError(500, "Cooper couldn't respond right now. Try again in a moment.");
  }

  if (error instanceof ModelOutputError) {
    return serviceError(500, "Cooper sent back something confusing. Try again.");
  }

  if (error instanceof FlowContractError) {
    return serviceError(500, "Cooper couldn't finish that turn.");
  }

  return serviceError(500, "Cooper couldn't finish that turn.");
}

function serviceError(
  status: number,
  message: string,
  retryAfterSeconds?: number,
): Extract<BuildTurnServiceResult, { kind: "error" }> {
  return retryAfterSeconds === undefined
    ? { kind: "error", status, message }
    : { kind: "error", status, message, retryAfterSeconds };
}
