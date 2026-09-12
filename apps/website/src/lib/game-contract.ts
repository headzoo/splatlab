import { z } from "zod";

export const PLATFORMER_MAP_SOURCES = [
  "level-1.json",
  "level-3.json",
  "level-2.json",
  "level-4.json",
] as const;

export const MAZE_MAP_SOURCES = [
  "maze_green_hills_01.json",
  "maze_space_01.json",
  "maze_graveyard_01.json",
  "maze_dragon_world_01.json",
] as const;

export const GAME_THEMES = [
  "green_hills",
  "graveyard",
  "space",
  "dragon_world",
] as const;

export const PLAYER_CHARACTERS = ["cooper", "human", "ghost", "robot"] as const;
export const HUMAN_GENDERS = ["boy", "girl"] as const;
export const GAME_SETUP_QUESTIONS = [
  "gameType",
  "theme",
  "character",
  "humanGender",
  "skinTone",
  "hairColor",
] as const;
export const GAME_SETUP_STEPS = [...GAME_SETUP_QUESTIONS, "complete"] as const;
export const SKIN_TONES = [
  "skin_01",
  "skin_02",
  "skin_03",
  "skin_04",
  "skin_05",
  "skin_06",
] as const;
export const HAIR_COLORS = [
  "hair_01",
  "hair_02",
  "hair_03",
  "hair_04",
  "hair_05",
  "hair_06",
  "hair_07",
  "hair_08",
] as const;

export type GameTheme = (typeof GAME_THEMES)[number];
export type PlayerCharacter = (typeof PLAYER_CHARACTERS)[number];
export type HumanGender = (typeof HUMAN_GENDERS)[number];
export type GameSetupQuestion = (typeof GAME_SETUP_QUESTIONS)[number];
export type GameSetupStep = (typeof GAME_SETUP_STEPS)[number];
export type SkinTone = (typeof SKIN_TONES)[number];
export type HairColor = (typeof HAIR_COLORS)[number];

export const builderChatTurnSchema = z
  .object({
    role: z.enum(["user", "cooper"]),
    message: z.string().trim().min(1).max(500),
  })
  .strict();

export type BuilderChatTurn = z.infer<typeof builderChatTurnSchema>;

export const THEME_MAP_SOURCES: Record<
  GameTheme,
  {
    platformerMapSource: (typeof PLATFORMER_MAP_SOURCES)[number];
    mazeMapSource: (typeof MAZE_MAP_SOURCES)[number];
  }
> = {
  green_hills: {
    platformerMapSource: "level-1.json",
    mazeMapSource: "maze_green_hills_01.json",
  },
  graveyard: {
    platformerMapSource: "level-3.json",
    mazeMapSource: "maze_graveyard_01.json",
  },
  space: {
    platformerMapSource: "level-2.json",
    mazeMapSource: "maze_space_01.json",
  },
  dragon_world: {
    platformerMapSource: "level-4.json",
    mazeMapSource: "maze_dragon_world_01.json",
  },
};

const PLAYER_ASSET_IDS = {
  green_hills: {
    cooper: "neutral_cooper_01",
    human: "neutral_human_01",
    ghost: "neutral_ghost_01",
    robot: "neutral_robot_01",
  },
  graveyard: {
    cooper: "haunted_cooper_01",
    human: "haunted_human_01",
    ghost: "haunted_ghost_01",
    robot: "haunted_robot_01",
  },
  space: {
    cooper: "space_cooper_01",
    human: "space_human_01",
    ghost: "space_ghost_01",
    robot: "space_robot_01",
  },
  dragon_world: {
    cooper: "dragon_cooper_01",
    human: "dragon_human_01",
    ghost: "dragon_ghost_01",
    robot: "neutral_robot_01",
  },
} as const satisfies Record<GameTheme, Record<PlayerCharacter, string>>;

const GIRL_ASSET_IDS = {
  green_hills: "neutral_girl_01",
  graveyard: "haunted_girl_01",
  space: "space_girl_01",
  dragon_world: "dragon_girl_01",
} as const satisfies Record<GameTheme, string>;

