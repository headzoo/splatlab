import { randomUUID } from "node:crypto";
import { z } from "zod";

import { deleteOwnedBlob } from "./blob-store";
import {
  blobUrlMatchesPathname,
  isOwnedScreenshotPathname,
  MAX_SCREENSHOTS_PER_USER,
  SCREENSHOT_MAX_BYTES,
} from "./blob-path";
import { getPublicGame } from "./games";
import { getPrisma, hasDatabase } from "./prisma";

export const MEDIA_KIND_SCREENSHOT = "screenshot";

export const mediaUploadInputSchema = z
  .object({
    url: z.string().url().max(2048),
    pathname: z.string().min(1).max(512),
    contentType: z.literal("image/png"),
    byteSize: z.number().int().positive().max(SCREENSHOT_MAX_BYTES),
    gameId: z.string().trim().min(1).max(80).nullable().optional(),
  })
  .strict();

export type MediaUploadInput = z.infer<typeof mediaUploadInputSchema>;

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
  createdAt: Date;
};

declare global {
  var splatLabMediaMemory: StoredMedia[] | undefined;
}

export function memoryMedia() {
  globalThis.splatLabMediaMemory ??= [];
  return globalThis.splatLabMediaMemory;
}

export type CreateScreenshotResult =
  | { status: "created"; media: MediaAssetDto }
  | { status: "limit" }
  | { status: "invalid" };

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
  gameTitle: string | null,
): PublicMediaDto {
  return {
    id: media.id,
    url: media.url,
    createdAt: media.createdAt.toISOString(),
    gameId: media.gameId,
    gameTitle,
  };
}

async function resolveGameTitle(gameId: string | null) {
  if (!gameId) return null;
  const game = await getPublicGame(gameId);
  return game?.title ?? null;
}

async function resolveGameId(gameId: string | null | undefined) {
  if (!gameId) return null;
  const game = await getPublicGame(gameId);
  return game ? game.id : null;
}

export async function listMedia(ownerId: string): Promise<MediaAssetDto[]> {
  if (!hasDatabase()) {
    const items = memoryMedia()
      .filter((media) => media.ownerId === ownerId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    return Promise.all(
      items.map(async (media) => toDto(media, await resolveGameTitle(media.gameId))),
    );
  }

  const records = await getPrisma().mediaAsset.findMany({
    where: { ownerId, kind: MEDIA_KIND_SCREENSHOT },
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
    const media = memoryMedia().find((candidate) => candidate.id === id);
    if (!media) return null;
    return toPublicDto(media, await resolveGameTitle(media.gameId));
  }

  const record = await getPrisma().mediaAsset.findUnique({
    where: { id },
    include: { game: { select: { title: true } } },
  });
  if (!record || record.kind !== MEDIA_KIND_SCREENSHOT) return null;
  return toPublicDto(
    { ...record, kind: MEDIA_KIND_SCREENSHOT },
    record.game?.title ?? null,
  );
}

export async function createScreenshot(
  ownerId: string,
  input: MediaUploadInput,
): Promise<CreateScreenshotResult> {
  if (
    !blobUrlMatchesPathname(input.url, input.pathname) ||
    !isOwnedScreenshotPathname(ownerId, input.pathname)
  ) {
    return { status: "invalid" };
  }

  const gameId = await resolveGameId(input.gameId);
  const now = new Date();

  if (!hasDatabase()) {
    const owned = memoryMedia().filter((media) => media.ownerId === ownerId);
    if (owned.length >= MAX_SCREENSHOTS_PER_USER) return { status: "limit" };
    if (owned.some((media) => media.pathname === input.pathname)) {
      return { status: "invalid" };
    }
    const media: StoredMedia = {
      id: randomUUID(),
      ownerId,
      gameId,
      kind: MEDIA_KIND_SCREENSHOT,
      url: input.url,
      pathname: input.pathname,
      contentType: input.contentType,
      byteSize: input.byteSize,
      createdAt: now,
    };
    memoryMedia().push(media);
    return {
      status: "created",
      media: toDto(media, await resolveGameTitle(gameId)),
    };
  }

  const prisma = getPrisma();
  const count = await prisma.mediaAsset.count({
    where: { ownerId, kind: MEDIA_KIND_SCREENSHOT },
  });
  if (count >= MAX_SCREENSHOTS_PER_USER) return { status: "limit" };

  try {
    const record = await prisma.mediaAsset.create({
      data: {
        ownerId,
        gameId,
        kind: MEDIA_KIND_SCREENSHOT,
        url: input.url,
        pathname: input.pathname,
        contentType: input.contentType,
        byteSize: input.byteSize,
      },
      include: { game: { select: { title: true } } },
    });
    return {
      status: "created",
      media: toDto(
        { ...record, kind: MEDIA_KIND_SCREENSHOT },
        record.game?.title ?? null,
      ),
    };
  } catch {
    return { status: "invalid" };
  }
}

export async function deleteMedia(ownerId: string, id: string) {
  if (!hasDatabase()) {
    const index = memoryMedia().findIndex(
      (candidate) => candidate.id === id && candidate.ownerId === ownerId,
    );
    if (index < 0) return false;
    const [media] = memoryMedia().splice(index, 1);
    await deleteOwnedBlob(media?.url);
    return true;
  }

  const existing = await getPrisma().mediaAsset.findFirst({
    where: { id, ownerId },
  });
  if (!existing) return false;

  await getPrisma().mediaAsset.delete({ where: { id } });
  await deleteOwnedBlob(existing.url);
  return true;
}
