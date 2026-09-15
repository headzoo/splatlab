import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";

import {
  deleteOwnedBlob,
  deleteOwnedScreenshotBlob,
  deleteOwnedVideoBlob,
  deleteOwnedVideoPosterBlob,
  putOwnedBlob,
} from "./blob-store";
import {
  blobUrlMatchesPathname,
  isOwnedScreenshotPathname,
  isOwnedVideoPathname,
  isOwnedVideoPosterPathname,
  MAX_SCREENSHOTS_PER_USER,
  SCREENSHOT_MAX_BYTES,
  VIDEO_MAX_DIMENSION,
  VIDEO_MAX_DURATION_MS,
  VIDEO_MIN_DIMENSION,
  VIDEO_MIN_DURATION_MS,
  VIDEO_MAX_PER_USER,
  screenshotBlobPathname,
  videoBlobPathname,
  videoPosterBlobPathname,
} from "./blob-path";
import { getGame, getPublicGame } from "./games";
import {
  MEDIA_KIND_SCREENSHOT,
  MEDIA_KIND_VIDEO,
  VIDEO_MP4_CONTENT_TYPE,
  type MediaAssetDto,
  type PublicMediaDto,
  type ScreenshotMediaAssetDto,
  type VideoMediaAssetDto,
} from "./media-types";
import { getPrisma, hasDatabase } from "./prisma";

export {
  MEDIA_KIND_SCREENSHOT,
  MEDIA_KIND_VIDEO,
  type MediaAssetDto,
  type PublicMediaDto,
  type ScreenshotMediaAssetDto,
  type VideoMediaAssetDto,
} from "./media-types";

const SCREENSHOT_CONTENT_TYPE = "image/png";
const VIDEO_CONTENT_TYPE = VIDEO_MP4_CONTENT_TYPE;
const VIDEO_POSTER_CONTENT_TYPE = "image/png";
const RESERVATION_MAX_AGE_MS = 15 * 60 * 1000;

type MediaKind = typeof MEDIA_KIND_SCREENSHOT | typeof MEDIA_KIND_VIDEO;
type StoredMedia = {
  id: string;
  ownerId: string;
  gameId: string | null;
  kind: MediaKind;
  url: string;
  pathname: string;
  contentType: string;
  byteSize: number;
  posterUrl?: string | null;
  posterPathname?: string | null;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
  quotaSlot?: number | null;
  readyAt?: Date | null;
  createdAt: Date;
};

export type MediaReservation = {
  id: string;
  ownerId: string;
  gameId: string | null;
  kind: MediaKind;
  pathname: string;
  posterPathname: string | null;
  byteSize: number;
  quotaSlot: number;
  createdAt: Date;
};

type MediaReservationResult =
    | { status: "reserved"; reservation: MediaReservation }
  | { status: "limit" }
  | { status: "invalid" };

export type MediaStorage = {
  put: (input: {
    pathname: string;
    body: Blob;
    contentType: string;
    addRandomSuffix: false;
    allowOverwrite: false;
  }) => Promise<{
    url: string;
    pathname: string;
    contentType: string;
  }>;
  delete: (ownerId: string, pathname: string) => Promise<boolean>;
};

/** @deprecated Kept as the stable screenshot storage injection contract. */
export type ScreenshotStorage = MediaStorage;

export const mediaStorage: MediaStorage = {
  put: (input) => putOwnedBlob(input),
  delete: async (ownerId, pathname) => {
    if (isOwnedScreenshotPathname(ownerId, pathname)) {
      return deleteOwnedScreenshotBlob(ownerId, pathname);
    }
    if (isOwnedVideoPathname(ownerId, pathname)) {
      return deleteOwnedVideoBlob(ownerId, pathname);
    }
    if (isOwnedVideoPosterPathname(ownerId, pathname)) {
      return deleteOwnedVideoPosterBlob(ownerId, pathname);
    }
    return false;
  },
};

declare global {
  var splatLabMediaMemory: StoredMedia[] | undefined;
}

export function memoryMedia() {
  globalThis.splatLabMediaMemory ??= [];
  return globalThis.splatLabMediaMemory;
}

export type SaveScreenshotResult =
  | { status: "created"; media: ScreenshotMediaAssetDto }
  | { status: "limit" }
  | { status: "invalid" };

function isReady(media: StoredMedia) {
  return media.readyAt !== null;
}

