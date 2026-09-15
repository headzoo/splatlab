"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { downloadBlobFromUrl } from "@/game/canvas-screenshot";
import type { MediaAssetDto } from "@/lib/media-types";

import {
  isVideoMedia,
  mediaCardKindLabel,
  mediaCardThumbnailUrl,
  mediaDeleteConfirmMessage,
  mediaDeleteErrorMessage,
  mediaDialogKicker,
  mediaDialogTitle,
  mediaDownloadErrorMessage,
  mediaDownloadFilename,
  mediaEmptyStateHint,
  mediaOpenAriaLabel,
  mediaPreviewAlt,
  mediaShareErrorMessage,
  mediaShareTitle,
  mediaShareUrl,
} from "./media-library-helpers";

import styles from "./workspace.module.css";

type MediaLibraryProps = {
  items: MediaAssetDto[] | null;
  deletingId: string | null;
  refreshing?: boolean;
  onDelete: (item: MediaAssetDto) => Promise<void>;
};

export function MediaLibrary({
  items,
  deletingId,
  refreshing = false,
  onDelete,
}: MediaLibraryProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
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

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (!selected || !isVideoMedia(selected)) {
      video.pause();
      video.removeAttribute("src");
      video.load();
      return;
    }

    video.pause();
    video.currentTime = 0;
  }, [selected]);

  function resetVideoPlayback() {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.pause();
    video.currentTime = 0;
  }

  function closeViewer() {
    resetVideoPlayback();
    setSelected(null);
    setStatus("");
    setBusy(null);
  }

  async function shareItem(item: MediaAssetDto) {
    const url = mediaShareUrl(window.location.origin, item);
    setBusy("share");
    setStatus("");
    try {
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({
            title: mediaShareTitle(item),
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
      setStatus(mediaShareErrorMessage(item));
    } finally {
      setBusy(null);
    }
  }

  async function copyShareLink(item: MediaAssetDto) {
    const url = mediaShareUrl(window.location.origin, item);
    setBusy("share");
    setStatus("");
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Link copied!");
    } catch {
      setStatus(mediaShareErrorMessage(item));
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
        mediaDownloadFilename(item, new Date(item.createdAt)),
      );
    } catch {
      setStatus(mediaDownloadErrorMessage(item));
    } finally {
      setBusy(null);
    }
  }

  const selectedShareUrl = selected
    ? mediaShareUrl(
        typeof window === "undefined" ? "" : window.location.origin,
        selected,
      )
    : "";

  async function deleteItem(item: MediaAssetDto) {
    if (!window.confirm(mediaDeleteConfirmMessage(item))) {
      return;
    }
    setBusy("delete");
    setStatus("");
    try {
      await onDelete(item);
      closeViewer();
    } catch (caught) {
      setStatus(
        caught instanceof Error ? caught.message : mediaDeleteErrorMessage(item),
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
          <span>Captures</span>
          <h2 id="media-title">My Media</h2>
        </div>
        {refreshing ? (
          <span className={styles.refreshStatus} role="status">
            Updating…
          </span>
        ) : null}
      </div>
      <div
        className={`${styles.emptyState} ${items?.length ? styles.savedGamesState : ""}`}
      >
        {items === null ? (
          <div className={styles.emptyMessage} role="status">
            <span className={styles.emptyGlyph} aria-hidden="true">✦</span>
            <h3>Pictures and videos go here.</h3>
            <p>Loading your media…</p>
          </div>
        ) : items.length === 0 ? (
          <div className={styles.emptyMessage}>
            <span className={styles.emptyGlyph} aria-hidden="true">✦</span>
            <h3>No media yet.</h3>
            <p>{mediaEmptyStateHint()}</p>
          </div>
        ) : (
          <div className={styles.gameGrid}>
            {items.map((item) => (
              <article className={styles.gameCard} key={item.id}>
                <button
                  className={`${styles.gameCardTopper} ${styles.mediaCardButton} ${isVideoMedia(item) ? styles.mediaVideoCard : ""}`}
                  type="button"
                  onClick={() => setSelected(item)}
                  aria-label={mediaOpenAriaLabel(item)}
                >
                  <Image
                    src={mediaCardThumbnailUrl(item)}
                    alt=""
                    fill
                    sizes="(max-width: 700px) 100vw, (max-width: 1050px) 50vw, 33vw"
                    unoptimized
                  />
                  {isVideoMedia(item) ? (
                    <span className={styles.mediaPlayBadge} aria-hidden="true">
                      ▶
                    </span>
                  ) : null}
                </button>
                <div className={styles.gameCardBody}>
                  <strong>{mediaDialogTitle(item)}</strong>
                  <span className={styles.gameCardMeta}>
                    {mediaCardKindLabel(item)}
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
            <span className={styles.dialogKicker}>{mediaDialogKicker(selected)}</span>
            <h2 id="media-viewer-title">{mediaDialogTitle(selected)}</h2>
            <div
              className={`${styles.mediaPreview} ${isVideoMedia(selected) ? styles.mediaVideoPreview : ""}`}
            >
              {isVideoMedia(selected) ? (
                <video
                  ref={videoRef}
                  className={styles.mediaVideoPlayer}
                  controls
                  playsInline
                  preload="metadata"
                  poster={selected.posterUrl}
                >
                  <source src={selected.url} type={selected.contentType} />
                  Your browser does not support video playback.
                </video>
              ) : (
                <Image
                  src={selected.url}
                  alt={mediaPreviewAlt(selected)}
                  fill
                  sizes="860px"
                  unoptimized
                />
              )}
            </div>
            {selectedShareUrl ? (
              <p className={styles.mediaShareLink}>
                Share link:{" "}
                <a href={selectedShareUrl}>{selectedShareUrl}</a>
              </p>
            ) : null}
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
                className={styles.mediaCopyShareLink}
                type="button"
                disabled={busy !== null}
                onClick={() => void copyShareLink(selected)}
              >
                Copy share link
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
