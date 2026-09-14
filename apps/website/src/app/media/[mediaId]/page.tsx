import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getPublicMedia } from "@/lib/media";
import { playGamePath } from "@/lib/game-routes";

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

  return {
    title: media
      ? `${media.gameTitle ?? "Screenshot"} | Splat Lab!`
      : "Image not found | Splat Lab!",
    description: media
      ? media.gameTitle
        ? `A screenshot from ${media.gameTitle}, made with Splat Lab!`
        : "A screenshot saved in Splat Lab!"
      : "This Splat Lab screenshot could not be found.",
  };
}

export default async function MediaSharePage({ params }: MediaPageProps) {
  const { mediaId } = await params;
  const media = await getPublicMedia(mediaId);

  if (!media) notFound();

  const title = media.gameTitle ?? "Splat Lab screenshot";

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
          <span>Shared snapshot</span>
          <h1>{title}</h1>
          <div className={styles.preview}>
            <Image
              src={media.url}
              alt={title}
              fill
              sizes="(max-width: 900px) 100vw, 860px"
              unoptimized
            />
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
