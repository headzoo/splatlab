import {
  DEFAULT_STARTING_LIVES,
  GameObjectEditError,
  MAXIMUM_STARTING_LIVES,
  MINIMUM_STARTING_LIVES,
} from "../../game-objects";
import {
  MAX_GAME_NAME_LENGTH,
  MAX_LEVELS_PER_GAME,
  MAX_LEVEL_NAME_LENGTH,
  gameLevelSummaries,
  planGameName,
  planGameType,
  planPlayerAppearance,
  worldNamesFor,
} from "../../game-levels-editing";
import {
  HAIR_COLORS,
  HUMAN_GENDERS,
  PLAYER_CHARACTERS,
  SKIN_TONES,
} from "../../game-contract";
import { safeScreen } from "../moderation";
import { loadGame, persist, readString, readValue, toolError } from "./game-tool-support";
import type { AgentTool, ToolExecutionContext, ToolExecutionResult } from "./types";

const NO_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {},
} as const;

const NAME_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["name"],
  properties: {
    name: {
      type: "string",
      description: `What the game is called, up to ${MAX_GAME_NAME_LENGTH} letters.`,
    },
  },
} as const;

const GAME_TYPE_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["gameType"],
  properties: {
    gameType: {
      type: "string",
      enum: ["platformer", "maze"],
      description:
        "\"platformer\" is the running and jumping game, \"maze\" is the top-down maze game.",
    },
  },
} as const;

const APPEARANCE_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["skinTone", "hairColor"],
  properties: {
    skinTone: {
      type: "string",
      enum: [...SKIN_TONES],
      description: "Copied from skinTones in read_game.",
    },
    hairColor: {
      type: "string",
      enum: [...HAIR_COLORS],
      description: "Copied from hairColors in read_game.",
    },
  },
} as const;

export const readGameTool: AgentTool = Object.freeze({
  id: "read_game",
  definition: {
    name: "read_game",
    description:
      "Read what this game is: its name, whether it is a jumping game or a maze, who the kid plays as, how many lives they start with, and every level in order with the world it was built from. Call this before renaming the game or changing any level, so you use real names and real level numbers.",
    parameters: NO_PARAMETERS,
  },
  async execute(_args: unknown, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const loaded = await loadGame(context);
    if (loaded.status !== "loaded") return toolError("This game could not be found.");

    const { spec } = loaded;
    return {
      output: {
        ok: true,
        name: loaded.title,
        gameType: spec.previewKind,
        player: {
          character: spec.playerCharacter,
          gender: spec.humanGender,
          skinTone: spec.skinTone,
          hairColor: spec.hairColor,
        },
        startingLives: spec.startingLives ?? DEFAULT_STARTING_LIVES,
        levels: gameLevelSummaries(spec),
        worldsYouCanAdd: worldNamesFor(spec.previewKind),
        characters: PLAYER_CHARACTERS,
        genders: HUMAN_GENDERS,
        skinTones: SKIN_TONES,
        hairColors: HAIR_COLORS,
        limits: {
          maxLevels: MAX_LEVELS_PER_GAME,
          maxGameNameLength: MAX_GAME_NAME_LENGTH,
          maxLevelNameLength: MAX_LEVEL_NAME_LENGTH,
          minStartingLives: MINIMUM_STARTING_LIVES,
          maxStartingLives: MAXIMUM_STARTING_LIVES,
        },
      },
    };
  },
});

export const renameGameTool: AgentTool = Object.freeze({
  id: "rename_game",
  definition: {
    name: "rename_game",
    description:
      "Change what the whole game is called. This is the name on the game itself, not the name of a level. Takes effect right away.",
    parameters: NAME_PARAMETERS,
  },
  async execute(args: unknown, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const loaded = await loadGame(context);
    if (loaded.status !== "loaded") return toolError("This game could not be found.");

    let name: string;
    try {
      name = planGameName(readString(args, "name"));
    } catch (error) {
      if (error instanceof GameObjectEditError) return toolError(error.reason);
      throw error;
    }

    // The name is kept outside the chat and shown on the kid's game list, so it
    // is screened here rather than relying on the reply screening downstream.
    const verdict = await safeScreen(name, context.moderator, context.signal);
    if (verdict.flagged) {
      console.warn("Game rename was declined by moderation", { categories: verdict.categories });
      return toolError("Cooper cannot call the game that. Try another name.");
    }

    const applied = await context.store.applyGameTitle({
      ownerId: context.ownerId,
      gameId: context.gameId,
      title: name,
    });
    if (applied.status !== "updated") return toolError("This game could not be found.");

    return {
      output: { ok: true, name: applied.title },
      gameRevision: applied.gameRevision,
      gameTitle: applied.title,
    };
  },
});

export const setGameTypeTool: AgentTool = Object.freeze({
  id: "set_game_type",
  definition: {
    name: "set_game_type",
    description:
      "Switch between the running and jumping game and the top-down maze game. Each kind keeps its own levels, so switching back brings the old ones with it. The tools that put things into a level only work on the jumping game. Takes effect right away.",
    parameters: GAME_TYPE_PARAMETERS,
  },
  async execute(args: unknown, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const loaded = await loadGame(context);
    if (loaded.status !== "loaded") return toolError("This game could not be found.");

    let change;
    try {
      change = planGameType(readValue(args, "gameType"));
    } catch (error) {
      if (error instanceof GameObjectEditError) return toolError(error.reason);
      throw error;
    }

    return persist(context, loaded.spec, change, { gameType: change.previewKind });
  },
});

export const setPlayerAppearanceTool: AgentTool = Object.freeze({
  id: "set_player_appearance",
  definition: {
    name: "set_player_appearance",
    description:
      "Change the hero's skin tone and hair colour. This only shows on a human hero, so check the player in read_game first. Takes effect right away.",
    parameters: APPEARANCE_PARAMETERS,
  },
  async execute(args: unknown, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const loaded = await loadGame(context);
    if (loaded.status !== "loaded") return toolError("This game could not be found.");

    let change;
    try {
      change = planPlayerAppearance(readValue(args, "skinTone"), readValue(args, "hairColor"));
    } catch (error) {
      if (error instanceof GameObjectEditError) return toolError(error.reason);
      throw error;
    }

    return persist(context, loaded.spec, change, {
      skinTone: change.skinTone,
      hairColor: change.hairColor,
      showsOnHero: loaded.spec.playerCharacter === "human",
    });
  },
});
