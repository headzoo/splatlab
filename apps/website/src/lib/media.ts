import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";

import {
  deleteOwnedBlob,
  deleteOwnedScreenshotBlob,
  putOwnedBlob,
} from "./blob-store";
import {
  blobUrlMatchesPathname,
  isOwnedScreenshotPathname,
  MAX_SCREENSHOTS_PER_USER,
  SCREENSHOT_MAX_BYTES,
  screenshotBlobPathname,
} from "./blob-path";
import { getGame, getPublicGame } from "./games";
import { getPrisma, hasDatabase } from "./prisma";

export const MEDIA_KIND_SCREENSHOT = "screenshot";

const SCREENSHOT_CONTENT_TYPE = "image/png";
const RESERVATION_MAX_AGE_MS = 15 * 60 * 1000;

export type MediaAssetDto = {
  id: string;
  gameId: string | null;
  gameTitle: string | null;
  kind: typeof MEDIA_KIND_SCREENSHOT;
  url: string;
  pathname: string;
  contentType: string;
  byteSize: number;
  createdAt: string;
};

export type PublicMediaDto = {
  id: string;
  url: string;
  createdAt: string;
  gameId: string | null;
  gameTitle: string | null;
};

type StoredMedia = {
  id: string;
  ownerId: string;
  gameId: string | null;
  kind: typeof MEDIA_KIND_SCREENSHOT;
  url: string;
  pathname: string;
  contentType: string;
  byteSize: number;
  quotaSlot?: number | null;
  readyAt?: Date | null;
  createdAt: Date;
};

type ScreenshotReservation = {
  id: string;
  ownerId: string;
  gameId: string | null;
  pathname: string;
  byteSize: number;
  quotaSlot: number;
  createdAt: Date;
};

type ScreenshotReservationResult =
  | { status: "reserved"; reservation: ScreenshotReservation }
  | { status: "limit" }
  | { status: "invalid" };

export type ScreenshotStorage = {
  put: (input: {
    pathname: string;
    body: Blob;
    contentType: typeof SCREENSHOT_CONTENT_TYPE;
    addRandomSuffix: false;
    allowOverwrite: false;
  }) => Promise<{
    url: string;
    pathname: string;
    contentType: string;
  }>;
  delete: (ownerId: string, pathname: string) => Promise<boolean>;
};

const defaultScreenshotStorage: ScreenshotStorage = {
  put: (input) => putOwnedBlob(input),
  delete: (ownerId, pathname) =>
    deleteOwnedScreenshotBlob(ownerId, pathname),
};

declare global {
  var splatLabMediaMemory: StoredMedia[] | undefined;
}

export function memoryMedia() {
  globalThis.splatLabMediaMemory ??= [];
  return globalThis.splatLabMediaMemory;
}

export type SaveScreenshotResult =
  | { status: "created"; media: MediaAssetDto }
  | { status: "limit" }
  | { status: "invalid" };

function isReady(media: StoredMedia) {
  return media.readyAt !== null;
}

function toDto(media: StoredMedia, gameTitle: string | null): MediaAssetDto {
  return {
    id: media.id,
    gameId: media.gameId,
    gameTitle,
    kind: MEDIA_KIND_SCREENSHOT,
    url: media.url,
    pathname: media.pathname,
    contentType: media.contentType,
    byteSize: media.byteSize,
    createdAt: media.createdAt.toISOString(),
  };
}

function toPublicDto(
  media: StoredMedia,
  game: { id: string; title: string } | null,
): PublicMediaDto {
  return {
    id: media.id,
    url: media.url,
    createdAt: media.createdAt.toISOString(),
    gameId: game?.id ?? null,
    gameTitle: game?.title ?? null,
  };
}

async function resolveOwnedGameTitle(ownerId: string, gameId: string | null) {
  if (!gameId) return null;
  const game = await getGame(ownerId, gameId);
  return game?.title ?? null;
}

async function resolvePublicGame(gameId: string | null) {
  if (!gameId) return null;
  const game = await getPublicGame(gameId);
  return game ? { id: game.id, title: game.title } : null;
}

export async function listMedia(ownerId: string): Promise<MediaAssetDto[]> {
  if (!hasDatabase()) {
    const items = memoryMedia()
      .filter((media) => media.ownerId === ownerId && isReady(media))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    return Promise.all(
      items.map(async (media) =>
        toDto(media, await resolveOwnedGameTitle(ownerId, media.gameId)),
      ),
    );
  }

  const records = await getPrisma().mediaAsset.findMany({
    where: {
      ownerId,
      kind: MEDIA_KIND_SCREENSHOT,
      readyAt: { not: null },
    },
    orderBy: { createdAt: "desc" },
    include: { game: { select: { title: true } } },
  });

  return records.map((record) =>
    toDto(
      {
        ...record,
        kind: MEDIA_KIND_SCREENSHOT,
      },
      record.game?.title ?? null,
    ),
  );
}

