"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";

import type { SavedGameSummaryDto } from "@/lib/game-contract";
import { buildGamePath, playGamePath } from "@/lib/game-routes";
import type { MediaAssetDto } from "@/lib/media-types";

import { useAuthFlow } from "../auth-flow";
import { SiteHeader } from "../site-header";
import { resetLabWorkspaceStore, useLabWorkspace } from "./lab-workspace";
import { MediaLibrary } from "./media-library";

import styles from "./workspace.module.css";

const LAB_KEY_EXAMPLE = "482917-063541-829304-771625-038451";

type IssuedKey = {
  labKey: string;
  replaced: boolean;
  keyVersion: number;
};

function getErrorMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  return fallback;
}

export function WorkspaceClient() {
  const router = useRouter();
  const { markSignedIn } = useAuthFlow();
  const {
    workspace,
    games,
    media,
    initializing,
    refreshing,
    error: workspaceError,
    ensureReady,
    refresh,
    patchGames,
    patchMedia,
    patchWorkspace,
    setError: setWorkspaceError,
  } = useLabWorkspace();
  const replaceDialogRef = useRef<HTMLDialogElement>(null);
  const signOutDialogRef = useRef<HTMLDialogElement>(null);
  const keyDialogRef = useRef<HTMLDialogElement>(null);
  const [issuedKey, setIssuedKey] = useState<IssuedKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [deletingGameId, setDeletingGameId] = useState<string | null>(null);
  const [deletingMediaId, setDeletingMediaId] = useState<string | null>(null);
  const [labKey, setLabKey] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    let active = true;

    void ensureReady().then((ready) => {
      if (active && ready) {
        markSignedIn();
      }
    });

    return () => {
      active = false;
    };
  }, [ensureReady, markSignedIn]);

  useEffect(() => {
    if (issuedKey) {
      keyDialogRef.current?.showModal();
    }
  }, [issuedKey]);

  async function issueLabKey() {
    setBusy(true);
    setError("");
    setWorkspaceError("");
    replaceDialogRef.current?.close();

    try {
      const response = await fetch("/api/auth/lab-key/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          getErrorMessage(payload, "We couldn't make a Lab Key yet."),
        );
      }

      const nextKey = payload as IssuedKey;
      patchWorkspace((current) =>
        current
          ? { ...current, hasLabKey: true, keyVersion: nextKey.keyVersion }
          : current,
      );
      setCopied(false);
      setIssuedKey(nextKey);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn't make a Lab Key yet.",
      );
    } finally {
      setBusy(false);
    }
  }

  function requestLabKey() {
    if (workspace?.hasLabKey) {
      replaceDialogRef.current?.showModal();
      return;
    }

    void issueLabKey();
  }

  async function copyLabKey() {
    if (!issuedKey) {
      return;
    }

    try {
      await navigator.clipboard.writeText(issuedKey.labKey);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function finishSavingKey() {
    keyDialogRef.current?.close();
    setIssuedKey(null);
    setCopied(false);
  }

  async function signOutEverywhere() {
    setSignOutBusy(true);
    setError("");
    setWorkspaceError("");
    signOutDialogRef.current?.close();

    try {
      const response = await fetch(
        "/api/auth/lab-sessions/sign-out-everywhere",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          getErrorMessage(
            payload,
            "We couldn't sign every device out yet. Please try again.",
          ),
        );
      }

      resetLabWorkspaceStore();
      router.replace("/");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn't sign every device out yet. Please try again.",
      );
      setSignOutBusy(false);
    }
  }

  async function submitLabKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginBusy(true);
    setLoginError("");

    try {
      const response = await fetch("/api/auth/sign-in/lab-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labKey }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setLoginError(
          getErrorMessage(
            payload,
            "That Lab Key didn't work. Check it and try again.",
          ),
        );
        return;
      }

      resetLabWorkspaceStore();
      await refresh();
      setLabKey("");
      setError("");
      setWorkspaceError("");
      markSignedIn();
      router.replace("/lab");
    } catch {
      setLoginError("We couldn't check that Lab Key. Please try again.");
    } finally {
      setLoginBusy(false);
    }
  }

  async function removeGame(game: SavedGameSummaryDto) {
    if (!window.confirm(`Delete “${game.title}”? This cannot be undone.`)) return;

    setDeletingGameId(game.id);
    setError("");
    setWorkspaceError("");

    try {
      const response = await fetch(`/api/games/${encodeURIComponent(game.id)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        throw new Error(getErrorMessage(payload, "We couldn't delete that game."));
      }

      patchGames((current) => current?.filter((candidate) => candidate.id !== game.id) ?? []);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "We couldn't delete that game.",
      );
    } finally {
      setDeletingGameId(null);
    }
  }

  async function removeMedia(item: MediaAssetDto) {
    setDeletingMediaId(item.id);
    setError("");
    setWorkspaceError("");

    try {
      const response = await fetch(
        `/api/media/${encodeURIComponent(item.id)}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        throw new Error(
          getErrorMessage(payload, "We couldn't delete that media."),
        );
      }

      patchMedia((current) =>
        current?.filter((candidate) => candidate.id !== item.id) ?? [],
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "We couldn't delete that media.",
      );
      throw caught;
    } finally {
      setDeletingMediaId(null);
    }
  }

  const pageError = error || workspaceError;

  return (
    <div className={styles.page}>
      <SiteHeader />

      <main className={styles.main} id="main-content">
        <section className={styles.welcome} aria-labelledby="workspace-title">
          <div className={styles.heroCharacter} aria-hidden="true">
            <div className={styles.speechBubble}>
              <svg
                className={styles.speechBubbleShape}
                viewBox="0 0 220 174"
              >
                <path d="M110 5C52 5 8 30 8 72C8 106 39 131 84 137L68 166L109 139C168 139 212 113 212 72C212 30 168 5 110 5Z" />
              </svg>
              <div className={styles.speechBubbleCopy}>
                <strong>WHAT WILL WE</strong>
                <span>invent today?</span>
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

          <div className={styles.welcomeCopy}>
            <span>Your invention table</span>
            <h1 id="workspace-title">My Lab Workspace</h1>
            <p>Your games will live here as you make them.</p>
          </div>
        </section>

        <section className={styles.games} aria-labelledby="games-title">
          <div className={styles.sectionHeading}>
            <div>
              <span>Projects</span>
              <h2 id="games-title">My Games</h2>
            </div>
            <div className={styles.sectionHeadingActions}>
              {refreshing ? (
                <span className={styles.refreshStatus} role="status">
                  Updating…
                </span>
              ) : null}
              <Link
                className={styles.createButton}
                href="/build"
                aria-disabled={!workspace}
                onClick={(event) => {
                  if (!workspace) event.preventDefault();
                }}
              >
                <span aria-hidden="true">+</span> Create a Game
              </Link>
            </div>
          </div>
          <div
            className={`${styles.emptyState} ${games?.length ? styles.savedGamesState : ""}`}
          >
            {games === null ? (
              <div className={styles.emptyMessage} role="status">
                <span className={styles.emptyGlyph} aria-hidden="true">✦</span>
                <h3>Big ideas go here.</h3>
                <p>Loading your games…</p>
              </div>
            ) : games.length === 0 ? (
              <>
                <div className={styles.emptyDoodleLeft} aria-hidden="true">
                  <span>GOOD<br />IDEAS<br />LIVE HERE!</span>
                  <Image
                    src="/brand/features/cooper-hero.png"
                    alt=""
                    width={1399}
                    height={1124}
                    unoptimized
                  />
                </div>
                <div className={styles.emptyMessage}>
                  <span className={styles.emptyGlyph} aria-hidden="true">✦</span>
                  <h3>Big ideas go here.</h3>
                  <p>Your first Splat Lab game will appear in this workspace.</p>
                </div>
                <div className={styles.emptyDoodleRight} aria-hidden="true">
                  <svg className={styles.bulb} viewBox="0 0 72 88">
                    <path d="M36 7c-16 0-28 12-28 27 0 10 5 17 13 23 4 3 6 7 6 11h18c0-4 2-8 6-11 8-6 13-13 13-23C64 19 52 7 36 7Z" />
                    <path d="M28 76h16M30 83h12M25 33c2-6 6-10 12-12M36 67V43M29 37l7 7 7-7M36 0v-7M5 9l-6-6M67 9l6-6M0 34h-9M72 34h9" />
                  </svg>
                  <strong>IMAGINE<br />BUILD<br />PLAY! ☺</strong>
                </div>
              </>
            ) : (
              <div className={styles.gameGrid}>
                {games.map((game) => {
                  const playHref = playGamePath(game.id);

                  return (
                    <article className={styles.gameCard} key={game.id}>
                      <Link
                        className={styles.gameCardTopper}
                        href={playHref}
                        aria-label={`Play ${game.title}`}
                      >
                        {game.thumbnailDataUrl ? (
                          game.thumbnailDataUrl.startsWith("data:") ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={game.thumbnailDataUrl}
                              alt={`Game preview for ${game.title}`}
                            />
                          ) : (
                            <Image
                              src={game.thumbnailDataUrl}
                              alt={`Game preview for ${game.title}`}
                              fill
                              sizes="(max-width: 700px) 100vw, (max-width: 1050px) 50vw, 33vw"
                              unoptimized
                            />
                          )
                        ) : (
                          <span className={styles.gameCardTopperFallback}>
                            <b aria-hidden="true">
                              {game.gameType === "maze" ? "▦" : "🎮"}
                            </b>
                            <small>Preview coming soon</small>
                          </span>
                        )}
                      </Link>
                      <div className={styles.gameCardBody}>
                        <strong>{game.title}</strong>
                        <span className={styles.gameCardMeta}>
                          {game.gameType === "maze" ? "Maze" : "Platformer"}
                          <small>
                            Updated {new Date(game.updatedAt).toLocaleDateString()}
                          </small>
                        </span>
                      </div>
                      <div className={styles.gameCardActions}>
                        <Link
                          className={`${styles.gameCardButton} ${styles.gameCardPlay}`}
                          href={playHref}
                        >
                          Play
                        </Link>
                        <Link
                          className={`${styles.gameCardButton} ${styles.gameCardEdit}`}
                          href={buildGamePath(game.id)}
                        >
                          Edit
                        </Link>
                      </div>
                      <details className={styles.gameMenu}>
                        <summary aria-label={`Open menu for ${game.title}`}>•••</summary>
                        <div>
                          <button
                            type="button"
                            disabled={deletingGameId === game.id}
                            onClick={() => void removeGame(game)}
                          >
                            {deletingGameId === game.id ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      </details>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <MediaLibrary
          items={media}
          deletingId={deletingMediaId}
          refreshing={refreshing}
          onDelete={removeMedia}
        />

        <section className={styles.labKeyPanel} aria-labelledby="lab-key-title">
          <div className={styles.keyCopy}>
            <span>Secret entrance</span>
            <h2 id="lab-key-title">Your Lab Key</h2>
            {workspace?.hasLabKey ? (
              <p>
                Your workspace has a Lab Key. Splat Lab keeps it scrambled and
                cannot show it again.
              </p>
            ) : (
              <p>
                Make a secret Lab Key so you can return to this workspace on
                another device.
              </p>
            )}
          </div>

          <div className={styles.keyAction}>
            {workspace ? (
              <span className={styles.keyStatus}>
                <span className={styles.keyLock} aria-hidden="true">
                  {workspace.hasLabKey ? "▣" : "□"}
                </span>
                {workspace.hasLabKey ? "Lab Key protected" : "No Lab Key yet"}
              </span>
            ) : initializing ? (
              <span className={styles.keyStatus}>Loading…</span>
            ) : (
              <span className={styles.keyStatus}>Unavailable</span>
            )}
            <button
              className={styles.keyButton}
              type="button"
              disabled={!workspace || busy || signOutBusy}
              onClick={requestLabKey}
            >
              {busy
                ? "Making…"
                : workspace?.hasLabKey
                  ? "Make a New Lab Key"
                  : "Make My Lab Key"}
            </button>
            {workspace?.hasLabKey ? (
              <button
                className={styles.signOutEverywhereButton}
                type="button"
                disabled={busy || signOutBusy}
                onClick={() => signOutDialogRef.current?.showModal()}
              >
                {signOutBusy ? "Signing Out…" : "Sign Out Everywhere"}
              </button>
            ) : null}
            <small>Keep your Lab Key private!</small>
          </div>

          <form
            className={styles.keyLogin}
            id="lab-key-login"
            onSubmit={submitLabKey}
          >
            <div className={styles.keyLoginHeading}>
              <span>Already have a key?</span>
              <h3>Open a saved lab</h3>
            </div>
            <label htmlFor="workspace-lab-key">Lab Key</label>
            <input
              id="workspace-lab-key"
              name="labKey"
              value={labKey}
              onChange={(event) => setLabKey(event.target.value.toUpperCase())}
              placeholder={LAB_KEY_EXAMPLE}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              required
              maxLength={96}
              disabled={initializing || loginBusy}
              aria-describedby={loginError ? "workspace-lab-key-error" : undefined}
            />
            {loginError ? (
              <p
                className={styles.keyLoginError}
                id="workspace-lab-key-error"
                role="alert"
              >
                {loginError}
              </p>
            ) : null}
            <button type="submit" disabled={initializing || loginBusy}>
              {loginBusy ? "Opening…" : "Open My Lab"}
            </button>
          </form>
        </section>

        {pageError ? (
          <p className={styles.pageError} role="alert">
            {pageError}
          </p>
        ) : null}
      </main>

      <dialog
        className={styles.confirmDialog}
        ref={replaceDialogRef}
        aria-labelledby="replace-key-title"
      >
        <button
          className={styles.closeButton}
          type="button"
          aria-label="Close"
          onClick={() => replaceDialogRef.current?.close()}
        >
          ×
        </button>
        <span className={styles.dialogKicker}>Heads up!</span>
        <h2 id="replace-key-title">Replace Your Lab Key?</h2>
        <p>
          Your old key and every other signed-in device will stop working right
          away. This device gets a fresh session and stays signed in.
        </p>
        <div className={styles.dialogActions}>
          <button
            className={styles.cancelButton}
            type="button"
            onClick={() => replaceDialogRef.current?.close()}
          >
            Keep Old Key
          </button>
          <button
            className={styles.replaceButton}
            type="button"
            onClick={() => void issueLabKey()}
          >
            Make New Key
          </button>
        </div>
      </dialog>

      <dialog
        className={styles.confirmDialog}
        ref={signOutDialogRef}
        aria-labelledby="sign-out-everywhere-title"
      >
        <button
          className={styles.closeButton}
          type="button"
          aria-label="Close"
          onClick={() => signOutDialogRef.current?.close()}
        >
          ×
        </button>
        <span className={styles.dialogKicker}>Security check</span>
        <h2 id="sign-out-everywhere-title">Sign Out Everywhere?</h2>
        <p>
          Every device using this Lab Workspace—including this one—will be
          signed out. Your Lab Key will still open it again.
        </p>
        <div className={styles.dialogActions}>
          <button
            className={styles.cancelButton}
            type="button"
            onClick={() => signOutDialogRef.current?.close()}
          >
            Stay Signed In
          </button>
          <button
            className={styles.signOutButton}
            type="button"
            disabled={signOutBusy}
            onClick={() => void signOutEverywhere()}
          >
            {signOutBusy ? "Signing Out…" : "Sign Out Everywhere"}
          </button>
        </div>
      </dialog>

      <dialog
        className={styles.keyDialog}
        ref={keyDialogRef}
        aria-labelledby="new-key-title"
        onCancel={(event) => event.preventDefault()}
      >
        <span className={styles.dialogKicker}>
          {issuedKey?.replaced ? "New secret unlocked" : "Secret unlocked"}
        </span>
        <h2 id="new-key-title">
          {issuedKey?.replaced ? "Your New Lab Key" : "Your Lab Key"}
        </h2>
        <p>
          Write it down somewhere safe. After you close this, Splat Lab cannot
          show it again.
        </p>
        <output className={styles.keyOutput}>{issuedKey?.labKey}</output>
        <button
          className={styles.copyButton}
          type="button"
          onClick={() => void copyLabKey()}
        >
          {copied ? "Copied!" : "Copy Lab Key"}
        </button>
        <button
          className={styles.savedButton}
          type="button"
          onClick={finishSavingKey}
        >
          I Saved It
        </button>
      </dialog>
    </div>
  );
}
