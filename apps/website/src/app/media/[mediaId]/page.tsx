import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { playGamePath } from "@/lib/game-routes";
import { buildPublicMediaMetadata } from "@/lib/media-metadata";
import { getPublicMedia, MEDIA_KIND_VIDEO } from "@/lib/media";
import { resolveSiteOrigin } from "@/lib/site-url";

import { SiteHeader } from "../../site-header";

import styles from "./share.module.css";

export const dynamic = "force-dynamic";

type MediaPageProps = {
  params: Promise<{ mediaId: string }>;
};

export async function generateMetadata({
  params,
}: MediaPageProps): Promise<Metadata> {
  const { mediaId } = await params;
  const media = await getPublicMedia(mediaId);

  return buildPublicMediaMetadata(media, resolveSiteOrigin());
}

export default async function MediaSharePage({ params }: MediaPageProps) {
  const { mediaId } = await params;
  const media = await getPublicMedia(mediaId);

  if (!media) notFound();

  const isVideo = media.kind === MEDIA_KIND_VIDEO;
  const title = media.gameTitle ?? (isVideo ? "Splat Lab video" : "Splat Lab screenshot");
  const badge = isVideo ? "Shared video" : "Shared snapshot";

  return (
    <main className={styles.page} id="main-content">
      <Image
        className={styles.pageBackground}
        src="/brand/homepage/hero-background.png"
        alt=""
        fill
        priority
        sizes="100vw"
        unoptimized
      />
      <div className={styles.pageWash} />
      <SiteHeader />

      <section className={styles.shell} aria-label={title}>
        <div className={styles.panel}>
          <span>{badge}</span>
          <h1>{title}</h1>
          <div className={styles.preview}>
            {isVideo ? (
              <video
                className={styles.videoPlayer}
                controls
                playsInline
                preload="metadata"
                poster={media.posterUrl}
                aria-label={title}
              >
                <source src={media.url} type={media.contentType} />
                <p>
                  Your browser does not support video playback.{" "}
                  <a href={media.url}>Download the MP4</a>.
                </p>
              </video>
            ) : (
              <Image
                src={media.url}
                alt={title}
                fill
                sizes="(max-width: 900px) 100vw, 860px"
                unoptimized
              />
            )}
          </div>
          {media.gameId ? (
            <Link className={styles.playLink} href={playGamePath(media.gameId)}>
              Play this game
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}
