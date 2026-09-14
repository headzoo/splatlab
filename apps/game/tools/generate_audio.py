#!/usr/bin/env python3
"""Generate the original, deterministic Space starter audio pack."""

from __future__ import annotations

import math
import random
import struct
import wave
from collections.abc import Sequence
from dataclasses import dataclass
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


def loop_frames(bpm: float, bars: int, beats_per_bar: int = 4) -> int:
    """Frame count for a whole number of bars.

    A tempo that does not divide the sample rate evenly leaves a fractional
    frame at the loop point, which reads as a click once the buffer repeats.
    """
    exact = beats_per_bar * bars * 60 * SAMPLE_RATE / bpm
    frames = round(exact)
    if abs(exact - frames) > 1e-9:
        raise ValueError(
            f"{bpm} BPM over {bars} bars is {exact} frames at {SAMPLE_RATE} Hz, which is not sample exact"
        )
    return frames


def loop_empty(frames: int) -> list[float]:
    return [0.0] * frames


def add_loop_note(
    samples: list[float],
    start: float,
    duration: float,
    frequency: float,
    gain: float,
    oscillator: Callable[[float], float] = sine,
    attack: float = 0.01,
    release: float = 0.06,
) -> None:
    """Write a note into a looping buffer, wrapping anything past the end to the front."""
    frames = len(samples)
    first = round(start * SAMPLE_RATE)
    for offset in range(round(duration * SAMPLE_RATE)):
        local_time = offset / SAMPLE_RATE
        value = gain * envelope(local_time, duration, attack, release) * oscillator(local_time * frequency)
        samples[(first + offset) % frames] += value


def add_loop_sweep(
    samples: list[float],
    start: float,
    duration: float,
    frequency_start: float,
    frequency_end: float,
    gain: float,
    oscillator: Callable[[float], float] = sine,
) -> None:
    frames = len(samples)
    first = round(start * SAMPLE_RATE)
    phase = 0.0
    for offset in range(round(duration * SAMPLE_RATE)):
        local_time = offset / SAMPLE_RATE
        progress = local_time / duration
        frequency = frequency_start * ((frequency_end / frequency_start) ** progress)
        phase += frequency / SAMPLE_RATE
        samples[(first + offset) % frames] += gain * envelope(local_time, duration) * oscillator(phase)


def add_loop_noise(
    samples: list[float],
    start: float,
    duration: float,
    gain: float,
    seed: int,
) -> None:
    frames = len(samples)
    randomizer = random.Random(seed)
    first = round(start * SAMPLE_RATE)
    previous = 0.0
    for offset in range(round(duration * SAMPLE_RATE)):
        local_time = offset / SAMPLE_RATE
        previous = previous * 0.62 + randomizer.uniform(-1.0, 1.0) * 0.38
        value = gain * envelope(local_time, duration, 0.002, duration * 0.65) * previous
        samples[(first + offset) % frames] += value


def add_loop_pad(
    samples: list[float],
    start: float,
    duration: float,
    frequency: float,
    gain: float,
    detune: float = 0.005,
    attack: float = 0.3,
    release: float = 0.4,
) -> None:
    """Write a sustained detuned voice. Give it a duration longer than its bar so it
    carries across the loop point instead of leaving a hole there."""
    frames = len(samples)
    first = round(start * SAMPLE_RATE)
    for offset in range(round(duration * SAMPLE_RATE)):
        local_time = offset / SAMPLE_RATE
        body = math.sin(TAU * frequency * local_time)
        body += 0.46 * math.sin(TAU * frequency * (1.0 + detune) * local_time)
        body += 0.22 * math.sin(TAU * frequency * 2.0 * local_time)
        samples[(first + offset) % frames] += gain * envelope(local_time, duration, attack, release) * body


@dataclass(frozen=True)
class Phrase:
    """One eight-bar section of a gameplay loop.

    `melody` is four bars of eighth notes and repeats once inside the phrase;
    `shifts` transposes each bar so the repeat is not literal.
    """

    roots: tuple[int, ...]
    melody: tuple[int, ...]
    shifts: tuple[int, ...] = (0, 0, 0, 0, 0, 0, 0, 0)
    chord: tuple[int, ...] = (12, 19, 24)
    arpeggio: tuple[int, ...] = (12, 19, 24, 19)
    turnaround: tuple[int, ...] = (24, 22, 19, 15)
    drive: float = 1.0


BARS_PER_PHRASE = 8


