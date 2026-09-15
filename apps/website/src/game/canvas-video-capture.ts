"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import {
  VIDEO_MAX_DURATION_MS,
  VIDEO_MIN_DIMENSION,
  VIDEO_MIN_DURATION_MS,
  VIDEO_SOURCE_MAX_BYTES,
  VIDEO_SUPPORTED_SOURCE_CONTENT_TYPES,
  isVideoUploadWithinRequestLimit,
} from "@/lib/blob-path";
import { createVideoCapturePosterBlob } from "./canvas-screenshot";
import { saveLabVideo } from "@/lib/blob-upload";

export const VIDEO_CAPTURE_SECONDS = 10;
export const VIDEO_CAPTURE_FRAME_RATE = 30;
export const VIDEO_CAPTURE_MAX_WIDTH = 960;
/** Stay below the upload cap even when the browser overshoots videoBitsPerSecond. */
export const VIDEO_CAPTURE_BIT_RATE = Math.floor(
  ((VIDEO_SOURCE_MAX_BYTES * 8) / VIDEO_CAPTURE_SECONDS) * 0.72,
);

export function videoCaptureDimensions(width: number, height: number) {
  const rawWidth = width <= 0 ? VIDEO_MIN_DIMENSION : width;
  const rawHeight = height <= 0 ? VIDEO_MIN_DIMENSION : height;
  const scale = Math.min(1, VIDEO_CAPTURE_MAX_WIDTH / rawWidth);
  const scaledWidth = Math.max(VIDEO_MIN_DIMENSION, Math.round(rawWidth * scale));
  const scaledHeight = Math.max(VIDEO_MIN_DIMENSION, Math.round(rawHeight * scale));

  return {
    width: Math.max(VIDEO_MIN_DIMENSION, Math.floor(scaledWidth / 2) * 2),
    height: Math.max(VIDEO_MIN_DIMENSION, Math.floor(scaledHeight / 2) * 2),
  };
}

export function clampVideoCaptureDurationMs(durationMs: number) {
  return Math.min(
    VIDEO_MAX_DURATION_MS,
    Math.max(VIDEO_MIN_DURATION_MS, Math.round(durationMs)),
  );
}

export type VideoCapturePhase = "idle" | "countdown" | "recording" | "saving" | "success" | "error";
export type VideoCaptureState = {
  phase: VideoCapturePhase;
  countdown: number | null;
  secondsRemaining: number | null;
  message: string;
};

export function selectVideoMimeType(
  isTypeSupported: ((type: string) => boolean) | undefined,
) {
  return VIDEO_SUPPORTED_SOURCE_CONTENT_TYPES.find((type) => isTypeSupported?.(type)) ?? null;
}

export function secondsRemaining(deadline: number, now: number) {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function assembleVideoChunks(chunks: readonly BlobPart[], type: string) {
  return new Blob([...chunks], { type });
}

type RecorderLike = Pick<
  MediaRecorder,
  "state" | "start" | "stop" | "ondataavailable" | "onerror" | "onstop"
>;

export function stopMediaStreamTracks(stream: Pick<MediaStream, "getTracks">) {
  stream.getTracks().forEach((track) => track.stop());
}

export function flushAndStopMediaRecorder(recorder: Pick<MediaRecorder, "state" | "requestData" | "stop">) {
  if (recorder.state === "inactive") return;
  try {
    recorder.requestData();
  } catch {
    // Some browsers omit requestData().
  }
  recorder.stop();
}

/**
 * A stream is already live when this function is called. If recorder creation
 * or synchronous startup fails, it must be stopped before returning the error.
 */
export function startCanvasVideoRecorder(
  stream: MediaStream,
  options: MediaRecorderOptions,
  createRecorder: (stream: MediaStream, options: MediaRecorderOptions) => RecorderLike = (
    source,
    recorderOptions,
  ) => new MediaRecorder(source, recorderOptions),
) {
  try {
    const recorder = createRecorder(stream, options);
    recorder.start(250);
    return recorder;
  } catch (error) {
    stopMediaStreamTracks(stream);
    throw error;
  }
}

export function canCaptureCanvasVideo() {
  return typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function" &&
    selectVideoMimeType(MediaRecorder.isTypeSupported) !== null;
}

type CanvasVideoCaptureOptions = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  savedGameId?: string;
  /** Starts a non-terminal runtime when recording begins after countdown. */
  onCaptureStart: () => void;
  /** Restores only a runtime that was active before the menu opened. */
  onCaptureFailure: () => void;
};

