import { FlowContractError } from "./contract";
import { BuildExecutionError, executeBuildMessage, resumeBuildTurn, type BuildMessageResult } from "./executor";
import type { BuildTurnInput, BuildTurnResponseBody } from "./http-contract";
import {
  ModelConfigurationError,
  type ModelScenarioRequest,
  type ModelTurnRequest,
  ModelOutputError,
  ModelProviderError,
  type ModelClient,
} from "./model-client";
import { AgentflowRateLimiter } from "./rate-limit";
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
}>;

export async function processBuildTurn(
  input: ProcessBuildTurnInput,
  dependencies: BuildTurnServiceDependencies,
): Promise<BuildTurnServiceResult> {
  if ("action" in input.input) {
    if (input.input.action === "proceed") {
      const limited = await consumeRateLimit(input.ownerId, dependencies.rateLimiter);
      if (limited) return limited;
    }

    try {
      const result = await resumeBuildTurn(
        {
          ownerId: input.ownerId,
          gameId: input.gameId,
          action: input.input.action,
          feedback: input.input.feedback,
        },
        { modelClient: lazyModelClient(dependencies.modelClient), runStore: dependencies.runStore },
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
  };
}

async function consumeRateLimit(
  ownerId: string,
  configuredLimiter: AgentflowRateLimiter | undefined,
): Promise<Extract<BuildTurnServiceResult, { kind: "error" }> | undefined> {
  const limit = await (configuredLimiter ?? new AgentflowRateLimiter()).consume(ownerId);
  return limit.allowed
    ? undefined
    : serviceError(429, "Cooper needs a short break. Try again in a moment.", limit.retryAfterSeconds);
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
