"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

type AuthMode = "start" | "sign-in" | "sign-out";

type AuthFlowContextValue = {
  busy: boolean;
  isSignedIn: boolean;
  markSignedIn: () => void;
  open: (mode: AuthMode) => void;
};

const AuthFlowContext = createContext<AuthFlowContextValue | null>(null);

export function AuthFlowProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);

  const markSignedIn = useCallback(() => setIsSignedIn(true), []);

  const signOut = useCallback(async () => {
    if (busy) {
      return;
    }

    setBusy(true);

    try {
      const result = await authClient.signOut();

      if (result.error) {
        throw new Error(result.error.message);
      }

      setIsSignedIn(false);
      router.push("/");
      router.refresh();
    } catch {
      // Keep the current page and session state when sign-out does not complete.
    } finally {
      setBusy(false);
    }
  }, [busy, router]);

  const open = useCallback(
    (mode: AuthMode) => {
      if (mode === "sign-out") {
        void signOut();
        return;
      }

      router.push(mode === "sign-in" ? "/lab#lab-key-login" : "/lab");
    },
    [router, signOut],
  );

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

  return (
    <AuthFlowContext.Provider
      value={{ busy, isSignedIn, markSignedIn, open }}
    >
      {children}
    </AuthFlowContext.Provider>
  );
}

export function useAuthFlow() {
  const context = useContext(AuthFlowContext);

  if (!context) {
    throw new Error("useAuthFlow must be used inside AuthFlowProvider.");
  }

  return context;
}

export function AuthAction({
  mode,
  className,
  children,
  hideWhenSignedOut = false,
  signedInMode,
  signedInChildren,
}: {
  mode: AuthMode;
  className?: string;
  children: ReactNode;
  hideWhenSignedOut?: boolean;
  signedInMode?: AuthMode;
  signedInChildren?: ReactNode;
}) {
  const context = useAuthFlow();

  if (hideWhenSignedOut && !context.isSignedIn) {
    return null;
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
