#!/usr/bin/env python3
"""Generate the deterministic, theme-neutral menacing boss music loop."""

from __future__ import annotations

import math
import random
import struct
import wave
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATHS = (
    REPO_ROOT / "audio" / "space_basic_v1" / "boss_loop.wav",
    REPO_ROOT / "audio" / "dragons_emberkeep_v1" / "boss_loop.wav",
)
SAMPLE_RATE = 22_050
TAU = math.tau


def midi(note: int) -> float:
    return 440.0 * (2.0 ** ((note - 69) / 12.0))


def envelope(time: float, duration: float, attack: float, release: float) -> float:
    if time < 0 or time >= duration:
        return 0.0
    return min(1.0, time / attack) * min(1.0, (duration - time) / release)


def add_tone(
    samples: list[float],
    start: float,
    duration: float,
    frequency: float,
    gain: float,
    attack: float = 0.02,
    release: float = 0.12,
    detune: float = 0.0,
) -> None:
    first = max(0, int(start * SAMPLE_RATE))
    last = min(len(samples), int((start + duration) * SAMPLE_RATE))
    for index in range(first, last):
        local_time = index / SAMPLE_RATE - start
        body = math.sin(TAU * frequency * local_time)
        body += 0.42 * math.sin(TAU * frequency * 0.5 * local_time)
        body += 0.24 * math.sin(TAU * frequency * 2.0 * local_time)
        if detune:
            body += 0.3 * math.sin(TAU * frequency * (1 + detune) * local_time)
        samples[index] += gain * envelope(local_time, duration, attack, release) * body


def add_drum(samples: list[float], start: float, gain: float, seed: int) -> None:
    duration = 0.38
    first = int(start * SAMPLE_RATE)
    last = min(len(samples), int((start + duration) * SAMPLE_RATE))
    randomizer = random.Random(seed)
    phase = 0.0
    filtered_noise = 0.0
    for index in range(first, last):
        local_time = index / SAMPLE_RATE - start
        progress = local_time / duration
        frequency = 92 * ((42 / 92) ** progress)
        phase += frequency / SAMPLE_RATE
        filtered_noise = filtered_noise * 0.76 + randomizer.uniform(-1, 1) * 0.24
        decay = min(1.0, local_time / 0.004) * (1 - progress) ** 3
        samples[index] += gain * decay * (
            math.sin(TAU * phase) * 0.82 + filtered_noise * 0.18
        )


def boss_loop() -> list[float]:
    bpm = 120
    beat = 60 / bpm
    bars = 8
    duration = bars * 4 * beat
    samples = [0.0] * round(duration * SAMPLE_RATE)
    roots = [38, 38, 39, 38, 32, 39, 38, 33]
    pulse = [38, 38, 50, 39, 38, 44, 39, 38]

    for bar, root in enumerate(roots):
        bar_start = bar * 4 * beat
        add_tone(samples, bar_start, 4 * beat - 0.04, midi(root), 0.105, 0.08, 0.18, 0.004)
        add_tone(samples, bar_start, 4 * beat - 0.04, midi(root + 6), 0.038, 0.16, 0.22, -0.003)
        for eighth in range(8):
            start = bar_start + eighth * beat / 2
            note = pulse[eighth]
            accent = 0.105 if eighth in {0, 3, 6} else 0.062
            add_tone(samples, start, beat * 0.38, midi(note), accent, 0.008, 0.08)
        add_drum(samples, bar_start, 0.34, 100 + bar)
        add_drum(samples, bar_start + 2 * beat, 0.26, 200 + bar)
        if bar in {3, 7}:
            for step, note in enumerate([50, 49, 44, 39]):
                add_tone(
                    samples,
                    bar_start + (2.5 + step * 0.375) * beat,
                    beat * 0.3,
                    midi(note),
                    0.095,
                    0.006,
                    0.07,
                )

    peak = max(abs(sample) for sample in samples)
    scale = 0.82 / peak if peak else 1.0
    return [math.tanh(sample * scale * 1.15) / math.tanh(1.15) for sample in samples]


def write_wav(path: Path, samples: list[float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frames = bytearray()
    for sample in samples:
        frames.extend(struct.pack("<h", round(max(-1.0, min(1.0, sample)) * 32767)))
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(frames)


def main() -> None:
    samples = boss_loop()
    for path in OUTPUT_PATHS:
        write_wav(path, samples)
        print(f"Generated {path.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