export async function getPublicMedia(id: string): Promise<PublicMediaDto | null> {
  if (!hasDatabase()) {
    const media = memoryMedia().find(
      (candidate) => candidate.id === id && isReady(candidate),
    );
    if (!media) return null;
    return toPublicDto(media, await resolvePublicGame(media.gameId));
  }

  const record = await getPrisma().mediaAsset.findUnique({
    where: { id },
    include: { game: { select: { id: true, title: true, isPublic: true } } },
  });
  if (
    !record ||
    record.kind !== MEDIA_KIND_SCREENSHOT ||
    record.readyAt === null
  ) {
    return null;
  }
  return toPublicDto(
    { ...record, kind: MEDIA_KIND_SCREENSHOT },
    record.game?.isPublic
      ? { id: record.game.id, title: record.game.title }
      : null,
  );
}

function isPrismaError(error: unknown, code: string) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

function availableQuotaSlot(slots: Array<number | null | undefined>) {
  const occupied = new Set(
    slots.filter((slot): slot is number => typeof slot === "number"),
  );
  for (let slot = 0; slot < MAX_SCREENSHOTS_PER_USER; slot += 1) {
    if (!occupied.has(slot)) return slot;
  }
  return null;
}

async function cleanupExpiredReservations(
  ownerId: string,
  storage: ScreenshotStorage,
) {
  const expiresBefore = new Date(Date.now() - RESERVATION_MAX_AGE_MS);
  let pathnames: string[];

  if (!hasDatabase()) {
    pathnames = [];
    for (let index = memoryMedia().length - 1; index >= 0; index -= 1) {
      const media = memoryMedia()[index];
      if (
        media?.ownerId === ownerId &&
        media.kind === MEDIA_KIND_SCREENSHOT &&
        media.readyAt === null &&
        media.createdAt < expiresBefore
      ) {
        pathnames.push(media.pathname);
        memoryMedia().splice(index, 1);
      }
    }
  } else {
    pathnames = (
      await getPrisma().$queryRaw<Array<{ pathname: string }>>`
        DELETE FROM "media_asset"
        WHERE "owner_id" = ${ownerId}
          AND "kind" = ${MEDIA_KIND_SCREENSHOT}
          AND "ready_at" IS NULL
          AND "created_at" < ${expiresBefore}
        RETURNING "pathname"
      `
    ).map((record) => record.pathname);
  }

  await Promise.all(
    pathnames.map((pathname) => storage.delete(ownerId, pathname)),
  );
}

async function reserveScreenshot(
  ownerId: string,
  gameId: string | null,
  byteSize: number,
): Promise<ScreenshotReservationResult> {
  const now = new Date();

  if (!hasDatabase()) {
    const owned = memoryMedia().filter(
      (media) =>
        media.ownerId === ownerId && media.kind === MEDIA_KIND_SCREENSHOT,
    );
    if (owned.length >= MAX_SCREENSHOTS_PER_USER) return { status: "limit" };

    const quotaSlot = availableQuotaSlot(owned.map((media) => media.quotaSlot));
    if (quotaSlot === null) return { status: "limit" };

    const id = randomUUID();
    const pathname = screenshotBlobPathname(ownerId, id);
    memoryMedia().push({
      id,
      ownerId,
      gameId,
      kind: MEDIA_KIND_SCREENSHOT,
      url: `pending://screenshot/${id}`,
      pathname,
      contentType: SCREENSHOT_CONTENT_TYPE,
      byteSize,
      quotaSlot,
      readyAt: null,
      createdAt: now,
    });
    return {
      status: "reserved",
      reservation: {
        id,
        ownerId,
        gameId,
        pathname,
        byteSize,
        quotaSlot,
        createdAt: now,
      },
    };
  }

  const prisma = getPrisma();
  for (let attempt = 0; attempt < MAX_SCREENSHOTS_PER_USER; attempt += 1) {
    const occupied = await prisma.mediaAsset.findMany({
      where: { ownerId, kind: MEDIA_KIND_SCREENSHOT },
      select: { quotaSlot: true },
    });
    const quotaSlot = availableQuotaSlot(
      occupied.map((record) => record.quotaSlot),
    );
    if (quotaSlot === null) return { status: "limit" };

    const id = randomUUID();
    const pathname = screenshotBlobPathname(ownerId, id);

    try {
      // The owner/kind/slot unique index makes this insert the atomic quota
      // reservation. A concurrent claimant gets P2002 and retries another slot.
      const reservation = await prisma.mediaAsset.create({
        data: {
          id,
          ownerId,
          gameId,
          gameOwnerId: gameId ? ownerId : null,
          kind: MEDIA_KIND_SCREENSHOT,
          url: `pending://screenshot/${id}`,
          pathname,
          contentType: SCREENSHOT_CONTENT_TYPE,
          byteSize,
          quotaSlot,
          readyAt: null,
          createdAt: now,
        },
      });
      return {
        status: "reserved",
        reservation: {
          id: reservation.id,
          ownerId: reservation.ownerId,
          gameId: reservation.gameId,
          pathname: reservation.pathname,
          byteSize: reservation.byteSize,
          quotaSlot: reservation.quotaSlot ?? quotaSlot,
          createdAt: reservation.createdAt,
        },
      };
    } catch (error) {
      if (isPrismaError(error, "P2002")) continue;
      if (isPrismaError(error, "P2003")) return { status: "invalid" };
      throw error;
    }
  }

  return { status: "limit" };
}

