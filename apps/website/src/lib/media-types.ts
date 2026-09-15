/** Client-safe media kind constants and DTO shapes (no server imports). */

export const MEDIA_KIND_SCREENSHOT = "screenshot";
export const MEDIA_KIND_VIDEO = "video";

export const VIDEO_MP4_CONTENT_TYPE = "video/mp4";

type MediaCommonDto = {
  id: string;
  gameId: string | null;
  gameTitle: string | null;
  url: string;
  pathname: string;
  contentType: string;
  byteSize: number;
  createdAt: string;
};

export type ScreenshotMediaAssetDto = MediaCommonDto & {
  kind: typeof MEDIA_KIND_SCREENSHOT;
};

export type VideoMediaAssetDto = MediaCommonDto & {
  kind: typeof MEDIA_KIND_VIDEO;
  contentType: typeof VIDEO_MP4_CONTENT_TYPE;
  posterUrl: string;
  posterPathname: string;
  durationMs: number;
  width: number;
  height: number;
};

export type MediaAssetDto = ScreenshotMediaAssetDto | VideoMediaAssetDto;

type PublicMediaCommonDto = {
  id: string;
  url: string;
  pathname: string;
  contentType: string;
  byteSize: number;
  createdAt: string;
  gameId: string | null;
  gameTitle: string | null;
};

export type PublicMediaDto =
  | (PublicMediaCommonDto & { kind: typeof MEDIA_KIND_SCREENSHOT })
  | (PublicMediaCommonDto & {
      kind: typeof MEDIA_KIND_VIDEO;
      contentType: typeof VIDEO_MP4_CONTENT_TYPE;
      posterUrl: string;
      posterPathname: string;
      durationMs: number;
      width: number;
      height: number;
    });
