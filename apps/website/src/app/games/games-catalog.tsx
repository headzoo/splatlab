"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import type { PublicGameSummaryDto } from "@/lib/game-contract";
import { playGamePath } from "@/lib/game-routes";
import {
  sortPublicGames,
  type PublicGameSort,
} from "@/lib/public-games";

import styles from "./games.module.css";

type GamesCatalogProps = {
  games: PublicGameSummaryDto[];
};

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function GamesCatalog({ games }: GamesCatalogProps) {
  const [sort, setSort] = useState<PublicGameSort>("newest");
  const sortedGames = useMemo(() => sortPublicGames(games, sort), [games, sort]);

  return (
    <section className={styles.catalog} aria-labelledby="public-games-title">
      <div className={styles.catalogToolbar}>
        <div>
          <span>Made with Splat Lab!</span>
          <h2 id="public-games-title">Public games</h2>
        </div>
        {games.length ? (
          <label className={styles.sortControl}>
            <span>Sort by</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as PublicGameSort)}
            >
              <option value="newest">Newest added</option>
              <option value="oldest">Oldest added</option>
              <option value="alphabetical">Name A–Z</option>
              <option value="recently_updated">Recently updated</option>
            </select>
          </label>
        ) : null}
      </div>

      {sortedGames.length ? (
        <div className={styles.gameGrid}>
          {sortedGames.map((game) => (
            <Link
              className={styles.gameCard}
              href={playGamePath(game.id)}
              key={game.id}
              aria-label={`Play ${game.title}, made by ${game.creator.displayName}`}
            >
              <div className={styles.thumbnail}>
                {game.thumbnailDataUrl ? (
                  <Image
                    src={game.thumbnailDataUrl}
                    alt=""
                    fill
                    sizes="(max-width: 700px) 100vw, (max-width: 1040px) 50vw, 33vw"
                    unoptimized
                  />
                ) : (
                  <div
                    className={`${styles.thumbnailFallback} ${
                      game.gameType === "maze"
                        ? styles.mazeFallback
                        : styles.platformerFallback
                    }`}
                    aria-hidden="true"
                  >
                    <span>{game.gameType === "maze" ? "◆" : "▶"}</span>
                  </div>
                )}
                <span className={styles.gameTypeBadge}>
                  {game.gameType === "maze" ? "Maze" : "Platformer"}
                </span>
              </div>
              <div className={styles.cardBody}>
                <h3>{game.title}</h3>
                <div className={styles.creator}>
                  {game.creator.avatarSrc ? (
                    <Image
                      className={styles.creatorAvatar}
                      src={game.creator.avatarSrc}
                      alt=""
                      width={512}
                      height={512}
                      unoptimized
                    />
                  ) : (
                    <span className={styles.creatorAvatarFallback} aria-hidden="true">
                      🐣
                    </span>
                  )}
                  <span className={styles.creatorName}>
                    <small>Made by</small>
                    <strong>{game.creator.displayName}</strong>
                  </span>
                </div>
                <div className={styles.cardFooter}>
                  <span>Added {DATE_FORMATTER.format(new Date(game.createdAt))}</span>
                  <strong>Play game <span aria-hidden="true">→</span></strong>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <span aria-hidden="true">🎮</span>
          <h3>No public games yet</h3>
          <p>Make something amazing, switch on “Make game public,” and it will show up here.</p>
          <Link href="/lab">Create the first game</Link>
        </div>
      )}
    </section>
  );
}
