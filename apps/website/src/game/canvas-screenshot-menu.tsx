"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from "react";

import { uploadLabImage } from "@/lib/blob-upload";
import { createCanvasScreenshotBlob } from "./canvas-screenshot";
import styles from "./canvas-screenshot-menu.module.css";

type CanvasScreenshotMenuProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  savedGameId?: string;
  onUpdateThumbnail?: () => Promise<void>;
};

export type CanvasScreenshotMenuHandle = {
  open: (clientX: number, clientY: number) => void;
};

type MenuPosition = {
  left: number;
  top: number;
};

const MENU_WIDTH = 184;
const MENU_HEIGHT = 116;
const MENU_MARGIN = 8;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

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

export const CanvasScreenshotMenu = forwardRef<
  CanvasScreenshotMenuHandle,
  CanvasScreenshotMenuProps
>(function CanvasScreenshotMenu(
  { canvasRef, savedGameId, onUpdateThumbnail },
  ref,
) {
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const [pendingAction, setPendingAction] = useState<
    "screenshot" | "thumbnail" | null
  >(null);
  const [error, setError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const screenshotButtonRef = useRef<HTMLButtonElement>(null);

  const closeMenu = useCallback(() => {
    setPosition(null);
    setPendingAction(null);
    setError("");
  }, []);

  const openMenu = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const bounds = canvas.getBoundingClientRect();
    const openedFromKeyboard = clientX === 0 && clientY === 0;
    const desiredLeft = openedFromKeyboard
      ? MENU_MARGIN
      : clientX - bounds.left;
    const desiredTop = openedFromKeyboard
      ? MENU_MARGIN
      : clientY - bounds.top;

    setError("");
    setPosition({
      left: clamp(
        desiredLeft,
        MENU_MARGIN,
        bounds.width - MENU_WIDTH - MENU_MARGIN,
      ),
      top: clamp(
        desiredTop,
        MENU_MARGIN,
        bounds.height - MENU_HEIGHT - MENU_MARGIN,
      ),
    });
  }, [canvasRef]);

  useImperativeHandle(ref, () => ({ open: openMenu }), [openMenu]);

  useEffect(() => {
    if (!position) return;
    screenshotButtonRef.current?.focus({ preventScroll: true });

    const dismissFromPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) closeMenu();
    };
    const dismissFromKeyboard = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMenu();
      canvasRef.current?.focus({ preventScroll: true });
    };
    const dismiss = () => closeMenu();

    document.addEventListener("pointerdown", dismissFromPointer, true);
    window.addEventListener("blur", dismiss);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("keydown", dismissFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", dismissFromPointer, true);
      window.removeEventListener("blur", dismiss);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("keydown", dismissFromKeyboard);
    };
  }, [canvasRef, closeMenu, position]);

  const saveScreenshot = async () => {
    const canvas = canvasRef.current;
    if (!canvas || pendingAction) return;

    setPendingAction("screenshot");
    setError("");
    try {
      const blob = await createCanvasScreenshotBlob(canvas);
      const file = new File([blob], "screenshot.png", { type: "image/png" });
      const uploaded = await uploadLabImage(file, "screenshot", savedGameId);
      const response = await fetch("/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: uploaded.url,
          pathname: uploaded.pathname,
          contentType: "image/png",
          byteSize: blob.size,
          gameId: savedGameId ?? null,
        }),
      });

      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        throw new Error(errorMessage(payload, "Could not save this image."));
      }

      closeMenu();
      canvas.focus({ preventScroll: true });
    } catch (caught) {
      setPendingAction(null);
      setError(
        caught instanceof Error ? caught.message : "Could not save this image.",
      );
    }
  };

  const updateThumbnail = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !onUpdateThumbnail || pendingAction) return;

    setPendingAction("thumbnail");
    setError("");
    try {
      await onUpdateThumbnail();
      closeMenu();
      canvas.focus({ preventScroll: true });
    } catch {
      setPendingAction(null);
      setError("Could not update the thumbnail.");
    }
  };

  if (!position) return null;

  return (
    <div
      ref={menuRef}
      className={styles.menu}
      role="menu"
      aria-label="Game actions"
      style={position}
    >
      <button
        ref={screenshotButtonRef}
        type="button"
        role="menuitem"
        disabled={pendingAction !== null}
        onClick={() => void saveScreenshot()}
      >
        {pendingAction === "screenshot" ? "Saving screenshot..." : "Screenshot"}
      </button>
      {onUpdateThumbnail ? (
        <button
          type="button"
          role="menuitem"
          disabled={pendingAction !== null}
          onClick={() => void updateThumbnail()}
        >
          {pendingAction === "thumbnail"
            ? "Updating thumbnail..."
            : "Update thumbnail"}
        </button>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
});
