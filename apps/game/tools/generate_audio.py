#!/usr/bin/env python3
"""Generate the original, deterministic Space starter audio pack."""

from __future__ import annotations

import math
import random
import struct
import wave
from pathlib import Path
from typing import Callable


REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = REPO_ROOT / "audio" / "space_basic_v1"
SAMPLE_RATE = 22_050
TAU = math.tau


def midi(note: int) -> float:
    return 440.0 * (2.0 ** ((note - 69) / 12.0))


def envelope(time: float, duration: float, attack: float = 0.01, release: float = 0.06) -> float:
    if time < 0 or time >= duration:
        return 0.0
    return min(1.0, time / attack) * min(1.0, (duration - time) / release)


def sine(phase: float) -> float:
    return math.sin(TAU * phase)


def triangle(phase: float) -> float:
    return 2.0 * abs(2.0 * ((phase + 0.25) % 1.0) - 1.0) - 1.0


def soft_square(phase: float) -> float:
    return math.tanh(2.2 * math.sin(TAU * phase))


def add_note(
    samples: list[float],
    start: float,
    duration: float,
    frequency: float,
    gain: float,
    oscillator: Callable[[float], float] = sine,
) -> None:
    first = max(0, int(start * SAMPLE_RATE))
    last = min(len(samples), int((start + duration) * SAMPLE_RATE))
    for index in range(first, last):
        local_time = index / SAMPLE_RATE - start
        samples[index] += gain * envelope(local_time, duration) * oscillator(local_time * frequency)


def add_sweep(
    samples: list[float],
    start: float,
    duration: float,
    frequency_start: float,
    frequency_end: float,
    gain: float,
    oscillator: Callable[[float], float] = sine,
) -> None:
    first = max(0, int(start * SAMPLE_RATE))
    last = min(len(samples), int((start + duration) * SAMPLE_RATE))
    phase = 0.0
    for index in range(first, last):
        local_time = index / SAMPLE_RATE - start
        progress = local_time / duration
        frequency = frequency_start * ((frequency_end / frequency_start) ** progress)
        phase += frequency / SAMPLE_RATE
        samples[index] += gain * envelope(local_time, duration) * oscillator(phase)


def add_noise(
    samples: list[float], start: float, duration: float, gain: float, seed: int
) -> None:
    randomizer = random.Random(seed)
    first = max(0, int(start * SAMPLE_RATE))
    last = min(len(samples), int((start + duration) * SAMPLE_RATE))
    previous = 0.0
    for index in range(first, last):
        local_time = index / SAMPLE_RATE - start
        raw = randomizer.uniform(-1.0, 1.0)
        filtered = previous * 0.62 + raw * 0.38
        previous = filtered
        samples[index] += gain * envelope(local_time, duration, 0.002, duration * 0.65) * filtered


def normalize(samples: list[float], peak: float = 0.86) -> list[float]:
    maximum = max((abs(sample) for sample in samples), default=1.0)
    scale = min(1.0, peak / maximum) if maximum else 1.0
    return [math.tanh(sample * scale * 1.1) / math.tanh(1.1) for sample in samples]