def render_phrased_loop(
    bpm: float,
    phrases: Sequence[Phrase],
    *,
    lead: Callable[[float], float] = soft_square,
    counter: Callable[[float], float] = sine,
    bass: Callable[[float], float] = triangle,
    lead_gain: float = 0.1,
    counter_gain: float = 0.03,
    bass_gain: float = 0.15,
    pad_gain: float = 0.022,
    arpeggio_gain: float = 0.03,
    kick: tuple[float, float] = (105.0, 48.0),
    kick_gain: float = 0.16,
    snare_gain: float = 0.07,
    hat_gain: float = 0.05,
    seed: int = 0,
) -> list[float]:
    """Render a multi-voice mono loop whose voices wrap across the loop point.

    Every sustained voice overruns its bar, so the last frame of the buffer
    carries the same material as the first frame.
    """
    beat = 60 / bpm
    bars = len(phrases) * BARS_PER_PHRASE
    samples = loop_empty(loop_frames(bpm, bars))

    for phrase_index, phrase in enumerate(phrases):
        first_bar = phrase_index * BARS_PER_PHRASE
        for bar_offset in range(BARS_PER_PHRASE):
            bar = first_bar + bar_offset
            bar_start = bar * 4 * beat
            root = phrase.roots[bar_offset]
            shift = phrase.shifts[bar_offset]

            for eighth in range(8):
                step = bar_offset * 8 + eighth
                note = phrase.melody[step % len(phrase.melody)] + shift
                start = bar_start + eighth * beat / 2
                add_loop_note(samples, start, beat * 0.44, midi(note), lead_gain, lead)
                if eighth % 2 == 1:
                    add_loop_note(
                        samples, start, beat * 0.34, midi(note - 12), counter_gain, counter
                    )

                interval = phrase.arpeggio[eighth % len(phrase.arpeggio)]
                add_loop_note(
                    samples,
                    start + beat / 4,
                    beat * 0.2,
                    midi(root + interval),
                    arpeggio_gain,
                    sine,
                )

                if eighth % 2 == 1 or phrase.drive >= 1.0:
                    add_loop_noise(
                        samples,
                        start,
                        0.045,
                        hat_gain * phrase.drive,
                        seed + 5000 + bar * 8 + eighth,
                    )

            for quarter in range(4):
                start = bar_start + quarter * beat
                add_loop_note(samples, start, beat * 0.8, midi(root), bass_gain, bass)
                if quarter in {0, 2}:
                    add_loop_sweep(samples, start, 0.12, kick[0], kick[1], kick_gain, sine)
                else:
                    add_loop_noise(
                        samples,
                        start,
                        0.09,
                        snare_gain * phrase.drive,
                        seed + bar * 8 + quarter,
                    )

            for interval in phrase.chord:
                add_loop_pad(samples, bar_start, 4 * beat + 0.4, midi(root + interval), pad_gain)

        # A pickup over the phrase's final half bar. On the last phrase its closing
        # notes land past the buffer end and wrap, so the join keeps playing.
        last_bar_start = (first_bar + BARS_PER_PHRASE - 1) * 4 * beat
        for step, interval in enumerate(phrase.turnaround):
            add_loop_note(
                samples,
                last_bar_start + (2.5 + step * 0.5) * beat,
                beat * 0.6,
                midi(phrase.roots[-1] + interval),
                lead_gain * 0.8,
                lead,
            )

    return samples


SPACE_BPM = 112
SPACE_BARS = 32

# Four eight-bar phrases in E minor, played as A A' B A''. The B phrase moves to
# Am D C G and thins the percussion so the return lands as a lift.
SPACE_PHRASES = (
    Phrase(
        roots=(40, 40, 43, 43, 36, 36, 38, 38),
        melody=(
            76, 79, 83, 79, 74, 78, 81, 78,
            72, 76, 79, 83, 71, 74, 78, 74,
            76, 79, 83, 86, 83, 79, 76, 74,
            72, 74, 76, 79, 78, 76, 74, 71,
        ),
        shifts=(0, 0, 0, 0, 12, 12, 0, 0),
    ),
    Phrase(
        roots=(40, 40, 43, 43, 36, 36, 38, 38),
        melody=(
            83, 86, 88, 86, 83, 79, 76, 79,
            81, 78, 74, 78, 81, 83, 86, 83,
            79, 76, 72, 76, 79, 83, 86, 88,
            86, 83, 79, 76, 74, 72, 71, 74,
        ),
        shifts=(0, 0, 0, 0, -12, 0, 0, 0),
        drive=1.05,
    ),
    Phrase(
        roots=(45, 45, 38, 38, 36, 36, 43, 43),
        melody=(
            81, 81, 79, 76, 76, 74, 72, 74,
            76, 76, 78, 79, 79, 81, 83, 81,
            79, 79, 76, 72, 72, 74, 76, 74,
            71, 74, 76, 79, 81, 79, 76, 74,
        ),
        shifts=(0, 0, 0, 0, 0, 0, 12, 12),
        turnaround=(19, 17, 14, 12),
        drive=0.7,
    ),
    Phrase(
        roots=(40, 40, 43, 43, 36, 36, 38, 38),
        melody=(
            76, 79, 83, 79, 74, 78, 81, 78,
            72, 76, 79, 83, 86, 83, 79, 76,
            74, 78, 81, 86, 88, 86, 81, 78,
            76, 79, 83, 88, 86, 83, 79, 76,
        ),
        shifts=(0, 0, 0, 0, 0, 12, 0, 0),
        drive=1.15,
    ),
)


