"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import {
  DISPLAY_NAME_AVATARS,
  buildDisplayNameOptions,
} from "@/lib/display-name";

import styles from "./display-name-picker.module.css";

type DisplayNamePickerProps = {
  onChosen: (profile: { name: string; image: string }) => void;
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

export function DisplayNamePicker({ onChosen }: DisplayNamePickerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [names, setNames] = useState(() => buildDisplayNameOptions());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  function refreshNames() {
    if (busy) {
      return;
    }

    setError("");
    setNames(buildDisplayNameOptions());
  }

  async function chooseName(name: string, image: string) {
    if (busy) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/auth/display-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, image }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          getErrorMessage(payload, "Pick one of the names on the cards."),
        );
      }

      const saved = payload as { name: string; image: string };
      dialogRef.current?.close();
      onChosen({ name: saved.name, image: saved.image });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn't save that Lab name yet.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      className={styles.dialog}
      ref={dialogRef}
      aria-labelledby="display-name-title"
      onCancel={(event) => event.preventDefault()}
    >
      <span className={styles.kicker}>Welcome to the Lab</span>
      <h2 id="display-name-title">Pick your Lab name</h2>
      <p>This name stays with your Lab Key.</p>

      <div className={styles.grid} aria-label="Choose a Lab name">
        {DISPLAY_NAME_AVATARS.map((avatar, index) => {
          const name = names[index];

          if (!name) {
            return null;
          }

          return (
            <button
              className={styles.card}
              key={avatar.id}
              type="button"
              disabled={busy}
              onClick={() => void chooseName(name, avatar.id)}
            >
              <Image
                src={avatar.src}
                alt=""
                width={512}
                height={512}
                unoptimized
              />
              <strong>{name}</strong>
            </button>
          );
        })}
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <button
        className={styles.refresh}
        type="button"
        disabled={busy}
        onClick={refreshNames}
      >
        New names
      </button>
    </dialog>
  );
}
