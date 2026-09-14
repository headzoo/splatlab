"use client";

import type { CSSProperties } from "react";

import styles from "./game-loading-overlay.module.css";

type GameLoadingOverlayProps = {
  /** How much of the sprite download is done, from 0 to 1. */
  progress: number;
  /** The level's backdrop colour, which shows before its background arrives. */
  color: string;
  /** The level's furthest background layer, if it has one. */
  imageUrl?: string;
  /** The game's name, shown above the loading bar on the public play page. */
  title?: string;
  label?: string;
  /** Whether the sprites have finished downloading. */
  ready?: boolean;
  /**
   * Starts the game. Given only where the player is expected to press play -
   * the public play page - so the builder's preview still uncovers itself.
   */
  onStart?: () => void;
};

/**
 * Covers the stage until a level's sprites have downloaded.
 *
 * Only the furthest background is shown, because it is the one image the player
 * can see before anything else has arrived, and a bar beats a frozen canvas
 * when a kid is waiting on a slow connection. Once everything has landed the
 * bar becomes the play button, so the wait ends where the player is already
 * looking.
 */
export function GameLoadingOverlay({
  progress,
  color,
  imageUrl,
  title,
  label = "Loading...",
  ready = false,
  onStart,
}: GameLoadingOverlayProps) {
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  const startable = ready && Boolean(onStart);
  const style = {
    backgroundColor: color,
    backgroundImage: imageUrl ? `url("${imageUrl}")` : undefined,
  } as CSSProperties;

  const content = (
    <span className={styles.content}>
      {title ? <span className={styles.title}>{title}</span> : null}
      {startable ? (
        <span className={styles.play} aria-hidden="true">
          ▶ Play
        </span>
      ) : (
        <>
          <span className={styles.label}>{label}</span>
          <span
            className={styles.track}
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <span className={styles.fill} style={{ width: `${percent}%` }} />
          </span>
        </>
      )}
    </span>
  );

  if (startable) {
    return (
      <button
        className={`${styles.overlay} ${styles.startable}`}
        type="button"
        style={style}
        onClick={onStart}
        aria-label={title ? `Play ${title}` : "Play"}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={styles.overlay} style={style}>
      {content}
    </div>
  );
}
