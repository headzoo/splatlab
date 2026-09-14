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
    return { byteLength: encoded.byteLength } as unknown as AudioBuffer;
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

function createPlayer(overrides: { fetchAudio?: (url: string) => Promise<ArrayBuffer> } = {}) {
  const context = new FakeAudioContext();
  const requested: string[] = [];
  const player = new MusicPlayer<Cue>(TRACKS, {
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
