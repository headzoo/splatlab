import type { Metadata } from "next";

import { mediaEmbedPath, mediaSharePath } from "@/lib/game-routes";
import {
  MEDIA_KIND_SCREENSHOT,
  MEDIA_KIND_VIDEO,
  type PublicMediaDto,
} from "@/lib/media";

const SITE_NAME = "Splat Lab!";

export function isEmbeddablePublicVideo(
  media: PublicMediaDto | null,
): media is PublicMediaDto & { kind: typeof MEDIA_KIND_VIDEO } {
  return media?.kind === MEDIA_KIND_VIDEO;
}

export function buildPublicMediaMetadata(
  media: PublicMediaDto | null,
  origin: URL,
): Metadata {
  const metadataBase = origin;

  if (!media) {
    return {
      metadataBase,
      title: `Media not found | ${SITE_NAME}`,
      description: "This Splat Lab media could not be found.",
    };
  }

  const canonicalUrl = new URL(mediaSharePath(media.id), origin).href;

  if (media.kind === MEDIA_KIND_SCREENSHOT) {
    return buildScreenshotMetadata(media, origin, canonicalUrl);
  }

  if (media.kind === MEDIA_KIND_VIDEO) {
    return buildVideoMetadata(media, origin, canonicalUrl);
  }

  return {
    metadataBase,
    title: `Media not found | ${SITE_NAME}`,
    description: "This Splat Lab media could not be found.",
  };
}

function buildScreenshotMetadata(
  media: PublicMediaDto & { kind: typeof MEDIA_KIND_SCREENSHOT },
  origin: URL,
  canonicalUrl: string,
): Metadata {
  const title = media.gameTitle ?? "Screenshot";
  const description = media.gameTitle
    ? `A screenshot from ${media.gameTitle}, made with ${SITE_NAME}`
    : `A screenshot saved in ${SITE_NAME}`;

  return {
    metadataBase: origin,
    title: `${title} | ${SITE_NAME}`,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      type: "website",
      title,
      description,
      url: canonicalUrl,
      siteName: SITE_NAME,
      images: [
        {
          url: media.url,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [media.url],
    },
  };
}

function buildVideoMetadata(
  media: PublicMediaDto & { kind: typeof MEDIA_KIND_VIDEO },
  origin: URL,
  canonicalUrl: string,
): Metadata {
  const title = media.gameTitle ?? "Video";
  const description = media.gameTitle
    ? `A gameplay video from ${media.gameTitle}, made with ${SITE_NAME}`
    : `A gameplay video saved in ${SITE_NAME}`;
  const embedUrl = new URL(mediaEmbedPath(media.id), origin).href;

  return {
    metadataBase: origin,
    title: `${title} | ${SITE_NAME}`,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      type: "video.other",
      title,
      description,
      url: canonicalUrl,
      siteName: SITE_NAME,
      images: [
        {
          url: media.posterUrl,
          width: media.width,
          height: media.height,
          alt: title,
        },
      ],
      videos: [
        {
          url: media.url,
          secureUrl: media.url,
          type: media.contentType,
          width: media.width,
          height: media.height,
        },
      ],
    },
    twitter: {
      card: "player",
      title,
      description,
      images: [
        {
          url: media.posterUrl,
          width: media.width,
          height: media.height,
          alt: title,
        },
      ],
      players: [
        {
          playerUrl: embedUrl,
          streamUrl: media.url,
          width: media.width,
          height: media.height,
        },
      ],
    },
  };
}
