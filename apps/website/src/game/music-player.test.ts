import assert from "node:assert/strict";
import test from "node:test";

import { MusicPlayer, type MusicTrack } from "./music-player";

type FakeGain = {
  value: number;
  curves: { curve: Float32Array; duration: number }[];
  cancelled: number;
};

class FakeGainNode {
  gain: {
    value: number;
    cancelScheduledValues: (time: number) => void;
    setValueCurveAtTime: (curve: Float32Array, time: number, duration: number) => void;
  };
  record: FakeGain = { value: 0, curves: [], cancelled: 0 };
  connectedTo: unknown = null;

  constructor() {
    const record = this.record;
    this.gain = {
      get value() {
        return record.value;
      },
      set value(next: number) {
        record.value = next;
      },
      cancelScheduledValues() {
        record.cancelled += 1;
      },
      setValueCurveAtTime(curve: Float32Array, _time: number, duration: number) {
        record.curves.push({ curve, duration });
        record.value = curve[curve.length - 1];
      },
    };
  }

  connect(target: unknown) {
    this.connectedTo = target;
    return target;
  }
}

class FakeSourceNode {
  buffer: unknown = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  started = false;
  stoppedAt: number | null = null;
  connectedTo: unknown = null;

  connect(target: unknown) {
    this.connectedTo = target;
    return target;
  }

  start() {
    this.started = true;
  }

  stop(when?: number) {
    this.stoppedAt = when ?? 0;
  }
}

class FakeAudioContext {
  state: "running" | "suspended" | "closed" = "running";
  currentTime = 0;
  destination = { id: "destination" };
  sources: FakeSourceNode[] = [];
  gains: FakeGainNode[] = [];
  closed = false;
  resumed = 0;
  /**
   * What the decoder hands back. Opus reports longer than the authored loop
   * because of its pre-skip padding, so this defaults to a padded length.
   */
  decodedDuration = 68.6;

  createBufferSource() {
    const source = new FakeSourceNode();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }

  createGain() {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }

  async decodeAudioData(encoded: ArrayBuffer) {
    return {
      byteLength: encoded.byteLength,
      duration: this.decodedDuration,
    } as unknown as AudioBuffer;
  }

  async resume() {
    this.resumed += 1;
    this.state = "running";
  }

  async close() {
    this.closed = true;
    this.state = "closed";
  }
}

const TRACKS = {
  gameplay: { url: "/gameplay.wav", volume: 0.32 },
  boss: { url: "/boss.wav", volume: 0.38 },
} as const satisfies Record<string, MusicTrack>;

type Cue = keyof typeof TRACKS;

function createPlayer(
  overrides: {
    fetchAudio?: (url: string) => Promise<ArrayBuffer>;
    tracks?: Record<Cue, MusicTrack>;
    decodedDuration?: number;
  } = {},
) {
  const context = new FakeAudioContext();
  if (overrides.decodedDuration !== undefined) {
    context.decodedDuration = overrides.decodedDuration;
  }
  const requested: string[] = [];
  const player = new MusicPlayer<Cue>(overrides.tracks ?? TRACKS, {
    createContext: () => context as unknown as AudioContext,
    fetchAudio:
      overrides.fetchAudio ??
      (async (url: string) => {
        requested.push(url);
        return new ArrayBuffer(8);
      }),
    crossfadeSeconds: 0.25,
  });
  return { player, context, requested };
}

/** Lets queued decode/fetch microtasks settle. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("music loops through a buffer source rather than an HTMLAudioElement", async () => {
  const { player, context } = createPlayer();

  player.start("gameplay");
  await settle();

  assert.equal(context.sources.length, 1);
  assert.equal(context.sources[0].loop, true, "the buffer source must loop in the audio thread");
  assert.equal(context.sources[0].started, true);
  assert.equal(player.playingCue, "gameplay");
});

/**
 * The seam is validated in `apps/game/tools/audio.py` against the authored WAV,
 * but the runtime plays Opus, which decodes at 48 kHz behind pre-skip padding.
 * Looping the decoded buffer whole would play that padding every pass and undo
 * the validation, so the loop is bounded by the authored length.
 */
