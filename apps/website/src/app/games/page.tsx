import type { Metadata } from "next";
import Image from "next/image";

import { listPublicGames } from "@/lib/games";

import { SiteHeader } from "../site-header";
import { GamesCatalog } from "./games-catalog";

import styles from "./games.module.css";

export const metadata: Metadata = {
  title: "Play Games | Splat Lab!",
  description: "Discover and play public games made by kids in Splat Lab.",
};

export const dynamic = "force-dynamic";

export default async function GamesPage() {
  const games = await listPublicGames();

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
      <SiteHeader currentPage="games" />

      <section className={styles.hero} aria-labelledby="games-title">
        <div className={styles.heroCharacter} aria-hidden="true">
          <div className={styles.speechBubble}>
            <svg className={styles.speechBubbleShape} viewBox="0 0 220 174">
              <path d="M110 5C52 5 8 30 8 72C8 106 39 131 84 137L68 166L109 139C168 139 212 113 212 72C212 30 168 5 110 5Z" />
            </svg>
            <div className={styles.speechBubbleCopy}>
              <strong>READY TO PLAY?</strong>
              <span>Pick a game!</span>
              <span className={styles.speechBubbleSmile}>☺</span>
            </div>
          </div>
          <Image
            className={styles.cooper}
            src="/brand/features/cooper-hero.png"
            alt=""
            width={1399}
            height={1124}
            priority
            unoptimized
          />
        </div>

        <div className={styles.heroCopy}>
          <h1 id="games-title">Made in Splat Lab!</h1>
          <p>Explore public Splat Lab creations, then play them right in your browser.</p>
        </div>
      </section>

      <GamesCatalog games={games} />
    </main>
  );
}
