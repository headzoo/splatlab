import {
  applyCooperPhysicsPatch,
  editableFieldsFor,
  effectiveGamePhysics,
  platformerJumpEnvelope,
  GamePhysicsPatchError,
  PLATFORMER_TILE_SIZE_PX,
  type GamePhysicsDocument,
} from "../../game-physics";
import { getGame } from "../../games";
import type { AgentTool, ToolExecutionContext, ToolExecutionResult } from "./types";

const NO_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {},
} as const;

/**
 * Strict Structured Outputs rejects `minItems`, `maximum`, and friends, so the
 * numeric and length limits live in descriptions here and are enforced by
 * `applyCooperPhysicsPatch` on the server.
 */
const PATCH_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["baseRevision", "operations"],
  properties: {
    baseRevision: {
      type: "integer",
      description: "The revision returned by read_game_physics. A stale value is rejected.",
    },
    operations: {
      type: "array",
      description: "One to sixteen changes. Each path may appear only once.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["op", "path", "value"],
        properties: {
          op: { type: "string", enum: ["replace"] },
          path: {
            type: "string",
            description: "One of the editable paths listed by read_game_physics.",
          },
          value: {
            anyOf: [{ type: "number" }, { type: "string" }],
            description: "A number inside the field's bounds, or the enum value for a text field.",
          },
        },
      },
    },
  },
} as const;

type NotFound = { status: "not_found" };
type Loaded = { status: "loaded"; document: GamePhysicsDocument };

async function loadDocument(context: ToolExecutionContext): Promise<NotFound | Loaded> {
  const game = await getGame(context.ownerId, context.gameId);
  if (!game) return { status: "not_found" };
  return { status: "loaded", document: effectiveGamePhysics(game.spec) };
}

function toolError(reason: string): ToolExecutionResult {
  return { output: { ok: false, reason } };
}

function describeDocument(document: GamePhysicsDocument) {
  return {
    ok: true,
    revision: document.revision,
    runtime: document.runtime,
    appliesOn: document.editPolicy.applyTiming,
    current: {
      movement: document.movement,
      ...(document.runtime === "platformer_v1"
        ? { verticalMovement: document.verticalMovement }
        : {}),
    },
    editableFields: editableFieldsFor(document.runtime),
    ...(document.runtime === "platformer_v1"
      ? { jumpEnvelope: { tileSizePx: PLATFORMER_TILE_SIZE_PX, ...platformerJumpEnvelope(document) } }
      : {}),
  };
}

export const readGamePhysicsTool: AgentTool = Object.freeze({
  id: "read_game_physics",
  definition: {
    name: "read_game_physics",
    description:
      "Read this game's current movement and jump settings, the fields you may change with their bounds, and the jump reach the levels require. Call this before patch_game_physics.",
    parameters: NO_PARAMETERS,
  },
  async execute(_args: unknown, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const loaded = await loadDocument(context);
    if (loaded.status === "not_found") return toolError("This game could not be found.");
    return { output: describeDocument(loaded.document) };
  },
});

export const patchGamePhysicsTool: AgentTool = Object.freeze({
  id: "patch_game_physics",
  definition: {
    name: "patch_game_physics",
    description:
      "Change this game's movement or jump settings. Only replace operations on the editable paths from read_game_physics are allowed, and the new jump must still clear the levels. Takes effect the next time the game restarts.",
    parameters: PATCH_PARAMETERS,
  },
  async execute(args: unknown, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const loaded = await loadDocument(context);
    if (loaded.status === "not_found") return toolError("This game could not be found.");

    const patch = args && typeof args === "object" && !Array.isArray(args)
      ? { ...(args as Record<string, unknown>), prompt: context.prompt }
      : args;

    let updated: GamePhysicsDocument;
    try {
      updated = applyCooperPhysicsPatch(loaded.document, patch);
    } catch (error) {
      if (error instanceof GamePhysicsPatchError) return toolError(error.reason);
      throw error;
    }

    const applied = await context.store.applyPhysicsDocument({
      ownerId: context.ownerId,
      gameId: context.gameId,
      document: updated,
    });
    if (applied.status !== "updated") return toolError("This game could not be found.");

    return {
      output: { ...describeDocument(updated), changed: true },
      gameRevision: applied.gameRevision,
      physicsDocument: applied.document,
    };
  },
});
