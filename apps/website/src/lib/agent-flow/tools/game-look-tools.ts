import {
  GameObjectEditError,
  MAX_PLACEMENTS_PER_CALL,
  MAXIMUM_STARTING_LIVES,
  MINIMUM_STARTING_LIVES,
  planAppearanceChange,
  planStartingLives,
} from "../../game-objects";
import type { CooperSpecChange } from "../../cooper-spec-change";
import { HUMAN_GENDERS, PLAYER_CHARACTERS } from "../../game-contract";
import {
  loadLevel,
  loadError,
  persist,
  readArray,
  readString,
  toolError,
} from "./game-tool-support";
import type { AgentTool, ToolExecutionContext, ToolExecutionResult } from "./types";

/**
 * Strict Structured Outputs rejects `minimum` and `maximum`, so the bounds live
 * in the description here and `planStartingLives` enforces them on the server.
 */
const LIVES_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["lives"],
  properties: {
    lives: {
      type: "integer",
      description: `How many lives the player starts each level with, from ${MINIMUM_STARTING_LIVES} to ${MAXIMUM_STARTING_LIVES}.`,
    },
  },
} as const;

const CHARACTER_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["character", "gender"],
  properties: {
    character: {
      type: "string",
      enum: [...PLAYER_CHARACTERS],
      description: "Who the kid plays as.",
    },
    gender: {
      type: "string",
      enum: [...HUMAN_GENDERS],
      description: "Only used when character is human. Send \"boy\" otherwise.",
    },
  },
} as const;

const APPEARANCE_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["look", "fromLook", "cells"],
  properties: {
    look: {
      type: "string",
      description:
        "The new look, copied exactly from enemyLooks or bossLooks in read_game_objects. A boss look only fits a boss.",
    },
    fromLook: {
      type: "string",
      description:
        "Only used when cells is empty: change every enemy or boss currently wearing this look. Send an empty string to change all of them.",
    },
    cells: {
      type: "array",
      description: `The cells holding the enemies or bosses to repaint, from the characters list in read_game_objects. Send an empty list to use fromLook instead. At most ${MAX_PLACEMENTS_PER_CALL} cells.`,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["x", "y"],
        properties: {
          x: { type: "integer", description: "Column, counting from 0 at the far left." },
          y: { type: "integer", description: "Row, counting from 0 at the top." },
        },
      },
    },
  },
} as const;

export const setStartingLivesTool: AgentTool = Object.freeze({
  id: "set_starting_lives",
  definition: {
    name: "set_starting_lives",
    description:
      "Set how many lives the player starts with. This becomes the level's starting count, so it applies on a fresh start and after a game over, not just right now. Takes effect right away.",
    parameters: LIVES_PARAMETERS,
  },
  async execute(args: unknown, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const loaded = await loadLevel(context);
    if (loaded.status !== "loaded") return loadError(loaded.status);

    let change: Required<Pick<CooperSpecChange, "startingLives">>;
    try {
      change = planStartingLives(
        args && typeof args === "object" && !Array.isArray(args)
          ? (args as Record<string, unknown>).lives
          : undefined,
      );
    } catch (error) {
      if (error instanceof GameObjectEditError) return toolError(error.reason);
      throw error;
    }

    return persist(context, loaded.spec, change, { startingLives: change.startingLives });
  },
});

export const setPlayerCharacterTool: AgentTool = Object.freeze({
  id: "set_player_character",
  definition: {
    name: "set_player_character",
    description:
      "Change who the kid plays as. The sprite is picked automatically to match the level's art set. Takes effect right away.",
    parameters: CHARACTER_PARAMETERS,
  },
  async execute(args: unknown, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const loaded = await loadLevel(context);
    if (loaded.status !== "loaded") return loadError(loaded.status);

    const character = readString(args, "character");
    const gender = readString(args, "gender");
    if (!(PLAYER_CHARACTERS as readonly string[]).includes(character)) {
      return toolError(`Cooper cannot make the player a "${character}".`);
    }
    if (!(HUMAN_GENDERS as readonly string[]).includes(gender)) {
      return toolError("Cooper needs to know whether that human is a boy or a girl.");
    }

    const change: CooperSpecChange = {
      playerCharacter: character as (typeof PLAYER_CHARACTERS)[number],
      humanGender: gender as (typeof HUMAN_GENDERS)[number],
    };
    return persist(context, loaded.spec, change, { playerCharacter: character });
  },
});

export const setEnemyAppearanceTool: AgentTool = Object.freeze({
  id: "set_enemy_appearance",
  definition: {
    name: "set_enemy_appearance",
    description:
      "Change what the enemies or bosses look like. Read the characters list from read_game_objects first so you use a look this level's art set has. Takes effect right away.",
    parameters: APPEARANCE_PARAMETERS,
  },
  async execute(args: unknown, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const loaded = await loadLevel(context);
    if (loaded.status !== "loaded") return loadError(loaded.status);

    let change: Required<Pick<CooperSpecChange, "platformerObjectSettings">>
      & { changed: readonly { x: number; y: number; look: string }[] };
    try {
      change = planAppearanceChange(
        loaded.spec,
        loaded.level,
        readString(args, "look"),
        readString(args, "fromLook"),
        readArray(args, "cells"),
      );
    } catch (error) {
      if (error instanceof GameObjectEditError) return toolError(error.reason);
      throw error;
    }

    return persist(context, loaded.spec, change, { changed: change.changed });
  },
});