async function releaseReservation(ownerId: string, id: string) {
  if (!hasDatabase()) {
    const index = memoryMedia().findIndex(
      (media) =>
        media.id === id && media.ownerId === ownerId && media.readyAt === null,
    );
    if (index >= 0) memoryMedia().splice(index, 1);
    return;
  }

  await getPrisma().mediaAsset.deleteMany({
    where: { id, ownerId, readyAt: null },
  });
}

async function finalizeReservation(
  reservation: ScreenshotReservation,
  uploaded: { url: string; pathname: string; contentType: string },
): Promise<StoredMedia | null> {
  const readyAt = new Date();

  if (!hasDatabase()) {
    const media = memoryMedia().find(
      (candidate) =>
        candidate.id === reservation.id &&
        candidate.ownerId === reservation.ownerId &&
        candidate.readyAt === null,
    );
    if (!media) return null;
    media.url = uploaded.url;
    media.pathname = uploaded.pathname;
    media.contentType = uploaded.contentType;
    media.readyAt = readyAt;
    return media;
  }

  const record = await getPrisma().$transaction(async (transaction) => {
    const updated = await transaction.mediaAsset.updateMany({
      where: {
        id: reservation.id,
        ownerId: reservation.ownerId,
        readyAt: null,
      },
      data: {
        url: uploaded.url,
        pathname: uploaded.pathname,
        contentType: uploaded.contentType,
        readyAt,
      },
    });
    if (updated.count !== 1) return null;
    return transaction.mediaAsset.findFirst({
      where: {
        id: reservation.id,
        ownerId: reservation.ownerId,
        readyAt: { not: null },
      },
    });
  });
  return record ? { ...record, kind: MEDIA_KIND_SCREENSHOT } : null;
}

async function cleanupFailedUpload(
  reservation: ScreenshotReservation,
  storage: ScreenshotStorage,
) {
  const results = await Promise.allSettled([
    storage.delete(reservation.ownerId, reservation.pathname),
    releaseReservation(reservation.ownerId, reservation.id),
  ]);
  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      console.error("Failed to clean up screenshot upload", result.reason);
    } else if (index === 0 && !result.value) {
      console.error("Failed to delete screenshot blob after upload failure");
    }
  }
}

export async function saveScreenshotUpload(
  ownerId: string,
  file: Blob,
  gameId?: string | null,
  storage: ScreenshotStorage = defaultScreenshotStorage,
): Promise<SaveScreenshotResult> {
  if (
    file.type !== SCREENSHOT_CONTENT_TYPE ||
    file.size <= 0 ||
    file.size > SCREENSHOT_MAX_BYTES
  ) {
    return { status: "invalid" };
  }

  const game = gameId ? await getGame(ownerId, gameId) : null;
  if (gameId && !game) return { status: "invalid" };

  await cleanupExpiredReservations(ownerId, storage);
  const reservationResult = await reserveScreenshot(
    ownerId,
    game?.id ?? null,
    file.size,
  );
  if (reservationResult.status !== "reserved") {
    return { status: reservationResult.status };
  }
  const { reservation } = reservationResult;

  try {
    const uploaded = await storage.put({
      pathname: reservation.pathname,
      body: file,
      contentType: SCREENSHOT_CONTENT_TYPE,
      addRandomSuffix: false,
      allowOverwrite: false,
    });

    if (
      uploaded.pathname !== reservation.pathname ||
      uploaded.contentType !== SCREENSHOT_CONTENT_TYPE ||
      !isOwnedScreenshotPathname(ownerId, uploaded.pathname) ||
      !blobUrlMatchesPathname(uploaded.url, uploaded.pathname)
    ) {
      throw new Error("Screenshot storage returned an invalid blob reference.");
    }

    const stored = await finalizeReservation(reservation, uploaded);
    if (!stored) {
      throw new Error("The screenshot reservation expired before it was saved.");
    }

    return {
      status: "created",
      media: toDto(stored, game?.title ?? null),
    };
  } catch (error) {
    await cleanupFailedUpload(reservation, storage);
    throw error;
  }
}

export async function deleteMedia(ownerId: string, id: string) {
  if (!hasDatabase()) {
    const index = memoryMedia().findIndex(
      (candidate) =>
        candidate.id === id &&
        candidate.ownerId === ownerId &&
        isReady(candidate),
    );
    if (index < 0) return false;
    const [media] = memoryMedia().splice(index, 1);
    await deleteOwnedBlob(media?.url);
    return true;
  }

  const existing = await getPrisma().mediaAsset.findFirst({
    where: { id, ownerId, readyAt: { not: null } },
  });
  if (!existing) return false;

  await getPrisma().mediaAsset.delete({ where: { id } });
  await deleteOwnedBlob(existing.url);
  return true;
}
