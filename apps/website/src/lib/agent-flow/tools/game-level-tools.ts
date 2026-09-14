import { GameObjectEditError } from "../../game-objects";
import {
  LEVEL_MOVE_DIRECTIONS,
  MAX_LEVELS_PER_GAME,
  MAX_LEVEL_NAME_LENGTH,
  WORLD_NAMES,
  gameLevelSummaries,
  planAddLevel,
  planMoveLevel,
  planRemoveLevel,
  planRenameLevel,
  planSetActiveLevel,
} from "../../game-levels-editing";
import { applyCooperSpecChange, type CooperSpecChange } from "../../cooper-spec-change";
import type { GameDocument } from "../../game-contract";
import { loadGame, persist, readString, readValue, toolError } from "./game-tool-support";
import type { AgentTool, ToolExecutionContext, ToolExecutionResult } from "./types";

const LEVEL_NUMBER = {
  type: "integer",
  description: "Which level, counting from 1, exactly as read_game numbered them.",
} as const;

const LEVEL_NAME = {
  type: "string",
  description: `What to call the level, up to ${MAX_LEVEL_NAME_LENGTH} letters.`,
} as const;

const ADD_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["world", "name"],
  properties: {
    world: {
      type: "string",
      enum: [...WORLD_NAMES],
      description:
        "The world the new level is built from, copied exactly from worldsYouCanAdd in read_game. Not every world suits both kinds of game.",
    },
    name: LEVEL_NAME,
  },
} as const;

const RENAME_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["level", "name"],
  properties: { level: LEVEL_NUMBER, name: LEVEL_NAME },
} as const;

const LEVEL_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["level"],
  properties: { level: LEVEL_NUMBER },
} as const;

const MOVE_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["level", "direction"],
  properties: {
    level: LEVEL_NUMBER,
    direction: {
      type: "string",
      enum: [...LEVEL_MOVE_DIRECTIONS],
      description: "\"earlier\" moves it one place towards the start, \"later\" one place towards the end.",
    },
  },
} as const;

/** The renumbered list after a write, so Cooper can describe the new order. */
function levelsAfter(spec: GameDocument, change: CooperSpecChange) {
  return gameLevelSummaries(applyCooperSpecChange(spec, change));
}

/**
 * Every level tool runs the same way: load the game, plan the change, turn a
 * refusal into a reason Cooper can read out, then save and report the new list.
 */
async function applyLevelChange(
  context: ToolExecutionContext,
  plan: (spec: GameDocument) => CooperSpecChange,
): Promise<ToolExecutionResult> {
  const loaded = await loadGame(context);
  if (loaded.status !== "loaded") return toolError("This game could not be found.");

  let change: CooperSpecChange;
  try {
    change = plan(loaded.spec);
  } catch (error) {
    if (error instanceof GameObjectEditError) return toolError(error.reason);
    throw error;
  }

  return persist(context, loaded.spec, change, {
    levels: levelsAfter(loaded.spec, change),
  });
}

export const addLevelTool: AgentTool = Object.freeze({
  id: "add_level",
  definition: {
    name: "add_level",
    description:
      `Add a new level to the end of the game, built from one of the worlds, and start showing it. A game can hold up to ${MAX_LEVELS_PER_GAME} levels. Takes effect right away.`,
    parameters: ADD_PARAMETERS,
  },
  execute(args: unknown, context: ToolExecutionContext) {
    return applyLevelChange(context, (spec) =>
      planAddLevel(spec, readString(args, "world"), readString(args, "name")));
  },
});

export const renameLevelTool: AgentTool = Object.freeze({
  id: "rename_level",
  definition: {
    name: "rename_level",
    description:
      "Change what one level is called. Read the level numbers from read_game first. This renames a single level, not the whole game. Takes effect right away.",
    parameters: RENAME_PARAMETERS,
  },
  execute(args: unknown, context: ToolExecutionContext) {
    return applyLevelChange(context, (spec) =>
      planRenameLevel(spec, readValue(args, "level"), readString(args, "name")));
  },
});

export const removeLevelTool: AgentTool = Object.freeze({
  id: "remove_level",
  definition: {
    name: "remove_level",
    description:
      "Take one level out of the game for good, along with everything the kid put in it. A game always keeps at least one level. Takes effect right away.",
    parameters: LEVEL_PARAMETERS,
  },
  execute(args: unknown, context: ToolExecutionContext) {
    return applyLevelChange(context, (spec) => planRemoveLevel(spec, readValue(args, "level")));
  },
});

export const moveLevelTool: AgentTool = Object.freeze({
  id: "move_level",
  definition: {
    name: "move_level",
    description:
      "Move one level one place earlier or later, which changes the order the kid plays them in. Takes effect right away.",
    parameters: MOVE_PARAMETERS,
  },
  execute(args: unknown, context: ToolExecutionContext) {
    return applyLevelChange(context, (spec) =>
      planMoveLevel(spec, readValue(args, "level"), readValue(args, "direction")));
  },
});

export const setActiveLevelTool: AgentTool = Object.freeze({
  id: "set_active_level",
  definition: {
    name: "set_active_level",
    description:
      "Show a different level in the builder. The level-changing tools always work on the level being shown, so switch to a level before filling it with things. Takes effect right away.",
    parameters: LEVEL_PARAMETERS,
  },
  execute(args: unknown, context: ToolExecutionContext) {
    return applyLevelChange(context, (spec) => planSetActiveLevel(spec, readValue(args, "level")));
  },
});
