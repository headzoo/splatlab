import { randomUUID } from "node:crypto";

import {
  activeMapSource,
  gameDocumentSchema,
  type GameDocument,
  type GamePreviewKind,
  type SavedGameDto,
  type SavedGameSummaryDto,
} from "./game-contract";
import { getPrisma, hasDatabase } from "./prisma";

type StoredGame = {
  id: string;
  ownerId: string;
  title: string;
  gameType: GamePreviewKind;
  mapSource: string;
  spec: GameDocument;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

declare global {
  var splatLabGamesMemory: StoredGame[] | undefined;
}

function memoryGames() {
  globalThis.splatLabGamesMemory ??= [];
  return globalThis.splatLabGamesMemory;
}

function parseStoredGame(record: {
  id: string;
  ownerId: string;
  title: string;
  gameType: string;
  mapSource: string;
  spec: unknown;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}): StoredGame {
  const spec = gameDocumentSchema.parse(record.spec);

  return {
    ...record,
    gameType: spec.previewKind,
    spec,
  };
}

function toDto(game: StoredGame): SavedGameDto {
  return {
    id: game.id,
    title: game.title,
    gameType: game.gameType,
    mapSource: game.mapSource,
    spec: game.spec,
    revision: game.revision,
    createdAt: game.createdAt.toISOString(),
    updatedAt: game.updatedAt.toISOString(),
  };
}

function toSummary(game: StoredGame): SavedGameSummaryDto {
  return {
    id: game.id,
    title: game.title,
    gameType: game.gameType,
    mapSource: game.mapSource,
    revision: game.revision,
    createdAt: game.createdAt.toISOString(),
    updatedAt: game.updatedAt.toISOString(),
  };
}

export async function listGames(ownerId: string): Promise<SavedGameSummaryDto[]> {
  if (!hasDatabase()) {
    return memoryGames()
      .filter((game) => game.ownerId === ownerId)
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .map(toSummary);
  }

  const records = await getPrisma().game.findMany({
    where: { ownerId },
    orderBy: { updatedAt: "desc" },
  });

  return records.map((record) => toSummary(parseStoredGame(record)));
}

export async function getGame(ownerId: string, id: string): Promise<SavedGameDto | null> {
  if (!hasDatabase()) {
    const game = memoryGames().find(
      (candidate) => candidate.id === id && candidate.ownerId === ownerId,
    );
    return game ? toDto(game) : null;
  }

  const record = await getPrisma().game.findFirst({ where: { id, ownerId } });
  return record ? toDto(parseStoredGame(record)) : null;
}

export async function getPublicGame(id: string): Promise<SavedGameDto | null> {
  if (!hasDatabase()) {
    const game = memoryGames().find((candidate) => candidate.id === id);
    return game ? toDto(game) : null;
  }

  const record = await getPrisma().game.findUnique({ where: { id } });
  return record ? toDto(parseStoredGame(record)) : null;
}

export async function createGame(
  ownerId: string,
  input: { title: string; spec: GameDocument },
): Promise<SavedGameDto> {
  const now = new Date();
  const gameType = input.spec.previewKind;
  const mapSource = activeMapSource(input.spec);

  if (!hasDatabase()) {
    const game: StoredGame = {
      id: randomUUID(),
      ownerId,
      title: input.title,
      gameType,
      mapSource,
      spec: input.spec,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    memoryGames().push(game);
    return toDto(game);
  }

  const record = await getPrisma().game.create({
    data: {
      ownerId,
      title: input.title,
      gameType,
      mapSource,
      spec: input.spec,
    },
  });

  return toDto(parseStoredGame(record));
}

export type UpdateGameResult =
  | { status: "updated"; game: SavedGameDto }
  | { status: "conflict"; game: SavedGameDto }
  | { status: "not_found" };

export async function updateGame(
  ownerId: string,
  id: string,
  input: { title: string; spec: GameDocument; expectedRevision: number },
): Promise<UpdateGameResult> {
  if (!hasDatabase()) {
    const game = memoryGames().find(
      (candidate) => candidate.id === id && candidate.ownerId === ownerId,
    );

    if (!game) return { status: "not_found" };
    if (game.revision !== input.expectedRevision) {
      return { status: "conflict", game: toDto(game) };
    }

    game.title = input.title;
    game.gameType = input.spec.previewKind;
    game.mapSource = activeMapSource(input.spec);
    game.spec = input.spec;
    game.revision += 1;
    game.updatedAt = new Date();
    return { status: "updated", game: toDto(game) };
  }

  const prisma = getPrisma();
  const result = await prisma.game.updateMany({
    where: { id, ownerId, revision: input.expectedRevision },
    data: {
      title: input.title,
      gameType: input.spec.previewKind,
      mapSource: activeMapSource(input.spec),
      spec: input.spec,
      revision: { increment: 1 },
    },
  });

  const current = await prisma.game.findFirst({ where: { id, ownerId } });

  if (!current) return { status: "not_found" };
  const game = toDto(parseStoredGame(current));
  return result.count === 1
    ? { status: "updated", game }
    : { status: "conflict", game };
}

export async function deleteGame(ownerId: string, id: string) {
  if (!hasDatabase()) {
    const index = memoryGames().findIndex(
      (candidate) => candidate.id === id && candidate.ownerId === ownerId,
    );
    if (index < 0) return false;
    memoryGames().splice(index, 1);
    return true;
  }

  const result = await getPrisma().game.deleteMany({ where: { id, ownerId } });
  return result.count === 1;
}
