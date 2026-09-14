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
  label?: string;
};

/**
 * Covers the stage until a level's sprites have downloaded.
 *
 * Only the furthest background is shown, because it is the one image the player
 * can see before anything else has arrived, and a bar beats a frozen canvas
 * when a kid is waiting on a slow connection.
 */
export function GameLoadingOverlay({
  progress,
  color,
  imageUrl,
  label = "Loading...",
}: GameLoadingOverlayProps) {
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);

  return (
    <div
      className={styles.overlay}
      style={
        {
          backgroundColor: color,
          backgroundImage: imageUrl ? `url("${imageUrl}")` : undefined,
        } as CSSProperties
      }
    >
      <div className={styles.content}>
        <strong className={styles.label}>{label}</strong>
        <div
          className={styles.track}
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className={styles.fill} style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
}
