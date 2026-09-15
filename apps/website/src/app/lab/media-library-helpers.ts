import {
  buildScreenshotFilename,
  buildVideoFilename,
} from "@/game/canvas-screenshot";
import { mediaSharePath } from "@/lib/game-routes";
import {
  MEDIA_KIND_VIDEO,
  type MediaAssetDto,
  type ScreenshotMediaAssetDto,
  type VideoMediaAssetDto,
} from "@/lib/media-types";

export function isVideoMedia(item: MediaAssetDto): item is VideoMediaAssetDto {
  return item.kind === MEDIA_KIND_VIDEO;
}

export function isScreenshotMedia(
  item: MediaAssetDto,
): item is ScreenshotMediaAssetDto {
  return !isVideoMedia(item);
}

export function mediaCardThumbnailUrl(item: MediaAssetDto) {
  return isVideoMedia(item) ? item.posterUrl : item.url;
}

export function mediaCardKindLabel(item: MediaAssetDto) {
  return isVideoMedia(item) ? "Video" : "Screenshot";
}

export function mediaOpenAriaLabel(item: MediaAssetDto) {
  const kind = isVideoMedia(item) ? "video" : "screenshot";
  return item.gameTitle
    ? `Open ${kind} from ${item.gameTitle}`
    : `Open ${kind}`;
}

export function mediaDialogKicker(item: MediaAssetDto) {
  return isVideoMedia(item) ? "Saved video" : "Saved snapshot";
}

export function mediaDialogTitle(item: MediaAssetDto) {
  if (item.gameTitle) {
    return item.gameTitle;
  }
  return isVideoMedia(item) ? "Video" : "Screenshot";
}

export function mediaPreviewAlt(item: MediaAssetDto) {
  if (item.gameTitle) {
    return isVideoMedia(item)
      ? `Video from ${item.gameTitle}`
      : `Screenshot from ${item.gameTitle}`;
  }
  return isVideoMedia(item) ? "Saved video" : "Saved screenshot";
}

export function mediaShareTitle(item: MediaAssetDto) {
  if (item.gameTitle) {
    return isVideoMedia(item)
      ? `${item.gameTitle} video`
      : `${item.gameTitle} screenshot`;
  }
  return isVideoMedia(item) ? "Splat Lab video" : "Splat Lab screenshot";
}

export function mediaShareUrl(origin: string, item: MediaAssetDto) {
  return `${origin}${mediaSharePath(item.id)}`;
}

export function mediaDownloadFilename(item: MediaAssetDto, capturedAt = new Date()) {
  const gameLabel = item.gameTitle ?? item.gameId ?? "game";
  return isVideoMedia(item)
    ? buildVideoFilename(gameLabel, capturedAt)
    : buildScreenshotFilename(gameLabel, capturedAt);
}

export function mediaDeleteConfirmMessage(item: MediaAssetDto) {
  return isVideoMedia(item)
    ? "Delete this video? This cannot be undone."
    : "Delete this screenshot? This cannot be undone.";
}

export function mediaShareErrorMessage(item: MediaAssetDto) {
  return isVideoMedia(item)
    ? "We couldn't share that video."
    : "We couldn't share that image.";
}

export function mediaDownloadErrorMessage(item: MediaAssetDto) {
  return isVideoMedia(item)
    ? "We couldn't download that video."
    : "We couldn't download that image.";
}

export function mediaDeleteErrorMessage(item: MediaAssetDto) {
  return isVideoMedia(item)
    ? "We couldn't delete that video."
    : "We couldn't delete that image.";
}

export function mediaEmptyStateHint() {
  return "Right-click a game and choose Screenshot or Video capture to save one here.";
}
