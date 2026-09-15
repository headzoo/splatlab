import type { Metadata } from "next";
import Image from "next/image";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";

import { GAME_PLAYER_CONTENT } from "@/game/game-player-content";
import { auth } from "@/lib/auth";
import { getPlayableGame, getPublicGame } from "@/lib/games";

import { SiteHeader } from "../../site-header";
import { PublicGamePlayer } from "./public-game-player";

import styles from "./play.module.css";

export const dynamic = "force-dynamic";

type PlayPageProps = {
  params: Promise<{ gameId: string }>;
};

const loadPublicGame = cache(getPublicGame);

async function loadPlayableGame(gameId: string, viewerId: string | null) {
  const publicGame = await loadPublicGame(gameId);
  if (publicGame) return publicGame;
  if (!viewerId) return null;
  return getPlayableGame(gameId, viewerId);
}

export async function generateMetadata({ params }: PlayPageProps): Promise<Metadata> {
  const { gameId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const game = await loadPlayableGame(gameId, session?.user.id ?? null);

  return {
    title: game ? `${game.title} | Splat Lab!` : "Game not found | Splat Lab!",
    description: game
      ? `Play ${game.title}, made with Splat Lab!`
      : "This Splat Lab game could not be found.",
  };
}

export default async function PlayPage({ params }: PlayPageProps) {
  const { gameId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const game = await loadPlayableGame(gameId, session?.user.id ?? null);

  if (!game) notFound();

  return (
    <main className={styles.page} id="main-content">
      <Image
        className={styles.pageBackground}
        src="/brand/homepage/hero-background-clean.png"
        alt=""
        fill
        priority
        sizes="100vw"
        unoptimized
      />
      <div className={styles.pageWash} />
      <SiteHeader />

      <section className={styles.gameShell} aria-label={game.title}>
        <div className={styles.playerPanel}>
          <PublicGamePlayer
            {...GAME_PLAYER_CONTENT}
            gameId={game.id}
            gameTitle={game.title}
            initialSpec={game.spec}
          />
        </div>
      </section>
    </main>
  );
}