test("the loop ends where the author ended it, not where the decoder did", async () => {
  const { player, context } = createPlayer({
    tracks: {
      gameplay: { url: "/gameplay.ogg", volume: 0.32, loopSeconds: 68.571429 },
      boss: { url: "/boss.ogg", volume: 0.38, loopSeconds: 16 },
    },
    decodedDuration: 68.68, // authored length plus codec padding
  });

  player.start("gameplay");
  await settle();

  assert.equal(context.sources[0].loopStart, 0);
  assert.equal(context.sources[0].loopEnd, 68.571429);
});

test("a track with no authored length still loops its whole buffer", async () => {
  const { player, context } = createPlayer({ decodedDuration: 42 });

  player.start("gameplay");
  await settle();

  assert.equal(context.sources[0].loopEnd, 42);
});

/**
 * A manifest that outran the audio would otherwise loop through silence, which
 * is worse than a slightly early loop point.
 */
test("an authored length longer than the audio is clamped to the audio", async () => {
  const { player, context } = createPlayer({
    tracks: {
      gameplay: { url: "/gameplay.ogg", volume: 0.32, loopSeconds: 90 },
      boss: { url: "/boss.ogg", volume: 0.38, loopSeconds: 16 },
    },
    decodedDuration: 60,
  });

  player.start("gameplay");
  await settle();

  assert.equal(context.sources[0].loopEnd, 60);
});

test("repeating the active cue does not restart or refetch the loop", async () => {
  const { player, context, requested } = createPlayer();

  player.start("gameplay");
  await settle();
  for (let frame = 0; frame < 120; frame += 1) player.start("gameplay");
  await settle();

  assert.equal(context.sources.length, 1, "the loop must survive per-frame start calls");
  assert.deepEqual(requested, ["/gameplay.wav"]);
});

test("switching to the boss cue crossfades instead of cutting the gameplay loop", async () => {
  const { player, context } = createPlayer();

  player.start("gameplay");
  await settle();
  player.start("boss");
  await settle();

  assert.equal(context.sources.length, 2, "both loops exist across the crossfade");
  // The first gain is the master; the voice gains follow in cue order.
  const master = context.gains.find((gain) => gain.connectedTo === context.destination);
  const [gameplayGain, bossGain] = context.gains.filter((gain) => gain !== master);

  const bossFade = bossGain.record.curves.at(-1);
  assert.ok(bossFade, "the incoming cue ramps in");
  assert.equal(bossFade.curve[0], 0);
  assert.ok(Math.abs(bossFade.curve[bossFade.curve.length - 1] - 0.38) < 1e-6);

  const gameplayFade = gameplayGain.record.curves.at(-1);
  assert.ok(gameplayFade, "the outgoing cue ramps out");
  assert.ok(gameplayFade.curve[gameplayFade.curve.length - 1] < 1e-6);

  // Equal power: the two curves sum to constant power through the fade.
  for (let index = 0; index < bossFade.curve.length; index += 1) {
    const rising = bossFade.curve[index] / 0.38;
    const falling = gameplayFade.curve[index] / gameplayFade.curve[0];
    assert.ok(Math.abs(rising * rising + falling * falling - 1) < 1e-6);
  }

  assert.equal(
    context.sources[0].stoppedAt,
    0.25,
    "the outgoing source stops only after the fade completes",
  );
});

test("muting drops the master gain and unmuting restores it", async () => {
  const { player, context } = createPlayer();

  player.start("gameplay");
  await settle();
  const master = context.gains.find((gain) => gain.connectedTo === context.destination);
  assert.ok(master);

  player.setMuted(true);
  assert.equal(master.record.value, 0);
  player.setMuted(false);
  assert.equal(master.record.value, 1);
});

test("a failed music fetch leaves the game silent instead of throwing", async () => {
  const { player, context } = createPlayer({
    fetchAudio: async () => {
      throw new Error("offline");
    },
  });

  player.start("gameplay");
  await settle();

  assert.equal(context.sources.length, 0);
  assert.equal(player.playingCue, "gameplay", "the cue is still tracked so a retry can succeed");
});

test("stopping releases the loop and disposing closes the context", async () => {
  const { player, context } = createPlayer();

  player.start("gameplay");
  await settle();
  player.stop();

  assert.equal(context.sources[0].stoppedAt, 0.25);
  assert.equal(player.playingCue, null);

  player.dispose();
  assert.equal(context.closed, true);
});
