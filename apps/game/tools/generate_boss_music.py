#!/usr/bin/env python3
"""Generate the deterministic, theme-neutral menacing boss music loop."""

from __future__ import annotations

import math
import random
from pathlib import Path

from generate_audio import (
    SAMPLE_RATE,
    TAU,
    envelope,
    loop_empty,
    loop_frames,
    midi,
    write_wav,
)


REPO_ROOT = Path(__file__).resolve().parent.parent
PACK_IDS = (
    "space_basic_v1",
    "dragons_emberkeep_v1",
    "neutral_green_hills_v1",
    "haunted_graveyard_v1",
    "ice_world_v1",
)
OUTPUT_PATHS = tuple(REPO_ROOT / "audio" / pack / "boss_loop.wav" for pack in PACK_IDS)
BOSS_BPM = 120
BOSS_BARS = 8


def add_loop_tone(
    samples: list[float],
    start: float,
    duration: float,
    frequency: float,
    gain: float,
    attack: float = 0.02,
    release: float = 0.12,
    detune: float = 0.0,
) -> None:
    """Write a low harmonic voice into a looping buffer, wrapping past the end."""
    frames = len(samples)
    first = round(start * SAMPLE_RATE)
    for offset in range(round(duration * SAMPLE_RATE)):
        local_time = offset / SAMPLE_RATE
        body = math.sin(TAU * frequency * local_time)
        body += 0.42 * math.sin(TAU * frequency * 0.5 * local_time)
        body += 0.24 * math.sin(TAU * frequency * 2.0 * local_time)
        if detune:
            body += 0.3 * math.sin(TAU * frequency * (1 + detune) * local_time)
        samples[(first + offset) % frames] += (
            gain * envelope(local_time, duration, attack, release) * body
        )


def add_loop_drum(samples: list[float], start: float, gain: float, seed: int) -> None:
    frames = len(samples)
    duration = 0.38
    randomizer = random.Random(seed)
    first = round(start * SAMPLE_RATE)
    phase = 0.0
    filtered_noise = 0.0
    for offset in range(round(duration * SAMPLE_RATE)):
        local_time = offset / SAMPLE_RATE
        progress = local_time / duration
        frequency = 92 * ((42 / 92) ** progress)
        phase += frequency / SAMPLE_RATE
        filtered_noise = filtered_noise * 0.76 + randomizer.uniform(-1, 1) * 0.24
        decay = min(1.0, local_time / 0.004) * (1 - progress) ** 3
        samples[(first + offset) % frames] += (
            gain * decay * (math.sin(TAU * phase) * 0.82 + filtered_noise * 0.18)
        )


def boss_loop() -> list[float]:
    beat = 60 / BOSS_BPM
    samples = loop_empty(loop_frames(BOSS_BPM, BOSS_BARS))
    roots = [38, 38, 39, 38, 32, 39, 38, 33]
    pulse = [38, 38, 50, 39, 38, 44, 39, 38]

    for bar, root in enumerate(roots):
        bar_start = bar * 4 * beat
        # The drone overruns its bar so the final bar sustains across the loop point.
        add_loop_tone(samples, bar_start, 4 * beat + 0.3, midi(root), 0.105, 0.08, 0.3, 0.004)
        add_loop_tone(samples, bar_start, 4 * beat + 0.3, midi(root + 6), 0.038, 0.16, 0.34, -0.003)
        for eighth in range(8):
            start = bar_start + eighth * beat / 2
            accent = 0.105 if eighth in {0, 3, 6} else 0.062
            add_loop_tone(samples, start, beat * 0.38, midi(pulse[eighth]), accent, 0.008, 0.08)
        add_loop_drum(samples, bar_start, 0.34, 100 + bar)
        add_loop_drum(samples, bar_start + 2 * beat, 0.26, 200 + bar)
        if bar in {3, 7}:
            # The run spills past the bar line, so on the final bar it resolves onto
            # the root inside bar one instead of stopping dead at the loop point.
            for step, note in enumerate([50, 49, 47, 44, 43, 38]):
                add_loop_tone(
                    samples,
                    bar_start + (2.5 + step * 0.375) * beat,
                    beat * 0.3,
                    midi(note),
                    0.095,
                    0.006,
                    0.07,
                )

    return samples


def main() -> None:
    samples = boss_loop()
    for path in OUTPUT_PATHS:
        write_wav(path, samples)
        print(f"Generated {path.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
