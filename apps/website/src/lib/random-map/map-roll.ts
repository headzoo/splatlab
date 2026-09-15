import { randomUUID } from "node:crypto";

import { z } from "zod";

import { GAME_PLAYER_CONTENT } from "@/game/game-player-content";
import type { PlatformerMapSpec } from "@/game/platformer/types";
import type { MazeMapSpec } from "@/game/top-down/types";
import {
  GENERATED_MAZE_SOURCE_PREFIX,
  GENERATED_PLATFORMER_SOURCE_PREFIX,
  MAP_LENGTHS,
} from "@/lib/generated-map-contract";
import {
  activeMapSource,
  gameDocumentSchema,
  mazeLevelSchema,
  platformerLevelSchema,
  type GameDocument,
  type MazeLevel,
  type PlatformerLevel,
} from "@/lib/game-contract";
import { hasSourceEdits } from "./map-roll-shared";
import { effectiveGamePhysics } from "@/lib/game-physics";
import { memoryGames, type StoredGame } from "@/lib/games";
import { getPrisma, hasDatabase } from "@/lib/prisma";
import {
  applyMapRollChange,
  mapRollChangeSchema,
  mapRollSuccessSchema,
  type MapRollChange,
  type MapRollSuccess,
} from "@/lib/cooper-spec-change";

import { generateMazeMap } from "./maze-generator";
import { generatePlatformerMap } from "./platformer-generator";
import { createSeededRandomSource } from "./random-source";

const ROLL_RETRY_LIMIT = 3;

export const mapRollInputSchema = z.object({
  length: z.enum(MAP_LENGTHS),
  confirmDiscardEdits: z.boolean().default(false),
  expectedRevision: z.number().int().positive().optional(),
  reason: z.enum(["setup", "reroll"]),
}).strict();
export type MapRollInput = z.input<typeof mapRollInputSchema>;
type ParsedMapRollInput = z.output<typeof mapRollInputSchema>;

export { mapRollSuccessSchema, type MapRollSuccess };

export type MapRollResult =
  | { status: "rolled"; result: MapRollSuccess }
  | { status: "confirmation_required" }
  | { status: "conflict"; gameRevision: number }
  | { status: "not_found" };

export { hasSourceEdits, resolveMapRollLength } from "./map-roll-shared";

function donorSource(spec: GameDocument) {
  const source = activeMapSource(spec);
  if (spec.previewKind === "platformer") {
    return spec.generatedPlatformerMaps.find((record) => record.source === source)?.templateSource
      ?? spec.platformerLevels.find((level) => level.id === source)?.templateSource
      ?? source;
  }
  return spec.generatedMazeMaps.find((record) => record.source === source)?.templateSource
    ?? spec.mazeLevels.find((level) => level.id === source)?.templateSource
    ?? source;
}

function platformerRollLevels(
  spec: GameDocument,
  oldSource: string,
  source: string,
  templateSource: PlatformerLevel["templateSource"],
): PlatformerLevel[] {
  const previous = spec.platformerLevels.find((level) => level.id === oldSource);
  const donor = GAME_PLAYER_CONTENT.maps.find((candidate) => candidate.source === templateSource);
  const replacement = {
    id: source,
    templateSource,
    label: previous?.label ?? donor?.label ?? "Random map",
  };
  return previous
    ? spec.platformerLevels.map((level) => level.id === oldSource ? replacement : level)
    : [replacement, ...spec.platformerLevels];
}

function mazeRollLevels(
  spec: GameDocument,
  oldSource: string,
  source: string,
  templateSource: MazeLevel["templateSource"],
): MazeLevel[] {
  const previous = spec.mazeLevels.find((level) => level.id === oldSource);
  const donor = GAME_PLAYER_CONTENT.mazes.find((candidate) => candidate.source === templateSource);
  const replacement = {
    id: source,
    templateSource,
    label: previous?.label ?? donor?.label ?? "Random maze",
  };
  return previous
    ? spec.mazeLevels.map((level) => level.id === oldSource ? replacement : level)
    : [replacement, ...spec.mazeLevels];
}