export type PlayerAssetId =
  | (typeof PLAYER_ASSET_IDS)[GameTheme][PlayerCharacter]
  | (typeof GIRL_ASSET_IDS)[GameTheme];

export const gameDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    previewKind: z.enum(["platformer", "maze"]),
    platformerMapSource: z.enum(PLATFORMER_MAP_SOURCES),
    mazeMapSource: z.enum(MAZE_MAP_SOURCES).default(MAZE_MAP_SOURCES[0]),
    playerCharacter: z.enum(PLAYER_CHARACTERS).default("cooper"),
    humanGender: z.enum(HUMAN_GENDERS).default("boy"),
    skinTone: z.enum(SKIN_TONES).default("skin_04"),
    hairColor: z.enum(HAIR_COLORS).default("hair_03"),
    setupStep: z.enum(GAME_SETUP_STEPS).default("complete"),
    builderSetupHistory: z
      .array(z.enum(GAME_SETUP_QUESTIONS))
      .max(GAME_SETUP_QUESTIONS.length)
      .default([]),
    builderChatHistory: z.array(builderChatTurnSchema).max(50).default([]),
  })
  .strict();

export type GameDocument = z.infer<typeof gameDocumentSchema>;
export type GamePreviewKind = GameDocument["previewKind"];

export const DEFAULT_GAME_DOCUMENT: GameDocument = {
  schemaVersion: 1,
  previewKind: "platformer",
  platformerMapSource: PLATFORMER_MAP_SOURCES[0],
  mazeMapSource: MAZE_MAP_SOURCES[0],
  playerCharacter: "cooper",
  humanGender: "boy",
  skinTone: "skin_04",
  hairColor: "hair_03",
  setupStep: "gameType",
  builderSetupHistory: ["gameType"],
  builderChatHistory: [],
};

export const createGameInputSchema = z
  .object({
    title: z.string().trim().min(1).max(80).optional(),
    spec: gameDocumentSchema,
  })
  .strict();

export const updateGameInputSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    spec: gameDocumentSchema,
    expectedRevision: z.number().int().positive(),
  })
  .strict();

const PLATFORMER_TITLES: Record<(typeof PLATFORMER_MAP_SOURCES)[number], string> = {
  "level-1.json": "Green Hills Platformer",
  "level-2.json": "Space Platformer",
  "level-3.json": "Haunted Platformer",
  "level-4.json": "Dragon Platformer",
};

const MAZE_TITLES: Record<(typeof MAZE_MAP_SOURCES)[number], string> = {
  "maze_green_hills_01.json": "Green Hills Maze",
  "maze_space_01.json": "Space Maze",
  "maze_graveyard_01.json": "Graveyard Maze",
  "maze_dragon_world_01.json": "Dragon World Maze",
};

export function activeMapSource(spec: GameDocument) {
  return spec.previewKind === "maze" ? spec.mazeMapSource : spec.platformerMapSource;
}

export function activeGameTheme(spec: GameDocument): GameTheme {
  const source = activeMapSource(spec);
  const match = GAME_THEMES.find((theme) => {
    const themeSources = THEME_MAP_SOURCES[theme];
    return source === themeSources.platformerMapSource || source === themeSources.mazeMapSource;
  });
  return match ?? "green_hills";
}

export function playerAssetIdFor(
  theme: GameTheme,
  character: PlayerCharacter,
  humanGender: HumanGender = "boy",
): PlayerAssetId {
  if (character === "human" && humanGender === "girl") {
    return GIRL_ASSET_IDS[theme];
  }
  return PLAYER_ASSET_IDS[theme][character];
}

export function activePlayerAssetId(spec: GameDocument): PlayerAssetId {
  return playerAssetIdFor(
    activeGameTheme(spec),
    spec.playerCharacter,
    spec.humanGender,
  );
}

export function defaultGameTitle(spec: GameDocument) {
  return spec.previewKind === "maze"
    ? MAZE_TITLES[spec.mazeMapSource]
    : PLATFORMER_TITLES[spec.platformerMapSource];
}

export type SavedGameDto = {
  id: string;
  title: string;
  gameType: GamePreviewKind;
  mapSource: string;
  spec: GameDocument;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type SavedGameSummaryDto = Omit<SavedGameDto, "spec">;