def gameplay_loop() -> list[float]:
    return render_phrased_loop(SPACE_BPM, SPACE_PHRASES, seed=1300)


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


@dataclass(frozen=True)
class EffectPalette:
    """Timbre controls for one theme's short effect cues.

    The Space and Emberkeep packs keep their hand-written effects; later themes
    share this builder so every pack covers the same twelve semantic cues.
    """

    seed: int
    lead: Callable[[float], float] = sine
    body: Callable[[float], float] = soft_square
    noise: float = 1.0
    low: float = 1.0
    pickup: tuple[int, ...] = (76, 83, 88)
    respawn_run: tuple[int, ...] = (60, 64, 67, 72)
    checkpoint_run: tuple[int, ...] = (72, 79, 84)
    goal_run: tuple[int, ...] = (67, 72, 76, 79, 84)


def themed_effects(palette: EffectPalette) -> dict[str, list[float]]:
    seed = palette.seed
    effects: dict[str, list[float]] = {}

    jump = empty(0.24)
    add_sweep(jump, 0, 0.21, 250 * palette.low, 700, 0.46, palette.body)
    add_noise(jump, 0, 0.09, 0.05 * palette.noise, seed + 1)
    effects["jump"] = jump

    land = empty(0.18)
    add_sweep(land, 0, 0.15, 130 * palette.low, 45 * palette.low, 0.55, sine)
    add_noise(land, 0, 0.13, 0.17 * palette.noise, seed + 2)
    effects["land"] = land

    collectible = empty(0.28)
    for index, note in enumerate(palette.pickup):
        add_note(collectible, index * 0.07, 0.16, midi(note), 0.4, palette.lead)
    effects["collectible"] = collectible

    enemy_defeat = empty(0.44)
    add_sweep(enemy_defeat, 0, 0.35, 560, 88 * palette.low, 0.46, palette.body)
    add_noise(enemy_defeat, 0.12, 0.22, 0.2 * palette.noise, seed + 3)
    effects["enemy_defeat"] = enemy_defeat

    player_damage = empty(0.28)
    add_sweep(player_damage, 0, 0.23, 230, 100 * palette.low, 0.52, palette.body)
    add_noise(player_damage, 0, 0.14, 0.17 * palette.noise, seed + 4)
    effects["player_damage"] = player_damage

    player_death = empty(0.86)
    add_sweep(player_death, 0, 0.78, 420, 50 * palette.low, 0.44, palette.lead)
    add_note(player_death, 0.19, 0.45, midi(43), 0.19, sine)
    effects["player_death"] = player_death

    respawn = empty(0.65)
    for index, note in enumerate(palette.respawn_run):
        add_note(respawn, index * 0.11, 0.27, midi(note), 0.34, palette.lead)
    effects["respawn"] = respawn

    weapon_swing = empty(0.23)
    add_noise(weapon_swing, 0, 0.19, 0.13 * palette.noise, seed + 5)
    add_sweep(weapon_swing, 0, 0.2, 940, 235, 0.36, sine)
    effects["weapon_swing"] = weapon_swing

    weapon_hit = empty(0.27)
    add_sweep(weapon_hit, 0, 0.14, 730, 160 * palette.low, 0.5, palette.body)
    add_noise(weapon_hit, 0.03, 0.19, 0.21 * palette.noise, seed + 6)
    effects["weapon_hit"] = weapon_hit

    fire = empty(0.42)
    add_sweep(fire, 0, 0.36, 540, 112 * palette.low, 0.42, palette.body)
    add_sweep(fire, 0.02, 0.27, 180, 660, 0.15, palette.lead)
    add_noise(fire, 0, 0.38, 0.19 * palette.noise, seed + 7)
    effects["fire"] = fire

    checkpoint = empty(0.72)
    for index, note in enumerate(palette.checkpoint_run):
        add_note(checkpoint, index * 0.125, 0.37, midi(note), 0.32, palette.lead)
    effects["checkpoint"] = checkpoint

    goal = empty(1.45)
    for index, note in enumerate(palette.goal_run):
        add_note(goal, index * 0.16, 0.6, midi(note), 0.29, palette.body)
        add_note(goal, index * 0.16, 0.66, midi(note - 12), 0.1, palette.lead)
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