function mapRollChange(spec: GameDocument, length: ParsedMapRollInput["length"]): MapRollChange {
  const oldSource = activeMapSource(spec);
  const donor = donorSource(spec);
  const token = randomUUID();

  if (spec.previewKind === "platformer") {
    const template = GAME_PLAYER_CONTENT.maps.find((candidate) => candidate.source === donor);
    if (!template) throw new Error(`No platformer donor exists for ${donor}.`);
    const templateSource = platformerLevelSchema.shape.templateSource.parse(template.source);
    const source = `${GENERATED_PLATFORMER_SOURCE_PREFIX}${token}`;
    const physics = effectiveGamePhysics(spec);
    const map = generatePlatformerMap({
      donor: template.map as PlatformerMapSpec,
      length,
      seed: token,
      id: source,
      physics: physics.runtime === "platformer_v1" ? physics : undefined,
    });
    return mapRollChangeSchema.parse({
      previewKind: "platformer",
      platformerMapSource: source,
      platformerLevels: platformerRollLevels(spec, oldSource, source, templateSource),
      generatedPlatformerMaps: [
        ...spec.generatedPlatformerMaps.filter((record) => record.source !== oldSource),
        { source, templateSource, length, generatorVersion: "platformer-v1", map },
      ],
      removedMapSources: [oldSource],
    });
  }

  const template = GAME_PLAYER_CONTENT.mazes.find((candidate) => candidate.source === donor);
  if (!template) throw new Error(`No maze donor exists for ${donor}.`);
  const templateSource = mazeLevelSchema.shape.templateSource.parse(template.source);
  const source = `${GENERATED_MAZE_SOURCE_PREFIX}${token}`;
  const map = generateMazeMap({
    donor: template.map as MazeMapSpec,
    length,
    id: source,
    random: createSeededRandomSource(token),
  });
  return mapRollChangeSchema.parse({
    previewKind: "maze",
    mazeMapSource: source,
    mazeLevels: mazeRollLevels(spec, oldSource, source, templateSource),
    generatedMazeMaps: [
      ...spec.generatedMazeMaps.filter((record) => record.source !== oldSource),
      { source, templateSource, length, generatorVersion: "maze-v1", map },
    ],
    removedMapSources: [oldSource],
  });
}

function buildNext(spec: GameDocument, input: ParsedMapRollInput) {
  const change = mapRollChange(spec, input.length);
  return {
    change,
    spec: gameDocumentSchema.parse({
      ...applyMapRollChange(spec, change),
      mapLength: input.length,
    }),
  };
}

function result(revision: number, change: MapRollChange): MapRollResult {
  return {
    status: "rolled",
    result: mapRollSuccessSchema.parse({ revision, change }),
  };
}

function memoryGame(ownerId: string, gameId: string) {
  return memoryGames().find((game) => game.id === gameId && game.ownerId === ownerId);
}

function commitMemory(game: StoredGame, input: ParsedMapRollInput): MapRollResult {
  if (input.expectedRevision !== undefined && input.expectedRevision !== game.revision) {
    return { status: "conflict", gameRevision: game.revision };
  }
  const spec = gameDocumentSchema.parse(game.spec);
  if (hasSourceEdits(spec) && !input.confirmDiscardEdits) {
    return { status: "confirmation_required" };
  }
  const next = buildNext(spec, input);
  game.spec = next.spec;
  game.gameType = next.spec.previewKind;
  game.mapSource = activeMapSource(next.spec);
  game.revision += 1;
  game.updatedAt = new Date();
  return result(game.revision, next.change);
}

export async function rollGameMap(
  ownerId: string,
  gameId: string,
  input: MapRollInput,
): Promise<MapRollResult> {
  const parsedInput = mapRollInputSchema.parse(input);
  if (!hasDatabase()) {
    const game = memoryGame(ownerId, gameId);
    return game ? commitMemory(game, parsedInput) : { status: "not_found" };
  }

  const prisma = getPrisma();
  const attempts = parsedInput.expectedRevision === undefined ? ROLL_RETRY_LIMIT : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const game = await prisma.game.findFirst({ where: { id: gameId, ownerId } });
    if (!game) return { status: "not_found" };
    if (
      parsedInput.expectedRevision !== undefined
      && parsedInput.expectedRevision !== game.revision
    ) return { status: "conflict", gameRevision: game.revision };

    const spec = gameDocumentSchema.parse(game.spec);
    if (hasSourceEdits(spec) && !parsedInput.confirmDiscardEdits) {
      return { status: "confirmation_required" };
    }
    const next = buildNext(spec, parsedInput);
    const committed = await prisma.game.updateMany({
      where: { id: game.id, ownerId, revision: game.revision },
      data: {
        spec: next.spec,
        gameType: next.spec.previewKind,
        mapSource: activeMapSource(next.spec),
        revision: { increment: 1 },
      },
    });
    if (committed.count === 1) return result(game.revision + 1, next.change);
    if (parsedInput.expectedRevision !== undefined) {
      const current = await prisma.game.findFirst({ where: { id: gameId, ownerId } });
      return current
        ? { status: "conflict", gameRevision: current.revision }
        : { status: "not_found" };
    }
  }
  const current = await prisma.game.findFirst({ where: { id: gameId, ownerId } });
  return current
    ? { status: "conflict", gameRevision: current.revision }
    : { status: "not_found" };
}
