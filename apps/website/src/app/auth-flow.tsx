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
import { hasChosenDisplayName } from "@/lib/display-name";

import { DisplayNamePicker } from "./display-name-picker";
import { prefetchLabWorkspace, resetLabWorkspaceStore } from "./lab/lab-workspace";

type AuthMode = "start" | "sign-in" | "sign-out";

type AuthFlowContextValue = {
  busy: boolean;
  isSignedIn: boolean;
  displayName: string | null;
  image: string | null;
  markSignedIn: () => void;
  open: (mode: AuthMode) => void;
};

const AuthFlowContext = createContext<AuthFlowContextValue | null>(null);

function profileFromUser(user: { name: string; image?: string | null } | null) {
  if (!user || !hasChosenDisplayName(user.name)) {
    return {
      isSignedIn: Boolean(user),
      displayName: null as string | null,
      image: null as string | null,
      needsDisplayName: Boolean(user),
    };
  }

  return {
    isSignedIn: true,
    displayName: user.name,
    image: user.image ?? null,
    needsDisplayName: false,
  };
}

export function AuthFlowProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [needsDisplayName, setNeedsDisplayName] = useState(false);

  const applyProfile = useCallback(
    (user: { name: string; image?: string | null } | null) => {
      const next = profileFromUser(user);
      setIsSignedIn(next.isSignedIn);
      setDisplayName(next.displayName);
      setImage(next.image);
      setNeedsDisplayName(next.needsDisplayName);
    },
    [],
  );

  const refreshProfile = useCallback(async () => {
    const current = await authClient.getSession();
    applyProfile(current.data?.user ?? null);
  }, [applyProfile]);

  const markSignedIn = useCallback(() => {
    setIsSignedIn(true);
    void refreshProfile();
  }, [refreshProfile]);

  const setDisplayProfile = useCallback((name: string, nextImage: string) => {
    setIsSignedIn(true);
    setDisplayName(name);
    setImage(nextImage);
    setNeedsDisplayName(false);
  }, []);

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

      resetLabWorkspaceStore();
      applyProfile(null);
      router.push("/");
      router.refresh();
    } catch {
      // Keep the current page and session state when sign-out does not complete.
    } finally {
      setBusy(false);
    }
  }, [applyProfile, busy, router]);

  const open = useCallback(
    (mode: AuthMode) => {
      if (mode === "sign-out") {
        void signOut();
        return;
      }

      if (mode !== "sign-out") {
        prefetchLabWorkspace();
      }

      router.push(mode === "sign-in" ? "/lab#lab-key-login" : "/lab");
    },
    [router, signOut],
  );

  useEffect(() => {
    let active = true;

    void authClient.getSession().then((current) => {
      if (active) {
        applyProfile(current.data?.user ?? null);
      }
    });

    return () => {
      active = false;
    };
  }, [applyProfile]);

  return (
    <AuthFlowContext.Provider
      value={{ busy, isSignedIn, displayName, image, markSignedIn, open }}
    >
      {children}
      {needsDisplayName ? (
        <DisplayNamePicker
          onChosen={({ name, image: nextImage }) => {
            setDisplayProfile(name, nextImage);
          }}
        />
      ) : null}
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
  signedInLabel,
}: {
  mode: AuthMode;
  className?: string;
  children: ReactNode;
  hideWhenSignedOut?: boolean;
  signedInMode?: AuthMode;
  signedInChildren?: ReactNode;
  signedInLabel?: string;
}) {
  const context = useAuthFlow();

  if (hideWhenSignedOut && !context.isSignedIn) {
    return null;
  }

  const actionMode =
    context.isSignedIn && signedInMode ? signedInMode : mode;
  const showingSignedIn = Boolean(context.isSignedIn && signedInChildren);

  return (
    <button
      className={className}
      type="button"
      disabled={context.busy}
      aria-label={showingSignedIn ? signedInLabel : undefined}
      onClick={() => context.open(actionMode)}
    >
      {showingSignedIn ? signedInChildren : children}
    </button>
  );
}
