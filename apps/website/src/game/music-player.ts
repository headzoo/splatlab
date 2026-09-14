/**
 * Gapless background music for the game runtimes.
 *
 * `HTMLAudioElement.loop` re-seeks at the loop point and drops frames doing it,
 * so even a perfectly authored loop audibly stutters every pass. An
 * `AudioBufferSourceNode` with `loop = true` repeats inside the audio thread and
 * is sample accurate, which is what the seam-validated packs in `apps/game`
 * expect. Cue changes equal-power crossfade so the boss switch does not cut.
 *
 * Audio never blocks gameplay: a blocked context, a failed fetch, or a decode
 * error leaves the game silent and playable.
 */

export type MusicTrack = {
  url: string;
  volume: number;
};

export type MusicPlayerOptions = {
  createContext?: () => AudioContext | null;
  fetchAudio?: (url: string) => Promise<ArrayBuffer>;
  crossfadeSeconds?: number;
};

type Voice = {
  source: AudioBufferSourceNode;
  gain: GainNode;
};

const DEFAULT_CROSSFADE_SECONDS = 0.25;
const CURVE_POINTS = 32;

function defaultCreateContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextClass =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  return new AudioContextClass();
}

async function defaultFetchAudio(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load music ${url}.`);
  return response.arrayBuffer();
}

/** A sin/cos pair keeps summed power constant, so a crossfade has no dip in the middle. */
function fadeCurve(peak: number, fadeIn: boolean): Float32Array {
  const curve = new Float32Array(CURVE_POINTS);
  for (let index = 0; index < CURVE_POINTS; index += 1) {
    const progress = index / (CURVE_POINTS - 1);
    const shape = fadeIn
      ? Math.sin(progress * Math.PI * 0.5)
      : Math.cos(progress * Math.PI * 0.5);
    curve[index] = peak * shape;
  }
  return curve;
}

export class MusicPlayer<Cue extends string> {
  private readonly tracks: Readonly<Record<Cue, MusicTrack>>;
  private readonly createContext: () => AudioContext | null;
  private readonly fetchAudio: (url: string) => Promise<ArrayBuffer>;
  private readonly crossfadeSeconds: number;

  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<Cue, AudioBuffer>();
  private loading = new Map<Cue, Promise<AudioBuffer | null>>();
  private voices = new Map<Cue, Voice>();
  private activeCue: Cue | null = null;
  private muted = false;
  private disposed = false;

  constructor(tracks: Readonly<Record<Cue, MusicTrack>>, options: MusicPlayerOptions = {}) {
    this.tracks = tracks;
    this.createContext = options.createContext ?? defaultCreateContext;
    this.fetchAudio = options.fetchAudio ?? defaultFetchAudio;
    this.crossfadeSeconds = options.crossfadeSeconds ?? DEFAULT_CROSSFADE_SECONDS;
  }

  get playingCue(): Cue | null {
    return this.activeCue;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 1;
  }

  /**
   * Play `cue`, crossfading from whatever is playing. Safe to call every frame:
   * repeating the active cue is a no-op.
   */
  start(cue: Cue) {
    if (this.disposed || this.activeCue === cue) return;
    this.activeCue = cue;
    void this.play(cue);
  }

  stop() {
    this.activeCue = null;
    for (const cue of [...this.voices.keys()]) this.releaseVoice(cue);
  }

  dispose() {
    this.disposed = true;
    this.stop();
    const context = this.context;
    this.context = null;
    this.master = null;
    this.buffers.clear();
    this.loading.clear();
    try {
      void context?.close();
    } catch {
      // A context that is already closed is fine.
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.disposed) return null;
    if (!this.context) {
      try {
        this.context = this.createContext();
      } catch {
        this.context = null;
      }
      if (!this.context) return null;
      try {
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : 1;
        this.master.connect(this.context.destination);
      } catch {
        this.context = null;
        this.master = null;
        return null;
      }
    }
    if (this.context.state === "suspended") {
      try {
        void this.context.resume();
      } catch {
        // Autoplay policy may still be holding the context; stay silent.
      }
    }
    return this.context;
  }

  private async loadBuffer(cue: Cue): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(cue);
    if (cached) return cached;
    const pending = this.loading.get(cue);
    if (pending) return pending;

    const request = (async () => {
      const context = this.context;
      const track = this.tracks[cue];
      if (!context || !track) return null;
      try {
        const encoded = await this.fetchAudio(track.url);
        const buffer = await context.decodeAudioData(encoded);
        this.buffers.set(cue, buffer);
        return buffer;
      } catch {
        return null;
      } finally {
        this.loading.delete(cue);
      }
    })();

    this.loading.set(cue, request);
    return request;
  }

  private async play(cue: Cue) {
    const context = this.ensureContext();
    if (!context || !this.master) return;
    const buffer = await this.loadBuffer(cue);
    // The cue may have changed while the buffer was in flight.
    if (!buffer || this.disposed || this.activeCue !== cue || this.voices.has(cue)) return;

    const track = this.tracks[cue];
    try {
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(this.master);
      source.start();
      this.voices.set(cue, { source, gain });
      this.ramp(gain, track.volume, true);
    } catch {
      return;
    }

    for (const other of [...this.voices.keys()]) {
      if (other !== cue) this.releaseVoice(other);
    }
  }

  private ramp(gain: GainNode, peak: number, fadeIn: boolean) {
    const context = this.context;
    if (!context) return;
    try {
      gain.gain.cancelScheduledValues(context.currentTime);
      gain.gain.setValueCurveAtTime(
        fadeCurve(peak, fadeIn),
        context.currentTime,
        this.crossfadeSeconds,
      );
    } catch {
      // Some engines reject a curve that overlaps a running one. Jumping to the
      // target is worse than a fade but must never throw into the game loop.
      try {
        gain.gain.value = fadeIn ? peak : 0;
      } catch {
        // Nothing further to do; the voice keeps its current level.
      }
    }
  }

  private releaseVoice(cue: Cue) {
    const voice = this.voices.get(cue);
    if (!voice) return;
    this.voices.delete(cue);
    const context = this.context;
    this.ramp(voice.gain, voice.gain.gain.value || this.tracks[cue]?.volume || 1, false);
    try {
      voice.source.stop((context?.currentTime ?? 0) + this.crossfadeSeconds);
    } catch {
      try {
        voice.source.stop();
      } catch {
        // Already stopped.
      }
    }
  }
}
