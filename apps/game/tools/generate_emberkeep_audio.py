#!/usr/bin/env python3
"""Generate the deterministic Emberkeep Dragons platformer audio pack."""

from __future__ import annotations

from pathlib import Path

from generate_audio import (
    Phrase,
    add_noise,
    add_note,
    add_sweep,
    empty,
    midi,
    render_phrased_loop,
    soft_square,
    sine,
    triangle,
    write_wav,
)


OUTPUT_DIR = Path(__file__).resolve().parent.parent / "audio" / "dragons_emberkeep_v1"

# 105 rather than 104 BPM: at 22050 Hz, 104 BPM over 32 bars lands on
# 1,628,307.69 frames, and the fractional frame reopens the loop seam.
EMBERKEEP_BPM = 105
EMBERKEEP_BARS = 32

# Four eight-bar phrases in A minor, played as A A' B A''. The B phrase drops to
# Dm Bb F E for a Phrygian forge colour before the final phrase returns home.
EMBERKEEP_PHRASES = (
    Phrase(
        roots=(45, 45, 41, 41, 43, 43, 40, 40),
        melody=(
            69, 72, 76, 74, 69, 67, 64, 67,
            69, 72, 77, 76, 72, 69, 67, 64,
            72, 76, 79, 77, 76, 72, 69, 67,
            65, 69, 72, 76, 74, 72, 69, 65,
        ),
        shifts=(0, 0, 0, 0, 0, 0, 12, 0),
    ),
    Phrase(
        roots=(45, 45, 41, 41, 43, 43, 40, 40),
        melody=(
            76, 79, 81, 79, 76, 72, 69, 72,
            74, 72, 69, 72, 74, 76, 79, 76,
            77, 76, 72, 69, 72, 76, 79, 81,
            79, 76, 72, 69, 67, 65, 64, 67,
        ),
        shifts=(0, 0, 0, 0, -12, 0, 0, 0),
        drive=1.05,
    ),
    Phrase(
        roots=(50, 50, 46, 46, 41, 41, 40, 40),
        melody=(
            74, 77, 81, 77, 74, 72, 69, 72,
            70, 74, 77, 74, 70, 69, 65, 69,
            72, 69, 65, 69, 72, 77, 76, 72,
            68, 69, 72, 76, 74, 72, 69, 68,
        ),
        shifts=(0, 0, 0, 0, 0, 12, 0, 0),
        turnaround=(19, 17, 15, 12),
        drive=0.72,
    ),
    Phrase(
        roots=(45, 45, 41, 41, 43, 43, 40, 40),
        melody=(
            69, 72, 76, 81, 79, 76, 72, 69,
            72, 76, 81, 84, 81, 76, 72, 69,
            74, 77, 81, 86, 84, 81, 77, 74,
            76, 79, 84, 88, 86, 84, 79, 76,
        ),
        drive=1.18,
    ),
)


def gameplay_loop() -> list[float]:
    """Thirty-two bars of a minor-key forge-and-castle loop."""
    return render_phrased_loop(
        EMBERKEEP_BPM,
        EMBERKEEP_PHRASES,
        lead=triangle,
        counter=sine,
        bass=soft_square,
        lead_gain=0.095,
        counter_gain=0.032,
        bass_gain=0.155,
        pad_gain=0.024,
        arpeggio_gain=0.028,
        kick=(92.0, 48.0),
        kick_gain=0.15,
        snare_gain=0.065,
        hat_gain=0.045,
        seed=2700,
    )


def generate_effects() -> dict[str, list[float]]:
    effects: dict[str, list[float]] = {}

    jump = empty(0.25)
    add_sweep(jump, 0, 0.22, 230, 650, 0.43, triangle)
    add_noise(jump, 0, 0.1, 0.07, 401)
    effects["jump"] = jump

    land = empty(0.2)
    add_sweep(land, 0, 0.16, 135, 43, 0.58, sine)
    add_noise(land, 0, 0.15, 0.2, 402)
    effects["land"] = land

    collectible = empty(0.32)
    for index, note in enumerate((76, 81, 88)):
        add_note(collectible, index * 0.07, 0.18, midi(note), 0.38, triangle)
    effects["collectible"] = collectible

    enemy_defeat = empty(0.48)
    add_sweep(enemy_defeat, 0, 0.38, 610, 78, 0.46, soft_square)
    add_noise(enemy_defeat, 0.14, 0.25, 0.22, 403)
    effects["enemy_defeat"] = enemy_defeat

    player_damage = empty(0.3)
    add_sweep(player_damage, 0, 0.25, 250, 95, 0.54, soft_square)
    add_noise(player_damage, 0, 0.16, 0.19, 404)
    effects["player_damage"] = player_damage

    player_death = empty(0.9)
    add_sweep(player_death, 0, 0.82, 390, 46, 0.44, triangle)
    add_note(player_death, 0.2, 0.5, midi(40), 0.2, sine)
    effects["player_death"] = player_death

    respawn = empty(0.68)
    for index, note in enumerate((57, 64, 69, 76)):
        add_note(respawn, index * 0.11, 0.3, midi(note), 0.32, sine)
    effects["respawn"] = respawn

    weapon_swing = empty(0.24)
    add_noise(weapon_swing, 0, 0.2, 0.13, 405)
    add_sweep(weapon_swing, 0, 0.21, 900, 210, 0.38, sine)
    effects["weapon_swing"] = weapon_swing

    weapon_hit = empty(0.3)
    add_sweep(weapon_hit, 0, 0.16, 690, 130, 0.52, soft_square)
    add_noise(weapon_hit, 0.03, 0.21, 0.22, 406)
    effects["weapon_hit"] = weapon_hit

    fire = empty(0.44)
    add_sweep(fire, 0, 0.38, 520, 105, 0.44, soft_square)
    add_sweep(fire, 0.02, 0.28, 170, 640, 0.16, triangle)
    add_noise(fire, 0, 0.4, 0.2, 407)
    effects["fire"] = fire

    checkpoint = empty(0.76)
    for index, note in enumerate((69, 76, 81, 88)):
        add_note(checkpoint, index * 0.12, 0.38, midi(note), 0.3, triangle)
    effects["checkpoint"] = checkpoint

    goal = empty(1.55)
    for index, note in enumerate((57, 64, 69, 72, 76, 81)):
        add_note(goal, index * 0.16, 0.66, midi(note), 0.27, soft_square)
        add_note(goal, index * 0.16, 0.7, midi(note - 12), 0.1, sine)
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
