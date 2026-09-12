"use client";

import {
  createContext,
  type FormEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

import styles from "./auth-flow.module.css";

type AuthMode = "start" | "sign-in" | "sign-out";
const LAB_KEY_EXAMPLE = "TACO-MOON-FROG-82";

type AuthFlowContextValue = {
  busy: boolean;
  isSignedIn: boolean;
  open: (mode: AuthMode) => void;
};

const AuthFlowContext = createContext<AuthFlowContextValue | null>(null);

function errorMessage(payload: unknown, fallback: string) {
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

export function AuthFlowProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [labKey, setLabKey] = useState("");
  const [error, setError] = useState("");

  const openSignIn = useCallback(() => {
    dialogRef.current?.showModal();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const startMaking = useCallback(async () => {
    if (busy) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const current = await authClient.getSession();

      if (!current.data) {
        const created = await authClient.signIn.anonymous();

        if (created.error) {
          throw new Error(created.error.message);
        }

        const workspaceResponse = await fetch(
          "/api/auth/lab-workspace/ensure",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          },
        );

        if (!workspaceResponse.ok) {
          throw new Error("We couldn't open your Lab Workspace.");
        }
      }

      setIsSignedIn(true);
      dialogRef.current?.close();
      router.push("/lab");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn't open your Lab Workspace.",
      );
      openSignIn();
    } finally {
      setBusy(false);
    }
  }, [busy, openSignIn, router]);

  const signOut = useCallback(async () => {
    if (busy) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const result = await authClient.signOut();

      if (result.error) {
        throw new Error(result.error.message);
      }

      dialogRef.current?.close();
      setIsSignedIn(false);
      setLabKey("");
      router.push("/");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "We couldn't sign you out.",
      );
      openSignIn();
    } finally {
      setBusy(false);
    }
  }, [busy, openSignIn, router]);

  const open = useCallback(
    (mode: AuthMode) => {
      if (mode === "start") {
        void startMaking();
        return;
      }

      if (mode === "sign-out") {
        void signOut();
        return;
      }

      setError("");
      openSignIn();
    },
    [openSignIn, signOut, startMaking],
  );

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("lab-key") === "1") {
      openSignIn();
    }
  }, [openSignIn]);

  useEffect(() => {
    let active = true;

    void authClient.getSession().then((current) => {
      if (active) {
        setIsSignedIn(Boolean(current.data));
      }
    });

    return () => {
      active = false;
    };
  }, []);

  async function submitLabKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/auth/sign-in/lab-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labKey }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(
          errorMessage(
            payload,
            "That Lab Key didn't work. Check it and try again.",
          ),
        );
        return;
      }

      dialogRef.current?.close();
      setIsSignedIn(true);
      setLabKey("");
      router.push("/lab");
      router.refresh();
    } catch {
      setError("We couldn't check that Lab Key. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function closeDialog() {
    dialogRef.current?.close();
    setError("");
  }

  return (
    <AuthFlowContext.Provider value={{ busy, isSignedIn, open }}>
      {children}
      <dialog
        className={styles.dialog}
        ref={dialogRef}
        aria-labelledby="lab-key-sign-in-title"
        onClose={() => setError("")}
      >
        <button
          className={styles.closeButton}
          type="button"
          aria-label="Close"
          onClick={closeDialog}
        >
          ×
        </button>

        <button
          className={`${styles.primaryButton} ${styles.startBuildingButton}`}
          type="button"
          disabled={busy}
          onClick={() => void startMaking()}
        >
          {busy ? "Starting…" : "Start building!"}
        </button>

        <div className={styles.dialogHeading}>
          <h2 id="lab-key-sign-in-title">Open your saved lab</h2>
          <p>Enter your secret Lab Key to get back to your games.</p>
        </div>

        <form className={styles.form} onSubmit={submitLabKey}>
          <label htmlFor="lab-key">Lab Key</label>
          <input
            ref={inputRef}
            id="lab-key"
            name="labKey"
            value={labKey}
            onChange={(event) => setLabKey(event.target.value.toUpperCase())}
            placeholder={LAB_KEY_EXAMPLE}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            required
            maxLength={96}
            aria-describedby={error ? "lab-key-error" : undefined}
          />
          {error ? (
            <p className={styles.error} id="lab-key-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className={styles.primaryButton} type="submit" disabled={busy}>
            {busy ? "Opening…" : "Open My Lab"}
          </button>
        </form>
      </dialog>
    </AuthFlowContext.Provider>
  );
}

export function AuthAction({
  mode,
  className,
  children,
  signedInMode,
  signedInChildren,
}: {
  mode: AuthMode;
  className?: string;
  children: ReactNode;
  signedInMode?: AuthMode;
  signedInChildren?: ReactNode;
}) {
  const context = useContext(AuthFlowContext);

  if (!context) {
    throw new Error("AuthAction must be rendered inside AuthFlowProvider.");
  }

  const actionMode =
    context.isSignedIn && signedInMode ? signedInMode : mode;

  return (
    <button
      className={className}
      type="button"
      disabled={context.busy}
      onClick={() => context.open(actionMode)}
    >
      {context.isSignedIn && signedInChildren ? signedInChildren : children}
    </button>
  );
}
