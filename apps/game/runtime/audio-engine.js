const CROSSFADE_SECONDS = 0.25;
const CURVE_POINTS = 32;

/** A sin/cos pair keeps summed power constant, so a crossfade has no dip in the middle. */
function fadeCurve(peak, fadeIn) {
  const curve = new Float32Array(CURVE_POINTS);
  for (let index = 0; index < CURVE_POINTS; index += 1) {
    const progress = index / (CURVE_POINTS - 1);
    const shape = fadeIn ? Math.sin(progress * Math.PI * 0.5) : Math.cos(progress * Math.PI * 0.5);
    curve[index] = peak * shape;
  }
  return curve;
}

export class GameAudio {
  constructor(spec, options = {}) {
    this.spec = spec;
    this.context = options.context ?? null;
    this.baseUrl = options.baseUrl ?? document.baseURI;
    this.musicEnabled = options.musicEnabled ?? true;
    this.effectsEnabled = options.effectsEnabled ?? true;
    this.musicLevel = options.musicLevel ?? 0.6;
    this.effectsLevel = options.effectsLevel ?? 0.8;
    this.crossfadeSeconds = options.crossfadeSeconds ?? CROSSFADE_SECONDS;
    this.buffers = new Map();
    this.activeEffects = new Map();
    this.musicVoices = new Map();
    this.musicSource = null;
    this.musicGain = null;
    this.musicCue = null;
  }

  async unlock() {
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    if (!this.context) this.context = new AudioContextClass();
    if (this.context.state === "suspended") await this.context.resume();
    await this.preload();
  }

  async preload() {
    if (!this.context) throw new Error("Unlock audio before preloading the sound pack.");
    const entries = [
      ...Object.values(this.spec.music ?? {}),
      ...Object.values(this.spec.effects ?? {}),
    ].filter(Boolean);
    await Promise.all(entries.map(async (entry) => {
      if (this.buffers.has(entry.path)) return;
      const response = await fetch(new URL(entry.path, this.baseUrl));
      if (!response.ok) throw new Error(`Could not load audio asset ${entry.path}.`);
      const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
      this.buffers.set(entry.path, buffer);
    }));
  }

  // Music loops are seam validated in tools/audio.py, so they repeat inside the
  // audio thread rather than being restarted. Cue changes crossfade so switching
  // to the boss loop does not cut the gameplay loop off mid-bar.
  startMusic(cue = "gameplay") {
    const entry = this.spec.music?.[cue];
    if (!this.context || !entry || !this.musicEnabled) return false;
    if (this.musicCue === cue && this.musicVoices.has(cue)) return true;
    const buffer = this.buffers.get(entry.path);
    if (!buffer) return false;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.loop = entry.loop === true;
    gain.gain.value = 0;
    source.connect(gain).connect(this.context.destination);
    source.addEventListener("ended", () => {
      const voice = this.musicVoices.get(cue);
      if (voice && voice.source === source) this.musicVoices.delete(cue);
      if (this.musicSource === source) {
        this.musicSource = null;
        this.musicGain = null;
        this.musicCue = null;
      }
    });
    source.start();
    for (const otherCue of [...this.musicVoices.keys()]) this.releaseMusicVoice(otherCue);
    this.musicVoices.set(cue, { source, gain });
    this.rampMusic(gain, entry.defaultGain * this.musicLevel, true);
    this.musicSource = source;
    this.musicGain = gain;
    this.musicCue = cue;
    return true;
  }

  stopMusic() {
    for (const cue of [...this.musicVoices.keys()]) this.releaseMusicVoice(cue);
    this.musicSource = null;
    this.musicGain = null;
    this.musicCue = null;
  }

  rampMusic(gain, peak, fadeIn) {
    if (!this.context) return;
    try {
      gain.gain.cancelScheduledValues(this.context.currentTime);
      gain.gain.setValueCurveAtTime(
        fadeCurve(peak, fadeIn),
        this.context.currentTime,
        this.crossfadeSeconds,
      );
    } catch {
      gain.gain.value = fadeIn ? peak : 0;
    }
  }

  releaseMusicVoice(cue) {
    const voice = this.musicVoices.get(cue);
    if (!voice) return;
    this.musicVoices.delete(cue);
    this.rampMusic(voice.gain, voice.gain.gain.value, false);
    try {
      voice.source.stop(this.context.currentTime + this.crossfadeSeconds);
    } catch {
      voice.source.stop();
    }
  }

  play(cue) {
    const entry = this.spec.effects?.[cue];
    if (!this.context || !entry || !this.effectsEnabled) return false;
    const buffer = this.buffers.get(entry.path);
    if (!buffer) return false;
    const active = this.activeEffects.get(cue) ?? new Set();
    if (active.size >= entry.maxVoices) return false;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    gain.gain.value = entry.defaultGain * this.effectsLevel;
    source.connect(gain).connect(this.context.destination);
    active.add(source);
    this.activeEffects.set(cue, active);
    source.addEventListener("ended", () => active.delete(source));
    source.start();
    return true;
  }

  configure(options = {}) {
    if (typeof options.musicEnabled === "boolean") this.musicEnabled = options.musicEnabled;
    if (typeof options.effectsEnabled === "boolean") this.effectsEnabled = options.effectsEnabled;
    if (Number.isFinite(options.musicLevel)) this.musicLevel = Math.max(0, Math.min(1, options.musicLevel));
    if (Number.isFinite(options.effectsLevel)) this.effectsLevel = Math.max(0, Math.min(1, options.effectsLevel));
    if (!this.musicEnabled) this.stopMusic();
    if (this.musicGain) {
      this.musicGain.gain.value = this.spec.music[this.musicCue].defaultGain * this.musicLevel;
    }
  }
}
