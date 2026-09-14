"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import {
  buildScreenshotFilename,
  downloadBlobFromUrl,
} from "@/game/canvas-screenshot";
import type { MediaAssetDto } from "@/lib/media";
import { mediaSharePath } from "@/lib/game-routes";

import styles from "./workspace.module.css";

type MediaLibraryProps = {
  items: MediaAssetDto[] | null;
  deletingId: string | null;
  onDelete: (item: MediaAssetDto) => Promise<void>;
};

export function MediaLibrary({
  items,
  deletingId,
  onDelete,
}: MediaLibraryProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<MediaAssetDto | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<"share" | "download" | "delete" | null>(null);

  useEffect(() => {
    if (selected) {
      dialogRef.current?.showModal();
      return;
    }
    dialogRef.current?.close();
  }, [selected]);

  function closeViewer() {
    setSelected(null);
    setStatus("");
    setBusy(null);
  }

  async function shareItem(item: MediaAssetDto) {
    const url = `${window.location.origin}${mediaSharePath(item.id)}`;
    setBusy("share");
    setStatus("");
    try {
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({
            title: item.gameTitle
              ? `${item.gameTitle} screenshot`
              : "Splat Lab screenshot",
            url,
          });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
        }
      }
      await navigator.clipboard.writeText(url);
      setStatus("Link copied!");
    } catch {
      setStatus("We couldn't share that image.");
    } finally {
      setBusy(null);
    }
  }

  async function downloadItem(item: MediaAssetDto) {
    setBusy("download");
    setStatus("");
    try {
      await downloadBlobFromUrl(
        item.url,
        buildScreenshotFilename(item.gameTitle ?? item.gameId ?? "game"),
      );
    } catch {
      setStatus("We couldn't download that image.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteItem(item: MediaAssetDto) {
    if (!window.confirm("Delete this screenshot? This cannot be undone.")) {
      return;
    }
    setBusy("delete");
    setStatus("");
    try {
      await onDelete(item);
      closeViewer();
    } catch (caught) {
      setStatus(
        caught instanceof Error
          ? caught.message
          : "We couldn't delete that image.",
      );
      setBusy(null);
    }
  }

  return (
    <section
      className={`${styles.games} ${styles.mediaLibrary}`}
      aria-labelledby="media-title"
    >
      <div className={styles.sectionHeading}>
        <div>
          <span>Snapshots</span>
          <h2 id="media-title">My Media</h2>
        </div>
      </div>
      <div
        className={`${styles.emptyState} ${items?.length ? styles.savedGamesState : ""}`}
      >
        {items === null ? (
          <div className={styles.emptyMessage} role="status">
            <span className={styles.emptyGlyph} aria-hidden="true">✦</span>
            <h3>Pictures go here.</h3>
            <p>Loading your screenshots…</p>
          </div>
        ) : items.length === 0 ? (
          <div className={styles.emptyMessage}>
            <span className={styles.emptyGlyph} aria-hidden="true">✦</span>
            <h3>No screenshots yet.</h3>
            <p>Right-click a game and choose Screenshot to save one here.</p>
          </div>
        ) : (
          <div className={styles.gameGrid}>
            {items.map((item) => (
              <article className={styles.gameCard} key={item.id}>
                <button
                  className={`${styles.gameCardTopper} ${styles.mediaCardButton}`}
                  type="button"
                  onClick={() => setSelected(item)}
                  aria-label={`Open screenshot${item.gameTitle ? ` from ${item.gameTitle}` : ""}`}
                >
                  <Image
                    src={item.url}
                    alt=""
                    fill
                    sizes="(max-width: 700px) 100vw, (max-width: 1050px) 50vw, 33vw"
                    unoptimized
                  />
                </button>
                <div className={styles.gameCardBody}>
                  <span className={styles.gameCardIcon} aria-hidden="true">
                    📷
                  </span>
                  <strong>{item.gameTitle ?? "Screenshot"}</strong>
                  <span className={styles.gameCardMeta}>
                    Screenshot
                    <small>
                      Saved {new Date(item.createdAt).toLocaleDateString()}
                    </small>
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <dialog
        className={styles.mediaDialog}
        ref={dialogRef}
        aria-labelledby="media-viewer-title"
        onClose={closeViewer}
      >
        {selected ? (
          <>
            <button
              className={styles.closeButton}
              type="button"
              aria-label="Close"
              onClick={closeViewer}
            >
              ×
            </button>
            <span className={styles.dialogKicker}>Saved snapshot</span>
            <h2 id="media-viewer-title">
              {selected.gameTitle ?? "Screenshot"}
            </h2>
            <div className={styles.mediaPreview}>
              <Image
                src={selected.url}
                alt={
                  selected.gameTitle
                    ? `Screenshot from ${selected.gameTitle}`
                    : "Saved screenshot"
                }
                fill
                sizes="860px"
                unoptimized
              />
            </div>
            <div className={styles.mediaDialogActions}>
              <button
                className={styles.mediaShare}
                type="button"
                disabled={busy !== null}
                onClick={() => void shareItem(selected)}
              >
                {busy === "share" ? "Sharing…" : "Share"}
              </button>
              <button
                className={styles.mediaDownload}
                type="button"
                disabled={busy !== null}
                onClick={() => void downloadItem(selected)}
              >
                {busy === "download" ? "Downloading…" : "Download"}
              </button>
              <button
                className={styles.mediaDelete}
                type="button"
                disabled={busy !== null || deletingId === selected.id}
                onClick={() => void deleteItem(selected)}
              >
                {busy === "delete" || deletingId === selected.id
                  ? "Deleting…"
                  : "Delete"}
              </button>
            </div>
            {status ? (
              <p className={styles.mediaStatus} role="status">
                {status}
              </p>
            ) : null}
          </>
        ) : null}
      </dialog>
    </section>
  );
}
