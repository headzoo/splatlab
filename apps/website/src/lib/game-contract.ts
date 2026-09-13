import { z } from "zod";

import { gamePhysicsDocumentSchema } from "./game-physics";

export const PLATFORMER_MAP_SOURCES = [
  "level-1.json",
  "level-3.json",
  "level-2.json",
  "level-4.json",
  "level-5.json",
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
  "gameName",
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

export const PLATFORMER_TERRAIN_KINDS = [
  "empty",
  "ground",
  "platform",
  "obstacle",
  "hazard",
] as const;

export const PLATFORMER_OBJECT_KINDS = [
  "spawn",
  "coin",
  "extra_life",
  "platform_spring",
  "enemy",
  "boss",
  "flying_object",
  "checkpoint",
  "goal",
] as const;

export type GameTheme = (typeof GAME_THEMES)[number];
export type PlayerCharacter = (typeof PLAYER_CHARACTERS)[number];
export type HumanGender = (typeof HUMAN_GENDERS)[number];
export type GameSetupQuestion = (typeof GAME_SETUP_QUESTIONS)[number];
export type GameSetupStep = (typeof GAME_SETUP_STEPS)[number];
export type SkinTone = (typeof SKIN_TONES)[number];
export type HairColor = (typeof HAIR_COLORS)[number];
export type PlatformerTerrainKind = (typeof PLATFORMER_TERRAIN_KINDS)[number];
export type PlatformerObjectKind = (typeof PLATFORMER_OBJECT_KINDS)[number];

const customPlatformerLevelIdSchema = z
  .string()
  .regex(/^custom-platformer-[a-z0-9-]{1,80}$/);
const customMazeLevelIdSchema = z
  .string()
  .regex(/^custom-maze-[a-z0-9-]{1,80}$/);
export const platformerMapSourceSchema = z.union([
  z.enum(PLATFORMER_MAP_SOURCES),
  customPlatformerLevelIdSchema,
]);
export const mazeMapSourceSchema = z.union([
  z.enum(MAZE_MAP_SOURCES),
  customMazeLevelIdSchema,
]);
export type PlatformerMapSource = z.infer<typeof platformerMapSourceSchema>;
export type MazeMapSource = z.infer<typeof mazeMapSourceSchema>;

export const platformerLevelSchema = z.object({
  id: customPlatformerLevelIdSchema,
  templateSource: z.enum(PLATFORMER_MAP_SOURCES),
  label: z.string().trim().min(1).max(40),
}).strict();

export const mazeLevelSchema = z.object({
  id: customMazeLevelIdSchema,
  templateSource: z.enum(MAZE_MAP_SOURCES),
  label: z.string().trim().min(1).max(40),
}).strict();

export type PlatformerLevel = z.infer<typeof platformerLevelSchema>;
export type MazeLevel = z.infer<typeof mazeLevelSchema>;

export const platformerTerrainEditSchema = z
  .object({
    mapSource: platformerMapSourceSchema,
    x: z.number().int().min(0).max(255),
    y: z.number().int().min(0).max(63),
    kind: z.enum(PLATFORMER_TERRAIN_KINDS),
  })
  .strict();

export type PlatformerTerrainEdit = z.infer<typeof platformerTerrainEditSchema>;

export const platformerObjectEditSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    mapSource: platformerMapSourceSchema,
    x: z.number().int().min(0).max(255),
    y: z.number().int().min(0).max(63),
    kind: z.enum(PLATFORMER_OBJECT_KINDS),
  })
  .strict();

export type PlatformerObjectEdit = z.infer<typeof platformerObjectEditSchema>;

export const platformerObjectRemovalSchema = z
  .object({
    mapSource: platformerMapSourceSchema,
    objectId: z.string().trim().min(1).max(100),
  })
  .strict();

export type PlatformerObjectRemoval = z.infer<typeof platformerObjectRemovalSchema>;

export const platformerObjectSettingsSchema = z
  .object({
    mapSource: platformerMapSourceSchema,
    objectId: z.string().trim().min(1).max(100),
    assetId: z.string().trim().min(1).max(100),
    behavior: z.enum(["patroller", "chaser"]),
    direction: z.enum(["left", "right"]),
  })
  .strict();

export type PlatformerObjectSettings = z.infer<typeof platformerObjectSettingsSchema>;

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

const ICE_WORLD_PLAYER_ASSET_IDS = {
  cooper: "ice_world_cooper_01",
  human: "ice_world_human_01",
  ghost: "ice_world_ghost_01",
  robot: "ice_world_robot_01",
} as const satisfies Record<PlayerCharacter, string>;

const ICE_WORLD_GIRL_ASSET_ID = "ice_world_girl_01" as const;

export type PlayerAssetId =
  | (typeof PLAYER_ASSET_IDS)[GameTheme][PlayerCharacter]
  | (typeof GIRL_ASSET_IDS)[GameTheme]
  | (typeof ICE_WORLD_PLAYER_ASSET_IDS)[PlayerCharacter]
  | typeof ICE_WORLD_GIRL_ASSET_ID;

