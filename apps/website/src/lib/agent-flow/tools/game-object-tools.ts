import {
  COOPER_OBJECT_KINDS,
  describeLevel,
  GameObjectEditError,
  MAX_PLACEMENTS_PER_CALL,
  planObjectAdditions,
  planObjectRemovals,
  type ObjectArrayChange,
  type ObjectCellRequest,
  type ObjectPlacementRequest,
} from "../../game-objects";
import {
  loadLevel,
  loadError,
  persist,
  readArray,
  readString,
  toolError,
} from "./game-tool-support";
import type { AgentTool, ToolExecutionContext, ToolExecutionResult } from "./types";

const NO_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {},
} as const;

const CELL_PROPERTIES = {
  x: { type: "integer", description: "Column, counting from 0 at the far left." },
  y: { type: "integer", description: "Row, counting from 0 at the top." },
} as const;

/**
 * Strict Structured Outputs rejects `minItems`, `maximum`, and friends, so the
 * counts and bounds live in descriptions here and are enforced by
 * `planObjectAdditions` / `planObjectRemovals` on the server.
 */
const ADD_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["placements"],
  properties: {
    placements: {
      type: "array",
      description:
        `One to ${MAX_PLACEMENTS_PER_CALL} objects to add. Every cell must be empty in both grids from read_game_objects, and enemies, bosses, springs, and checkpoints need solid ground directly below.`,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "x", "y"],
        properties: {
          kind: { type: "string", enum: [...COOPER_OBJECT_KINDS] },
          ...CELL_PROPERTIES,
        },
      },
    },
  },
} as const;

const REMOVE_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "cells"],
  properties: {
    kind: { type: "string", enum: [...COOPER_OBJECT_KINDS] },
    cells: {
      type: "array",
      description:
        `The cells to clear, each holding an object of that kind. Send an empty list to remove every one of that kind in the level. At most ${MAX_PLACEMENTS_PER_CALL} cells.`,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["x", "y"],
        properties: CELL_PROPERTIES,
      },
    },
  },
} as const;

export const readGameObjectsTool: AgentTool = Object.freeze({
  id: "read_game_objects",
  definition: {
    name: "read_game_objects",
    description:
      "Read the level the kid is looking at: its size, the terrain grid, a matching grid of what is already placed in every cell, and the kinds you may add or remove. Call this before add_game_objects or remove_game_objects so you pick real empty cells.",
    parameters: NO_PARAMETERS,
  },
  async execute(_args: unknown, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const loaded = await loadLevel(context);
    if (loaded.status !== "loaded") return loadError(loaded.status);
    return { output: { ok: true, ...describeLevel(loaded.level) } };
  },
});

export const addGameObjectsTool: AgentTool = Object.freeze({
  id: "add_game_objects",
  definition: {
    name: "add_game_objects",
    description:
      "Put new things into the level at grid cells you chose from read_game_objects. Every cell must be empty terrain with nothing already in it. Takes effect right away.",
    parameters: ADD_PARAMETERS,
  },
  async execute(args: unknown, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const loaded = await loadLevel(context);
    if (loaded.status !== "loaded") return loadError(loaded.status);

    let change: ObjectArrayChange & { added: readonly { kind: string; x: number; y: number }[] };
    try {
      change = planObjectAdditions(
        loaded.spec,
        loaded.level,
        readArray<ObjectPlacementRequest>(args, "placements"),
      );
    } catch (error) {
      if (error instanceof GameObjectEditError) return toolError(error.reason);
      throw error;
    }

    return persist(context, loaded.spec, change, {
      added: change.added.map(({ kind, x, y }) => ({ kind, x, y })),
    });
  },
});

export const removeGameObjectsTool: AgentTool = Object.freeze({
  id: "remove_game_objects",
  definition: {
    name: "remove_game_objects",
    description:
      "Take things out of the level. Name the cells to clear, or send an empty cell list to remove every one of that kind. Takes effect right away.",
    parameters: REMOVE_PARAMETERS,
  },
  async execute(args: unknown, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const loaded = await loadLevel(context);
    if (loaded.status !== "loaded") return loadError(loaded.status);

    const kind = readString(args, "kind");

    let change: ObjectArrayChange & { removedCount: number };
    try {
      change = planObjectRemovals(
        loaded.spec,
        loaded.level,
        kind,
        readArray<ObjectCellRequest>(args, "cells"),
      );
    } catch (error) {
      if (error instanceof GameObjectEditError) return toolError(error.reason);
      throw error;
    }

    return persist(context, loaded.spec, change, {
      removed: { kind, count: change.removedCount },
    });
  },
});
