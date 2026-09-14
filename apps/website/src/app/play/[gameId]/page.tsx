import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { cache } from "react";

import { GAME_PLAYER_CONTENT } from "@/game/game-player-content";
import { getPublicGame } from "@/lib/games";

import { SiteHeader } from "../../site-header";
import { PublicGamePlayer } from "./public-game-player";

import styles from "./play.module.css";

export const dynamic = "force-dynamic";

type PlayPageProps = {
  params: Promise<{ gameId: string }>;
};

const loadGame = cache(getPublicGame);

export async function generateMetadata({ params }: PlayPageProps): Promise<Metadata> {
  const { gameId } = await params;
  const game = await loadGame(gameId);

  return {
    title: game ? `${game.title} | Splat Lab!` : "Game not found | Splat Lab!",
    description: game
      ? `Play ${game.title}, made with Splat Lab!`
      : "This Splat Lab game could not be found.",
  };
}

export default async function PlayPage({ params }: PlayPageProps) {
  const { gameId } = await params;
  const game = await loadGame(gameId);

  if (!game) notFound();

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
