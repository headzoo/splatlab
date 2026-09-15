import { activeMapSource } from "@/lib/game-contract";
import { MAP_LENGTHS } from "@/lib/generated-map-contract";
import { hasSourceEdits, resolveMapRollLength } from "@/lib/random-map/map-roll-shared";
import { rollGameMap } from "@/lib/random-map/map-roll";

import { loadGame, readValue, toolError } from "./game-tool-support";
import type { AgentTool, ToolExecutionContext, ToolExecutionResult } from "./types";

const REROLL_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["confirmDiscardEdits"],
  properties: {
    confirmDiscardEdits: {
      type: "boolean",
      description:
        "Set true only after the kid explicitly agrees to lose their current map edits. Leave false until they say yes.",
    },
    length: {
      type: "string",
      enum: [...MAP_LENGTHS],
      description: "Optional new map length. Omit to keep the current length.",
    },
  },
} as const;

function readConfirmDiscardEdits(args: unknown): boolean | undefined {
  const value = readValue(args, "confirmDiscardEdits");
  return typeof value === "boolean" ? value : undefined;
}

function readLength(args: unknown) {
  const value = readValue(args, "length");
  return typeof value === "string" && MAP_LENGTHS.includes(value as typeof MAP_LENGTHS[number])
    ? value as typeof MAP_LENGTHS[number]
    : undefined;
}

function successSummary(
  previewKind: "platformer" | "maze",
  length: typeof MAP_LENGTHS[number],
  levelSource: string,
) {
  return {
    ok: true,
    changed: true,
    previewKind,
    length,
    levelSource,
  };
}

export const rerollMapTool: AgentTool = Object.freeze({
  id: "reroll_map",
  definition: {
    name: "reroll_map",
    description:
      "Make a different random map for the level being shown. Call this when the kid asks for a different, new, or random map. If the tool reports edits that would be lost, ask the kid plainly and call again with confirmDiscardEdits set to true only after they agree. Do not claim the map changed when the tool refuses.",
    parameters: REROLL_PARAMETERS,
  },
  async execute(args: unknown, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const loaded = await loadGame(context);
    if (loaded.status !== "loaded") return toolError("This game could not be found.");

    const confirmDiscardEdits = readConfirmDiscardEdits(args);
    if (confirmDiscardEdits === undefined) {
      return toolError("confirmDiscardEdits must be true or false.");
    }

    const length = resolveMapRollLength(loaded.spec, readLength(args));
    const outcome = await rollGameMap(context.ownerId, context.gameId, {
      length,
      reason: "reroll",
      confirmDiscardEdits,
    });

    if (outcome.status === "not_found") return toolError("This game could not be found.");
    if (outcome.status === "conflict") {
      return toolError("This game changed elsewhere. Ask the kid to refresh and try again.");
    }
    if (outcome.status === "confirmation_required") {
      return {
        output: {
          ok: false,
          needsConfirmation: true,
          reason: hasSourceEdits(loaded.spec)
            ? "This level has map edits that would be lost. Ask the kid if it is okay to replace the map anyway, then call reroll_map again with confirmDiscardEdits set to true only if they agree."
            : "This map needs confirmation before it can be replaced.",
        },
      };
    }

    const levelSource = activeMapSource({
      ...loaded.spec,
      previewKind: outcome.result.change.previewKind,
      ...(outcome.result.change.platformerMapSource
        ? { platformerMapSource: outcome.result.change.platformerMapSource }
        : {}),
      ...(outcome.result.change.mazeMapSource
        ? { mazeMapSource: outcome.result.change.mazeMapSource }
        : {}),
    });

    return {
      output: successSummary(outcome.result.change.previewKind, length, levelSource),
      gameRevision: outcome.result.revision,
      mapRoll: outcome.result,
    };
  },
});