def write_wav(path: Path, samples: list[float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = bytearray()
    for sample in normalize(samples):
        pcm.extend(struct.pack("<h", round(max(-1.0, min(1.0, sample)) * 32767)))
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(pcm)


def empty(duration: float) -> list[float]:
    return [0.0] * round(duration * SAMPLE_RATE)


def gameplay_loop() -> list[float]:
    bpm = 112
    beat = 60 / bpm
    bars = 8
    duration = bars * 4 * beat
    samples = empty(duration)
    melody = [76, 79, 83, 79, 74, 78, 81, 78, 72, 76, 79, 83, 71, 74, 78, 74]
    bass = [40, 40, 43, 43, 36, 36, 38, 38]
    for step in range(bars * 8):
        start = step * beat / 2
        note = melody[step % len(melody)]
        add_note(samples, start, beat * 0.42, midi(note), 0.12, soft_square)
        if step % 2 == 1:
            add_note(samples, start, beat * 0.32, midi(note - 12), 0.035, sine)
    for bar in range(bars):
        for quarter in range(4):
            start = (bar * 4 + quarter) * beat
            add_note(samples, start, beat * 0.78, midi(bass[bar]), 0.16, triangle)
            if quarter in {0, 2}:
                add_sweep(samples, start, 0.11, 105, 48, 0.16, sine)
            if quarter in {1, 3}:
                add_noise(samples, start, 0.08, 0.07, seed=bar * 10 + quarter)
        chord = [bass[bar] + 12, bass[bar] + 19, bass[bar] + 24]
        for note in chord:
            add_note(samples, bar * 4 * beat, beat * 3.82, midi(note), 0.025, sine)
    return samples


def generate_effects() -> dict[str, list[float]]:
    effects: dict[str, list[float]] = {}

    jump = empty(0.24)
    add_sweep(jump, 0, 0.22, 260, 720, 0.5, soft_square)
    effects["jump"] = jump

    land = empty(0.16)
    add_sweep(land, 0, 0.13, 120, 48, 0.55, sine)
    add_noise(land, 0, 0.1, 0.15, 11)
    effects["land"] = land

    collectible = empty(0.24)
    add_note(collectible, 0, 0.12, midi(84), 0.5, sine)
    add_note(collectible, 0.085, 0.14, midi(91), 0.45, sine)
    effects["collectible"] = collectible

    enemy_defeat = empty(0.4)
    add_sweep(enemy_defeat, 0, 0.3, 520, 95, 0.48, soft_square)
    add_noise(enemy_defeat, 0.19, 0.17, 0.18, 23)
    effects["enemy_defeat"] = enemy_defeat

    player_damage = empty(0.26)
    add_sweep(player_damage, 0, 0.22, 210, 105, 0.52, soft_square)
    add_noise(player_damage, 0, 0.12, 0.16, 37)
    effects["player_damage"] = player_damage

    player_death = empty(0.82)
    add_sweep(player_death, 0, 0.74, 440, 55, 0.43, triangle)
    add_note(player_death, 0.18, 0.4, midi(45), 0.18, sine)
    effects["player_death"] = player_death

    respawn = empty(0.62)
    for index, note in enumerate([60, 64, 67, 72]):
        add_note(respawn, index * 0.11, 0.24, midi(note), 0.36, sine)
    effects["respawn"] = respawn

    weapon_swing = empty(0.22)
    add_noise(weapon_swing, 0, 0.18, 0.12, 71)
    add_sweep(weapon_swing, 0, 0.2, 980, 260, 0.34, sine)
    effects["weapon_swing"] = weapon_swing

    weapon_hit = empty(0.25)
    add_sweep(weapon_hit, 0, 0.13, 780, 185, 0.48, soft_square)
    add_noise(weapon_hit, 0.03, 0.18, 0.2, 89)
    effects["weapon_hit"] = weapon_hit

    fire = empty(0.4)
    add_sweep(fire, 0, 0.34, 560, 120, 0.4, soft_square)
    add_sweep(fire, 0.02, 0.26, 190, 690, 0.14, triangle)
    add_noise(fire, 0, 0.36, 0.18, 97)
    effects["fire"] = fire

    checkpoint = empty(0.68)
    for index, note in enumerate([72, 79, 84]):
        add_note(checkpoint, index * 0.13, 0.36, midi(note), 0.34, sine)
    effects["checkpoint"] = checkpoint

    goal = empty(1.34)
    for index, note in enumerate([67, 72, 76, 79, 84]):
        add_note(goal, index * 0.16, 0.56, midi(note), 0.3, soft_square)
        add_note(goal, index * 0.16, 0.62, midi(note - 12), 0.11, triangle)
    effects["goal"] = goal

    return effects


def main() -> None:
    write_wav(OUTPUT_DIR / "gameplay_loop.wav", gameplay_loop())
    effects = generate_effects()
    for cue, samples in effects.items():
        write_wav(OUTPUT_DIR / f"{cue}.wav", samples)
    print(f"Generated {1 + len(effects)} audio files in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
