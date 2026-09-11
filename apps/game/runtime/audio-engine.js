export class GameAudio {
  constructor(spec, options = {}) {
    this.spec = spec;
    this.context = options.context ?? null;
    this.baseUrl = options.baseUrl ?? document.baseURI;
    this.musicEnabled = options.musicEnabled ?? true;
    this.effectsEnabled = options.effectsEnabled ?? true;
    this.musicLevel = options.musicLevel ?? 0.6;
    this.effectsLevel = options.effectsLevel ?? 0.8;
    this.buffers = new Map();
    this.activeEffects = new Map();
    this.musicSource = null;
    this.musicGain = null;
  }

  async unlock() {
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    if (!this.context) this.context = new AudioContextClass();
    if (this.context.state === "suspended") await this.context.resume();
    await this.preload();
  }

  async preload() {
    if (!this.context) throw new Error("Unlock audio before preloading the sound pack.");
    const entries = [this.spec.music?.gameplay, ...Object.values(this.spec.effects ?? {})].filter(Boolean);
    await Promise.all(entries.map(async (entry) => {
      if (this.buffers.has(entry.path)) return;
      const response = await fetch(new URL(entry.path, this.baseUrl));
      if (!response.ok) throw new Error(`Could not load audio asset ${entry.path}.`);
      const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
      this.buffers.set(entry.path, buffer);
    }));
  }

  startMusic() {
    const entry = this.spec.music?.gameplay;
    if (!this.context || !entry || !this.musicEnabled || this.musicSource) return false;
    const buffer = this.buffers.get(entry.path);
    if (!buffer) return false;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.loop = entry.loop === true;
    gain.gain.value = entry.defaultGain * this.musicLevel;
    source.connect(gain).connect(this.context.destination);
    source.addEventListener("ended", () => {
      if (this.musicSource === source) this.musicSource = null;
    });
    source.start();
    this.musicSource = source;
    this.musicGain = gain;
    return true;
  }

  stopMusic() {
    if (!this.musicSource) return;
    this.musicSource.stop();
    this.musicSource = null;
    this.musicGain = null;
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
      this.musicGain.gain.value = this.spec.music.gameplay.defaultGain * this.musicLevel;
    }
  }
}