const idleState: VideoCaptureState = {
  phase: "idle",
  countdown: null,
  secondsRemaining: null,
  message: "",
};

export function useCanvasVideoCapture({
  canvasRef,
  savedGameId,
  onCaptureStart,
  onCaptureFailure,
}: CanvasVideoCaptureOptions) {
  const [state, setState] = useState<VideoCaptureState>(idleState);
  const generationRef = useRef(0);
  const countdownTimerRef = useRef<number | null>(null);
  const deadlineTimerRef = useRef<number | null>(null);
  const tickerRef = useRef<number | null>(null);
  const captureFrameRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const stoppingRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (countdownTimerRef.current !== null) window.clearTimeout(countdownTimerRef.current);
    if (deadlineTimerRef.current !== null) window.clearTimeout(deadlineTimerRef.current);
    if (tickerRef.current !== null) window.clearInterval(tickerRef.current);
    if (captureFrameRef.current !== null) window.cancelAnimationFrame(captureFrameRef.current);
    countdownTimerRef.current = null;
    deadlineTimerRef.current = null;
    tickerRef.current = null;
    captureFrameRef.current = null;
  }, []);

  const release = useCallback(() => {
    clearTimers();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    captureCanvasRef.current?.remove();
    captureCanvasRef.current = null;
    chunksRef.current = [];
    stoppingRef.current = false;
  }, [clearTimers]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || stoppingRef.current) return;
    stoppingRef.current = true;
    clearTimers();
    flushAndStopMediaRecorder(recorder);
  }, [clearTimers]);

  const begin = useCallback(() => {
    if (state.phase === "countdown" || state.phase === "recording" || state.phase === "saving") return;
    const canvas = canvasRef.current;
    const mimeType = typeof MediaRecorder === "undefined"
      ? null
      : selectVideoMimeType(MediaRecorder.isTypeSupported);
    if (!canvas || typeof canvas.captureStream !== "function" || !mimeType) {
      // Capability failures happen before recording starts, so only restore a
      // runtime the menu actually interrupted.
      onCaptureFailure();
      setState({
        phase: "error",
        countdown: null,
        secondsRemaining: null,
        message: "Video capture is not supported in this browser. Try a recent Chrome, Edge, or Firefox.",
      });
      return;
    }

    const generation = ++generationRef.current;
    setState({ phase: "countdown", countdown: 3, secondsRemaining: null, message: "Get ready!" });
    const count = (value: number) => {
      if (generation !== generationRef.current) return;
      if (value === 0) {
        let startupStream: MediaStream | null = null;
        try {
          const captureDimensions = videoCaptureDimensions(canvas.width, canvas.height);
          const captureCanvas = document.createElement("canvas");
          captureCanvas.width = captureDimensions.width;
          captureCanvas.height = captureDimensions.height;
          captureCanvas.setAttribute("aria-hidden", "true");
          captureCanvas.style.position = "fixed";
          captureCanvas.style.left = "-10000px";
          captureCanvas.style.top = "0";
          captureCanvas.style.pointerEvents = "none";
          document.body.append(captureCanvas);
          captureCanvasRef.current = captureCanvas;
          const captureContext = captureCanvas.getContext("2d");
          if (!captureContext) {
            throw new Error("Video capture canvas is unavailable.");
          }
          const pumpCaptureFrame = () => {
            if (generation !== generationRef.current) return;
            const recorder = recorderRef.current;
            if (!recorder || recorder.state === "inactive") return;
            captureContext.imageSmoothingEnabled = false;
            captureContext.drawImage(
              canvas,
              0,
              0,
              captureDimensions.width,
              captureDimensions.height,
            );
            captureFrameRef.current = window.requestAnimationFrame(pumpCaptureFrame);
          };
          captureContext.imageSmoothingEnabled = false;
          captureContext.drawImage(
            canvas,
            0,
            0,
            captureDimensions.width,
            captureDimensions.height,
          );
          startupStream = captureCanvas.captureStream(VIDEO_CAPTURE_FRAME_RATE);
          streamRef.current = startupStream;
          const recorder = startCanvasVideoRecorder(startupStream, {
            mimeType,
            videoBitsPerSecond: VIDEO_CAPTURE_BIT_RATE,
          }) as MediaRecorder;
          recorderRef.current = recorder;
          chunksRef.current = [];
          startedAtRef.current = performance.now();
          stoppingRef.current = false;
          pumpCaptureFrame();
          recorder.ondataavailable = (event) => {
            if (generation === generationRef.current && event.data.size > 0) {
              chunksRef.current.push(event.data);
              const bytes = chunksRef.current.reduce((total, chunk) => total + chunk.size, 0);
              if (bytes > VIDEO_SOURCE_MAX_BYTES && recorder.state !== "inactive") {
                stoppingRef.current = true;
                clearTimers();
                flushAndStopMediaRecorder(recorder);
              }
            }
          };
          recorder.onerror = () => {
            if (generation !== generationRef.current) return;
            ++generationRef.current;
            release();
            setState({ phase: "error", countdown: null, secondsRemaining: null, message: "We couldn't record that video. Please try again." });
          };
          recorder.onstop = () => {
            window.setTimeout(() => {
              if (generation !== generationRef.current) return;
              const durationMs = clampVideoCaptureDurationMs(
                performance.now() - startedAtRef.current,
              );
              const video = assembleVideoChunks(chunksRef.current, mimeType);
              const extension = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
              const posterCanvas = canvasRef.current;
              release();
              if (!posterCanvas || video.size === 0) {
                setState({ phase: "error", countdown: null, secondsRemaining: null, message: "We couldn't save that video. Please try again." });
                return;
              }
              setState({ phase: "saving", countdown: null, secondsRemaining: null, message: "Saving video…" });
              void (async () => {
                try {
                  const poster = await createVideoCapturePosterBlob(posterCanvas);
                  if (generation !== generationRef.current) return;
                  const captureDimensions = videoCaptureDimensions(
                    posterCanvas.width,
                    posterCanvas.height,
                  );
                  if (!isVideoUploadWithinRequestLimit(video.size, poster.size)) {
                    throw new Error("This video capture is too large to save. Try a shorter clip.");
                  }
                  await saveLabVideo(
                    new File([video], `game-capture.${extension}`, { type: mimeType }),
                    new File([poster], "game-capture-poster.png", { type: "image/png" }),
                    {
                      gameId: savedGameId,
                      durationMs,
                      width: captureDimensions.width,
                      height: captureDimensions.height,
                    },
                  );
                  if (generation === generationRef.current) {
                    setState({ phase: "success", countdown: null, secondsRemaining: null, message: "Video saved to your media library!" });
                  }
                } catch (caught) {
                  if (generation === generationRef.current) {
                    setState({
                      phase: "error",
                      countdown: null,
                      secondsRemaining: null,
                      message: caught instanceof Error ? caught.message : "We couldn't save that video.",
                    });
                  }
                }
              })();
            }, 0);
          };
          onCaptureStart();
          const deadline = startedAtRef.current + VIDEO_CAPTURE_SECONDS * 1000;
          setState({ phase: "recording", countdown: null, secondsRemaining: VIDEO_CAPTURE_SECONDS, message: "Recording gameplay" });
          tickerRef.current = window.setInterval(() => {
            if (generation === generationRef.current) {
              setState((current) => current.phase === "recording"
                ? { ...current, secondsRemaining: secondsRemaining(deadline, performance.now()) }
                : current);
            }
          }, 250);
          deadlineTimerRef.current = window.setTimeout(stop, VIDEO_CAPTURE_SECONDS * 1000);
        } catch {
          // startCanvasVideoRecorder already stopped a stream whose recorder
          // construction/start failed, so don't issue a redundant second stop.
          if (startupStream && recorderRef.current === null) {
            streamRef.current = null;
          }
          release();
          // Startup failed before recording could begin, so restore only if
          // the menu had interrupted active gameplay.
          onCaptureFailure();
          setState({ phase: "error", countdown: null, secondsRemaining: null, message: "We couldn't start video capture. Please try again." });
        }
        return;
      }
      setState({ phase: "countdown", countdown: value, secondsRemaining: null, message: "Get ready!" });
      countdownTimerRef.current = window.setTimeout(() => count(value - 1), 1000);
    };
    countdownTimerRef.current = window.setTimeout(() => count(2), 1000);
  }, [
    canvasRef,
    onCaptureFailure,
    onCaptureStart,
    release,
    savedGameId,
    state.phase,
    stop,
  ]);

  const dismiss = useCallback(() => {
    if (state.phase === "recording") return;
    ++generationRef.current;
    release();
    setState(idleState);
  }, [release, state.phase]);

  useEffect(() => () => {
    ++generationRef.current;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    release();
  }, [release]);

  return { state, begin, stop, dismiss, supported: canCaptureCanvasVideo() };
}