export const gameDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    previewKind: z.enum(["platformer", "maze"]),
    platformerMapSource: platformerMapSourceSchema,
    mazeMapSource: mazeMapSourceSchema.default(MAZE_MAP_SOURCES[0]),
    platformerLevels: z.array(platformerLevelSchema).max(20).default([]),
    mazeLevels: z.array(mazeLevelSchema).max(20).default([]),
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
    platformerTerrainEdits: z
      .array(platformerTerrainEditSchema)
      .max(5000)
      .default([]),
    platformerObjectEdits: z
      .array(platformerObjectEditSchema)
      .max(1000)
      .default([]),
    platformerObjectRemovals: z
      .array(platformerObjectRemovalSchema)
      .max(1000)
      .default([]),
    platformerObjectSettings: z
      .array(platformerObjectSettingsSchema)
      .max(1000)
      .default([]),
    // Absent means "use the read-only catalog document". Cooper's first
    // accepted physics patch forks the catalog into this field, and the server
    // owns it from then on.
    physicsDocument: gamePhysicsDocumentSchema.optional(),
  })
  .strict()
  .superRefine((document, context) => {
    const platformerIds = document.platformerLevels.map((level) => level.id);
    const mazeIds = document.mazeLevels.map((level) => level.id);
    if (new Set(platformerIds).size !== platformerIds.length) {
      context.addIssue({
        code: "custom",
        path: ["platformerLevels"],
        message: "Platformer level IDs must be unique.",
      });
    }
    if (new Set(mazeIds).size !== mazeIds.length) {
      context.addIssue({
        code: "custom",
        path: ["mazeLevels"],
        message: "Maze level IDs must be unique.",
      });
    }
    if (
      document.platformerMapSource.startsWith("custom-platformer-") &&
      !platformerIds.includes(document.platformerMapSource)
    ) {
      context.addIssue({
        code: "custom",
        path: ["platformerMapSource"],
        message: "The selected platformer level must exist in this game.",
      });
    }
    if (
      document.mazeMapSource.startsWith("custom-maze-") &&
      !mazeIds.includes(document.mazeMapSource)
    ) {
      context.addIssue({
        code: "custom",
        path: ["mazeMapSource"],
        message: "The selected maze level must exist in this game.",
      });
    }
  });

export type GameDocument = z.infer<typeof gameDocumentSchema>;
export type GamePreviewKind = GameDocument["previewKind"];

export const DEFAULT_GAME_DOCUMENT: GameDocument = {
  schemaVersion: 1,
  previewKind: "platformer",
  platformerMapSource: PLATFORMER_MAP_SOURCES[0],
  mazeMapSource: MAZE_MAP_SOURCES[0],
  platformerLevels: [],
  mazeLevels: [],
  playerCharacter: "cooper",
  humanGender: "boy",
  skinTone: "skin_04",
  hairColor: "hair_03",
  setupStep: "gameType",
  builderSetupHistory: ["gameType"],
  builderChatHistory: [],
  platformerTerrainEdits: [],
  platformerObjectEdits: [],
  platformerObjectRemovals: [],
  platformerObjectSettings: [],
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

export const GAME_THUMBNAIL_MAX_DATA_URL_LENGTH = 750_000;

export const gameThumbnailInputSchema = z
  .object({
    thumbnailDataUrl: z
      .string()
      .max(GAME_THUMBNAIL_MAX_DATA_URL_LENGTH)
      .regex(/^data:image\/(?:png|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();

const PLATFORMER_TITLES: Record<(typeof PLATFORMER_MAP_SOURCES)[number], string> = {
  "level-1.json": "Green Hills Platformer",
  "level-2.json": "Space Platformer",
  "level-3.json": "Haunted Platformer",
  "level-4.json": "Dragon Platformer",
  "level-5.json": "Ice World Platformer",
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
  const activeSource = activeMapSource(spec);
  const source = spec.previewKind === "maze"
    ? spec.mazeLevels.find((level) => level.id === activeSource)?.templateSource
      ?? activeSource
    : spec.platformerLevels.find((level) => level.id === activeSource)?.templateSource
      ?? activeSource;
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
  if (spec.previewKind === "platformer") {
    const source = spec.platformerLevels.find(
      (level) => level.id === spec.platformerMapSource,
    )?.templateSource ?? spec.platformerMapSource;
    if (source === "level-5.json") {
      if (spec.playerCharacter === "human" && spec.humanGender === "girl") {
        return ICE_WORLD_GIRL_ASSET_ID;
      }
      return ICE_WORLD_PLAYER_ASSET_IDS[spec.playerCharacter];
    }
  }
  return playerAssetIdFor(
    activeGameTheme(spec),
    spec.playerCharacter,
    spec.humanGender,
  );
}

export function defaultGameTitle(spec: GameDocument) {
  const platformerSource = spec.platformerLevels.find(
    (level) => level.id === spec.platformerMapSource,
  )?.templateSource ?? spec.platformerMapSource;
  const mazeSource = spec.mazeLevels.find(
    (level) => level.id === spec.mazeMapSource,
  )?.templateSource ?? spec.mazeMapSource;
  return spec.previewKind === "maze"
    ? MAZE_TITLES[mazeSource as keyof typeof MAZE_TITLES] ?? "Maze Game"
    : PLATFORMER_TITLES[platformerSource as keyof typeof PLATFORMER_TITLES]
      ?? "Platformer Game";
}

export type SavedGameDto = {
  id: string;
  title: string;
  gameType: GamePreviewKind;
  mapSource: string;
  spec: GameDocument;
  thumbnailDataUrl: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type SavedGameSummaryDto = Omit<SavedGameDto, "spec">;
