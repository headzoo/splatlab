import { useCallback, useEffect, useState, type RefObject } from "react";

/** Safari still ships the prefixed Fullscreen API, so both spellings are handled. */
export type FullscreenCapableElement = {
  requestFullscreen?: (options?: FullscreenOptions) => Promise<void>;
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export type FullscreenCapableDocument = {
  fullscreenEnabled?: boolean;
  webkitFullscreenEnabled?: boolean;
  fullscreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
  exitFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => Promise<void> | void;
};

export function fullscreenApiAvailable(
  doc: FullscreenCapableDocument | null | undefined,
): boolean {
  if (!doc) return false;
  const enabled = doc.fullscreenEnabled === true || doc.webkitFullscreenEnabled === true;
  return enabled && (typeof doc.exitFullscreen === "function"
    || typeof doc.webkitExitFullscreen === "function");
}

/** iPhone Safari only lets videos go fullscreen, so plain elements have no request method. */
export function elementSupportsFullscreen(
  element: FullscreenCapableElement | null | undefined,
): boolean {
  if (!element) return false;
  return typeof element.requestFullscreen === "function"
    || typeof element.webkitRequestFullscreen === "function";
}

export function fullscreenElement(
  doc: FullscreenCapableDocument | null | undefined,
): Element | null {
  return doc?.fullscreenElement ?? doc?.webkitFullscreenElement ?? null;
}

export async function requestElementFullscreen(
  element: FullscreenCapableElement | null | undefined,
): Promise<boolean> {
  if (!element) return false;
  try {
    if (typeof element.requestFullscreen === "function") {
      await element.requestFullscreen();
      return true;
    }
    if (typeof element.webkitRequestFullscreen === "function") {
      await element.webkitRequestFullscreen();
      return true;
    }
  } catch {
    // Browsers reject when the gesture is refused; staying windowed is fine.
  }
  return false;
}

export async function exitDocumentFullscreen(
  doc: FullscreenCapableDocument | null | undefined,
): Promise<boolean> {
  if (!doc) return false;
  try {
    if (typeof doc.exitFullscreen === "function") {
      await doc.exitFullscreen();
      return true;
    }
    if (typeof doc.webkitExitFullscreen === "function") {
      await doc.webkitExitFullscreen();
      return true;
    }
  } catch {
    // Same as entering: a refused exit leaves the current state alone.
  }
  return false;
}

export function fullscreenButtonLabel(active: boolean): string {
  return active ? "⤡ Exit full screen" : "⤢ Full screen";
}

export type GameFullscreen = {
  supported: boolean;
  active: boolean;
  toggle: () => Promise<void>;
};

export function useGameFullscreen(ref: RefObject<HTMLElement | null>): GameFullscreen {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const doc = element.ownerDocument;
    // Support is resolved after mount so the server and first client render match.
    setSupported(fullscreenApiAvailable(doc) && elementSupportsFullscreen(element));
    const sync = () => setActive(fullscreenElement(doc) === element);
    sync();
    doc.addEventListener("fullscreenchange", sync);
    doc.addEventListener("webkitfullscreenchange", sync);
    return () => {
      doc.removeEventListener("fullscreenchange", sync);
      doc.removeEventListener("webkitfullscreenchange", sync);
    };
  }, [ref]);

  const toggle = useCallback(async () => {
    const element = ref.current;
    if (!element) return;
    const doc = element.ownerDocument;
    if (fullscreenElement(doc)) await exitDocumentFullscreen(doc);
    else await requestElementFullscreen(element);
  }, [ref]);

  return { supported, active, toggle };
}
