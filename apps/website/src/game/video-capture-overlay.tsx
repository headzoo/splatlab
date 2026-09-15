"use client";

import type { VideoCaptureState } from "./canvas-video-capture";
import styles from "./video-capture-overlay.module.css";

type VideoCaptureOverlayProps = {
  state: VideoCaptureState;
  onStop: () => void;
  onDismiss: () => void;
};

export function VideoCaptureOverlay({
  state,
  onStop,
  onDismiss,
}: VideoCaptureOverlayProps) {
  if (state.phase === "idle") return null;
  if (state.phase === "countdown") {
    return (
      <div className={styles.countdown} aria-live="assertive" aria-atomic="true">
        <span>{state.countdown}</span>
        <p>{state.message}</p>
      </div>
    );
  }
  if (state.phase === "recording") {
    return (
      <div className={styles.recording} aria-live="polite">
        <strong>● Recording · {state.secondsRemaining ?? 0}s</strong>
        <button type="button" onClick={onStop}>Stop video</button>
      </div>
    );
  }
  return (
    <div className={styles.feedback} role={state.phase === "error" ? "alert" : "status"} aria-live="polite">
      <span>{state.message}</span>
      {state.phase !== "saving" ? (
        <button type="button" onClick={onDismiss}>Close</button>
      ) : null}
    </div>
  );
}