function toDto(media: StoredMedia, gameTitle: string | null): MediaAssetDto {
  const common = {
    id: media.id,
    gameId: media.gameId,
    gameTitle,
    url: media.url,
    pathname: media.pathname,
    contentType: media.contentType,
    byteSize: media.byteSize,
    createdAt: media.createdAt.toISOString(),
  };
  if (
    media.kind === MEDIA_KIND_VIDEO &&
    media.posterUrl &&
    media.posterPathname &&
    media.durationMs !== null &&
    media.durationMs !== undefined &&
    media.width !== null &&
    media.width !== undefined &&
    media.height !== null &&
    media.height !== undefined
  ) {
    return {
      ...common,
      kind: MEDIA_KIND_VIDEO,
      contentType: VIDEO_CONTENT_TYPE,
      posterUrl: media.posterUrl,
      posterPathname: media.posterPathname,
      durationMs: media.durationMs,
      width: media.width,
      height: media.height,
    };
  }
  return { ...common, kind: MEDIA_KIND_SCREENSHOT };
}

function toPublicDto(
  media: StoredMedia,
  game: { id: string; title: string } | null,
): PublicMediaDto {
  const common = {
    id: media.id,
    url: media.url,
    pathname: media.pathname,
    contentType: media.contentType,
    byteSize: media.byteSize,
    createdAt: media.createdAt.toISOString(),
    gameId: game?.id ?? null,
    gameTitle: game?.title ?? null,
  };
  if (
    media.kind === MEDIA_KIND_VIDEO &&
    media.posterUrl &&
    media.posterPathname &&
    media.durationMs != null &&
    media.width != null &&
    media.height != null
  ) {
    return {
      ...common,
      kind: MEDIA_KIND_VIDEO,
      contentType: VIDEO_CONTENT_TYPE,
      posterUrl: media.posterUrl,
      posterPathname: media.posterPathname,
      durationMs: media.durationMs,
      width: media.width,
      height: media.height,
    };
  }
  return { ...common, kind: MEDIA_KIND_SCREENSHOT };
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
      readyAt: { not: null },
    },
    orderBy: { createdAt: "desc" },
    include: { game: { select: { title: true } } },
  });

  return records.map((record) =>
    toDto(
      record as StoredMedia,
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
    record.readyAt === null
  ) {
    return null;
  }
  return toPublicDto(
    record as StoredMedia,
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

function maxForKind(kind: MediaKind) {
  return kind === MEDIA_KIND_SCREENSHOT
    ? MAX_SCREENSHOTS_PER_USER
    : VIDEO_MAX_PER_USER;
}

function availableQuotaSlot(
  slots: Array<number | null | undefined>,
  kind: MediaKind,
) {
  const occupied = new Set(
    slots.filter((slot): slot is number => typeof slot === "number"),
  );
  for (let slot = 0; slot < maxForKind(kind); slot += 1) {
    if (!occupied.has(slot)) return slot;
  }
  return null;
}

async function cleanupExpiredReservations(ownerId: string, storage: MediaStorage) {
  const expiresBefore = new Date(Date.now() - RESERVATION_MAX_AGE_MS);
  let pathnames: string[];

  if (!hasDatabase()) {
    pathnames = [];
    for (let index = memoryMedia().length - 1; index >= 0; index -= 1) {
      const media = memoryMedia()[index];
      if (
        media?.ownerId === ownerId &&
        media.readyAt === null &&
        media.createdAt < expiresBefore
      ) {
        pathnames.push(
          media.pathname,
          ...(media.posterPathname ? [media.posterPathname] : []),
        );
        memoryMedia().splice(index, 1);
      }
    }
  } else {
    pathnames = (
      await getPrisma().$queryRaw<
        Array<{ pathname: string; posterPathname: string | null }>
      >`
        DELETE FROM "media_asset"
        WHERE "owner_id" = ${ownerId}
          AND "ready_at" IS NULL
          AND "created_at" < ${expiresBefore}
        RETURNING "pathname", "poster_pathname" AS "posterPathname"
      `
    ).flatMap((record) =>
      record.posterPathname
        ? [record.pathname, record.posterPathname]
        : [record.pathname],
    );
  }

  await Promise.all(
    pathnames.map((pathname) => storage.delete(ownerId, pathname)),
  );
}

async function reserveMedia(
  ownerId: string,
  gameId: string | null,
  byteSize: number,
  kind: MediaKind,
): Promise<MediaReservationResult> {
  const now = new Date();

  if (!hasDatabase()) {
    const owned = memoryMedia().filter(
      (media) =>
        media.ownerId === ownerId && media.kind === kind,
    );
    if (owned.length >= maxForKind(kind)) return { status: "limit" };

    const quotaSlot = availableQuotaSlot(owned.map((media) => media.quotaSlot), kind);
    if (quotaSlot === null) return { status: "limit" };

    const id = randomUUID();
    const pathname =
      kind === MEDIA_KIND_SCREENSHOT
        ? screenshotBlobPathname(ownerId, id)
        : videoBlobPathname(ownerId, id);
    const posterPathname =
      kind === MEDIA_KIND_VIDEO ? videoPosterBlobPathname(ownerId, id) : null;
    memoryMedia().push({
      id,
      ownerId,
      gameId,
      kind,
      url: `pending://${kind}/${id}`,
      pathname,
      contentType: kind === MEDIA_KIND_SCREENSHOT ? SCREENSHOT_CONTENT_TYPE : VIDEO_CONTENT_TYPE,
      byteSize,
      posterPathname,
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
        kind,
        pathname,
        posterPathname,
        byteSize,
        quotaSlot,
        createdAt: now,
      },
    };
  }

  const prisma = getPrisma();
  for (let attempt = 0; attempt < maxForKind(kind); attempt += 1) {
    const occupied = await prisma.mediaAsset.findMany({
      where: { ownerId, kind },
      select: { quotaSlot: true },
    });
    const quotaSlot = availableQuotaSlot(
      occupied.map((record) => record.quotaSlot), kind,
    );
    if (quotaSlot === null) return { status: "limit" };

    const id = randomUUID();
    const pathname =
      kind === MEDIA_KIND_SCREENSHOT
        ? screenshotBlobPathname(ownerId, id)
        : videoBlobPathname(ownerId, id);
    const posterPathname =
      kind === MEDIA_KIND_VIDEO ? videoPosterBlobPathname(ownerId, id) : null;

    try {
      // The owner/kind/slot unique index makes this insert the atomic quota
      // reservation. A concurrent claimant gets P2002 and retries another slot.
      const reservation = await prisma.mediaAsset.create({
        data: {
          id,
          ownerId,
          gameId,
          gameOwnerId: gameId ? ownerId : null,
          kind,
          url: `pending://${kind}/${id}`,
          pathname,
          contentType: kind === MEDIA_KIND_SCREENSHOT ? SCREENSHOT_CONTENT_TYPE : VIDEO_CONTENT_TYPE,
          byteSize,
          posterPathname,
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
          kind,
          pathname: reservation.pathname,
          posterPathname: reservation.posterPathname,
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

async function finalizeScreenshotReservation(
  reservation: MediaReservation,
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
  return record as StoredMedia | null;
}

async function cleanupFailedUpload(
  reservation: MediaReservation,
  storage: MediaStorage,
) {
  const pathnames = [reservation.pathname, reservation.posterPathname].filter(
    (pathname): pathname is string => Boolean(pathname),
  );
  const results = await Promise.allSettled([
    ...pathnames.map((pathname) => storage.delete(reservation.ownerId, pathname)),
    releaseReservation(reservation.ownerId, reservation.id),
  ]);
  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      console.error("Failed to clean up screenshot upload", result.reason);
    } else if (index < pathnames.length && !result.value) {
      console.error("Failed to delete media blob after upload failure");
    }
  }
}

export async function saveScreenshotUpload(
  ownerId: string,
  file: Blob,
  gameId?: string | null,
  storage: ScreenshotStorage = mediaStorage,
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
  const reservationResult = await reserveMedia(
    ownerId,
    game?.id ?? null,
    file.size,
    MEDIA_KIND_SCREENSHOT,
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

    const stored = await finalizeScreenshotReservation(reservation, uploaded);
    if (!stored) {
      throw new Error("The screenshot reservation expired before it was saved.");
    }

    return {
      status: "created",
      media: toDto(
        stored,
        game?.title ?? null,
      ) as ScreenshotMediaAssetDto,
    };
  } catch (error) {
    await cleanupFailedUpload(reservation, storage);
    throw error;
  }
}

export type VideoReservation = MediaReservation & {
  kind: typeof MEDIA_KIND_VIDEO;
  posterPathname: string;
};

export type VideoReservationResult =
  | { status: "reserved"; reservation: VideoReservation }
  | { status: "limit" }
  | { status: "invalid" };

export type VideoFinalization = {
  video: { url: string; pathname: string; contentType: string; byteSize: number };
  poster: { url: string; pathname: string; contentType: string };
  durationMs: number;
  width: number;
  height: number;
};

function isValidVideoFinalization(
  reservation: VideoReservation,
  finalized: VideoFinalization,
) {
  return (
    finalized.video.pathname === reservation.pathname &&
    finalized.video.contentType === VIDEO_CONTENT_TYPE &&
    finalized.video.byteSize > 0 &&
    finalized.poster.pathname === reservation.posterPathname &&
    finalized.poster.contentType === VIDEO_POSTER_CONTENT_TYPE &&
    isOwnedVideoPathname(reservation.ownerId, finalized.video.pathname) &&
    isOwnedVideoPosterPathname(reservation.ownerId, finalized.poster.pathname) &&
    blobUrlMatchesPathname(finalized.video.url, finalized.video.pathname) &&
    blobUrlMatchesPathname(finalized.poster.url, finalized.poster.pathname) &&
    Number.isInteger(finalized.durationMs) &&
    finalized.durationMs >= VIDEO_MIN_DURATION_MS &&
    finalized.durationMs <= VIDEO_MAX_DURATION_MS &&
    Number.isInteger(finalized.width) &&
    Number.isInteger(finalized.height) &&
    finalized.width >= VIDEO_MIN_DIMENSION &&
    finalized.width <= VIDEO_MAX_DIMENSION &&
    finalized.height >= VIDEO_MIN_DIMENSION &&
    finalized.height <= VIDEO_MAX_DIMENSION &&
    finalized.width % 2 === 0 &&
    finalized.height % 2 === 0
  );
}

export async function reserveVideoUpload(
  ownerId: string,
  gameId?: string | null,
): Promise<VideoReservationResult> {
  const game = gameId ? await getGame(ownerId, gameId) : null;
  if (gameId && !game) return { status: "invalid" };
  await cleanupExpiredReservations(ownerId, mediaStorage);
  const result = await reserveMedia(
    ownerId,
    game?.id ?? null,
    0,
    MEDIA_KIND_VIDEO,
  );
  return result.status === "reserved"
    ? { status: "reserved", reservation: result.reservation as VideoReservation }
    : result;
}

export async function finalizeVideoUpload(
  reservation: VideoReservation,
  finalized: VideoFinalization,
): Promise<VideoMediaAssetDto | null> {
  if (!isValidVideoFinalization(reservation, finalized)) return null;
  const readyAt = new Date();
  if (!hasDatabase()) {
    const media = memoryMedia().find(
      (candidate) =>
        candidate.id === reservation.id &&
        candidate.ownerId === reservation.ownerId &&
        candidate.kind === MEDIA_KIND_VIDEO &&
        candidate.readyAt === null,
    );
    if (!media) return null;
    Object.assign(media, {
      url: finalized.video.url,
      pathname: finalized.video.pathname,
      contentType: VIDEO_CONTENT_TYPE,
      byteSize: finalized.video.byteSize,
      posterUrl: finalized.poster.url,
      posterPathname: finalized.poster.pathname,
      durationMs: finalized.durationMs,
      width: finalized.width,
      height: finalized.height,
      readyAt,
    });
    return toDto(media, await resolveOwnedGameTitle(media.ownerId, media.gameId)) as VideoMediaAssetDto;
  }
  const record = await getPrisma().$transaction(async (transaction) => {
    const updated = await transaction.mediaAsset.updateMany({
      where: { id: reservation.id, ownerId: reservation.ownerId, kind: MEDIA_KIND_VIDEO, readyAt: null },
      data: {
        url: finalized.video.url, pathname: finalized.video.pathname,
        contentType: VIDEO_CONTENT_TYPE, byteSize: finalized.video.byteSize,
        posterUrl: finalized.poster.url, posterPathname: finalized.poster.pathname,
        durationMs: finalized.durationMs, width: finalized.width, height: finalized.height, readyAt,
      },
    });
    return updated.count === 1
      ? transaction.mediaAsset.findFirst({ where: { id: reservation.id, ownerId: reservation.ownerId } })
      : null;
  });
  return record
    ? (toDto(
        record as StoredMedia,
        await resolveOwnedGameTitle(reservation.ownerId, record.gameId),
      ) as VideoMediaAssetDto)
    : null;
}

export async function releaseVideoUpload(
  reservation: VideoReservation,
  storage: MediaStorage = mediaStorage,
) {
  await cleanupFailedUpload(reservation, storage);
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
    await Promise.allSettled([
      deleteOwnedBlob(media?.url),
      ...(media?.kind === MEDIA_KIND_VIDEO ? [deleteOwnedBlob(media.posterUrl)] : []),
    ]);
    return true;
  }

  const existing = await getPrisma().mediaAsset.findFirst({
    where: { id, ownerId, readyAt: { not: null } },
  });
  if (!existing) return false;

  await getPrisma().mediaAsset.delete({ where: { id } });
  await Promise.allSettled([
    deleteOwnedBlob(existing.url),
    ...((existing as StoredMedia).kind === MEDIA_KIND_VIDEO
      ? [deleteOwnedBlob(existing.posterUrl)]
      : []),
  ]);
  return true;
}
