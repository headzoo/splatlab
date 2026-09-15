import Link from "next/link";
import { notFound } from "next/navigation";

import { mediaSharePath } from "@/lib/game-routes";
import { isEmbeddablePublicVideo } from "@/lib/media-metadata";
import { getPublicMedia } from "@/lib/media";
import { absoluteSiteUrl } from "@/lib/site-url";

import styles from "./embed.module.css";

export const dynamic = "force-dynamic";

type MediaEmbedPageProps = {
  params: Promise<{ mediaId: string }>;
};

export default async function MediaEmbedPage({ params }: MediaEmbedPageProps) {
  const { mediaId } = await params;
  const media = await getPublicMedia(mediaId);

  if (!isEmbeddablePublicVideo(media)) {
    notFound();
  }

  const title = media.gameTitle ?? "Splat Lab video";
  const shareUrl = absoluteSiteUrl(mediaSharePath(media.id));

  return (
    <main className={styles.embed}>
      <video
        className={styles.player}
        controls
        playsInline
        preload="metadata"
        poster={media.posterUrl}
        title={title}
        aria-label={title}
      >
        <source src={media.url} type={media.contentType} />
        <p>
          Your browser does not support video playback.{" "}
          <a href={shareUrl}>Open the share page</a>.
        </p>
      </video>
      <Link className={styles.shareLink} href={shareUrl}>
        View on Splat Lab!
      </Link>
    </main>
  );
}
