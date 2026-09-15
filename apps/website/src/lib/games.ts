import { randomUUID } from "node:crypto";

import {
  activeMapSource,
  gameDocumentSchema,
  toPublicGameDocument,
  type GameDocument,
  type GamePreviewKind,
  type PublicGameDto,
  type PublicGameSummaryDto,
  type SavedGameDto,
  type SavedGameSummaryDto,
} from "./game-contract";
import { mergeObjectArrays } from "./cooper-spec-change";
import { deleteOwnedBlob } from "./blob-store";
import { displayNameAvatarSrc, UNSET_DISPLAY_NAME } from "./display-name";
import { getPrisma, hasDatabase } from "./prisma";

export type StoredGame = {
  id: string;
  ownerId: string;
  title: string;
  isPublic: boolean;
  gameType: GamePreviewKind;
  mapSource: string;
  spec: GameDocument;
  thumbnailDataUrl: string | null;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

declare global {
  var splatLabGamesMemory: StoredGame[] | undefined;
}

export function memoryGames() {
  globalThis.splatLabGamesMemory ??= [];
  return globalThis.splatLabGamesMemory;
}

function parseStoredGame(record: {
  id: string;
  ownerId: string;
  title: string;
  isPublic: boolean;
  gameType: string;
  mapSource: string;
  spec: unknown;
  thumbnailDataUrl: string | null;
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
    isPublic: game.isPublic,
    gameType: game.gameType,
    mapSource: game.mapSource,
    spec: game.spec,
    thumbnailDataUrl: game.thumbnailDataUrl,
    revision: game.revision,
    createdAt: game.createdAt.toISOString(),
    updatedAt: game.updatedAt.toISOString(),
  };
}

function toSummary(game: StoredGame): SavedGameSummaryDto {
  return {
    id: game.id,
    title: game.title,
    isPublic: game.isPublic,
    gameType: game.gameType,
    mapSource: game.mapSource,
    thumbnailDataUrl: game.thumbnailDataUrl,
    revision: game.revision,
    createdAt: game.createdAt.toISOString(),
    updatedAt: game.updatedAt.toISOString(),
  };
}

function toPublicDto(game: StoredGame): PublicGameDto {
  return {
    id: game.id,
    title: game.title,
    spec: toPublicGameDocument(game.spec),
  };
}

function toPublicSummary(
  game: StoredGame,
  creator?: { name: string; image: string | null },
): PublicGameSummaryDto {
  return {
    ...toSummary(game),
    creator: {
      displayName: creator?.name.trim() || UNSET_DISPLAY_NAME,
      avatarSrc: displayNameAvatarSrc(creator?.image),
    },
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

/** Public discovery is intentionally separate from owner-scoped Lab listing. */
export async function listPublicGames(): Promise<PublicGameSummaryDto[]> {
  if (!hasDatabase()) {
    return memoryGames()
      .filter((game) => game.isPublic)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map((game) => toPublicSummary(game));
  }

  const records = await getPrisma().game.findMany({
    where: { isPublic: true },
    orderBy: { createdAt: "desc" },
    include: {
      owner: {
        select: { name: true, image: true },
      },
    },
  });

  return records.map((record) =>
    toPublicSummary(parseStoredGame(record), record.owner),
  );
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

export async function getPublicGame(id: string): Promise<PublicGameDto | null> {
  if (!hasDatabase()) {
    const game = memoryGames().find(
      (candidate) => candidate.id === id && candidate.isPublic,
    );
    return game ? toPublicDto(game) : null;
  }

  const record = await getPrisma().game.findFirst({
    where: { id, isPublic: true },
  });
  return record ? toPublicDto(parseStoredGame(record)) : null;
}

export async function createGame(
  ownerId: string,
  input: { title: string; isPublic?: boolean; spec: GameDocument },
): Promise<SavedGameDto> {
  const now = new Date();
  const gameType = input.spec.previewKind;
  const mapSource = activeMapSource(input.spec);

  if (!hasDatabase()) {
    const game: StoredGame = {
      id: randomUUID(),
      ownerId,
      title: input.title,
      isPublic: input.isPublic ?? false,
      gameType,
      mapSource,
      spec: input.spec,
      thumbnailDataUrl: null,
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
      isPublic: input.isPublic ?? false,
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

/**
 * `physicsDocument` is server-owned: only Cooper's validated patches write it.
 * A client autosave can carry a stale copy (or none at all), so the stored
 * value always wins and the client's is discarded.
 */
function withStoredPhysics(spec: GameDocument, stored: GameDocument): GameDocument {
  const next: GameDocument = { ...spec };
  delete next.physicsDocument;
  if (stored.physicsDocument) next.physicsDocument = stored.physicsDocument;
  return next;
}

/**
 * The object arrays are shared: the level editor appends to them from the
 * client, and Cooper's tools append to them on the server. An autosave can
 * therefore carry a spec that predates Cooper's last change, so the two are
 * unioned instead of letting the incoming copy win.
 */
function withStoredObjects(spec: GameDocument, stored: GameDocument): GameDocument {
  return { ...spec, ...mergeObjectArrays(stored, spec) };
}

/**
 * Only Cooper writes the starting life count, so an autosave never carries a
 * newer value than the stored one and the stored value always wins.
 */
function withStoredStartingLives(spec: GameDocument, stored: GameDocument): GameDocument {
  const next: GameDocument = { ...spec };
  delete next.startingLives;
  if (stored.startingLives !== undefined) next.startingLives = stored.startingLives;
  return next;
}

function withServerOwnedFields(spec: GameDocument, stored: GameDocument): GameDocument {
  return withStoredStartingLives(withStoredObjects(withStoredPhysics(spec, stored), stored), stored);
}

export async function updateGame(
  ownerId: string,
  id: string,
  input: {
    title: string;
    isPublic?: boolean;
    spec: GameDocument;
    expectedRevision: number;
  },
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
    if (input.isPublic !== undefined) game.isPublic = input.isPublic;
    game.gameType = input.spec.previewKind;
    game.mapSource = activeMapSource(input.spec);
    game.spec = withServerOwnedFields(input.spec, game.spec);
    game.revision += 1;
    game.updatedAt = new Date();
    return { status: "updated", game: toDto(game) };
  }

  const prisma = getPrisma();
  const existing = await prisma.game.findFirst({ where: { id, ownerId } });
  if (!existing) return { status: "not_found" };

  const result = await prisma.game.updateMany({
    where: { id, ownerId, revision: input.expectedRevision },
    data: {
      title: input.title,
      ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
      gameType: input.spec.previewKind,
      mapSource: activeMapSource(input.spec),
      spec: withServerOwnedFields(input.spec, parseStoredGame(existing).spec),
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
  const existing = await getGame(ownerId, id);
  if (!existing) return false;

  if (!hasDatabase()) {
    const index = memoryGames().findIndex(
      (candidate) => candidate.id === id && candidate.ownerId === ownerId,
    );
    if (index < 0) return false;
    memoryGames().splice(index, 1);
    await deleteOwnedBlob(existing.thumbnailDataUrl);
    return true;
  }

  const result = await getPrisma().game.deleteMany({ where: { id, ownerId } });
  if (result.count !== 1) return false;
  await deleteOwnedBlob(existing.thumbnailDataUrl);
  return true;
}

export async function saveGameThumbnail(
  ownerId: string,
  id: string,
  thumbnailDataUrl: string,
) {
  const existing = await getGame(ownerId, id);
  if (!existing) return false;

  if (!hasDatabase()) {
    const game = memoryGames().find(
      (candidate) => candidate.id === id && candidate.ownerId === ownerId,
    );
    if (!game) return false;
    game.thumbnailDataUrl = thumbnailDataUrl;
    game.updatedAt = new Date();
    if (existing.thumbnailDataUrl !== thumbnailDataUrl) {
      await deleteOwnedBlob(existing.thumbnailDataUrl);
    }
    return true;
  }

  const result = await getPrisma().game.updateMany({
    where: { id, ownerId },
    data: { thumbnailDataUrl },
  });
  if (result.count !== 1) return false;
  if (existing.thumbnailDataUrl !== thumbnailDataUrl) {
    await deleteOwnedBlob(existing.thumbnailDataUrl);
  }
  return true;
}
