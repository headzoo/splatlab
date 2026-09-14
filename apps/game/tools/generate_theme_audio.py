#!/usr/bin/env python3
"""Generate the Green Hills, Haunted Graveyard, and Ice World sound packs.

Space and Emberkeep each have their own script because their effects are
hand-written. These three share the `themed_effects` builder and differ by
tempo, key, timbre, and phrase form, so one script covers all of them.

    python3 tools/generate_theme_audio.py                      # all three
    python3 tools/generate_theme_audio.py neutral_green_hills_v1
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

from generate_audio import (
    EffectPalette,
    Phrase,
    render_phrased_loop,
    sine,
    soft_square,
    themed_effects,
    triangle,
    write_wav,
)


REPO_ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class ThemePack:
    """Everything that distinguishes one generated pack from another."""

    pack_id: str
    bpm: int
    phrases: tuple[Phrase, ...]
    palette: EffectPalette
    seed: int
    loop_kwargs: dict[str, object] | None = None

    @property
    def bars(self) -> int:
        return len(self.phrases) * 8


# Green Hills: G major, the first map, so bright and bouncy at a walking tempo.
GREEN_HILLS = ThemePack(
    pack_id="neutral_green_hills_v1",
    bpm=126,
    seed=2600,
    phrases=(
        Phrase(
            roots=(43, 43, 38, 38, 40, 40, 36, 36),
            melody=(
                79, 83, 86, 83, 79, 78, 76, 78,
                74, 78, 81, 78, 74, 72, 71, 72,
                76, 79, 83, 86, 83, 79, 76, 74,
                72, 74, 76, 79, 78, 76, 74, 71,
            ),
            shifts=(0, 0, 0, 0, 12, 0, 0, 0),
            chord=(12, 19, 24),
            arpeggio=(12, 19, 24, 19),
            turnaround=(24, 22, 19, 15),
            drive=0.9,
        ),
        Phrase(
            roots=(43, 43, 38, 38, 40, 40, 36, 36),
            melody=(
                83, 86, 88, 86, 83, 79, 78, 79,
                81, 78, 74, 78, 81, 83, 86, 83,
                79, 76, 72, 76, 79, 83, 86, 88,
                86, 83, 79, 76, 74, 72, 71, 74,
            ),
            shifts=(0, 0, 0, 0, -12, 0, 0, 0),
            chord=(12, 19, 28),
            arpeggio=(24, 19, 16, 19),
            turnaround=(28, 24, 21, 19),
            drive=1.0,
        ),
        # B section drops to the relative minor so the return feels like a return.
        Phrase(
            roots=(36, 36, 45, 45, 38, 38, 43, 43),
            melody=(
                72, 76, 79, 76, 72, 71, 69, 71,
                69, 72, 76, 72, 69, 67, 66, 67,
                74, 78, 81, 78, 74, 72, 71, 69,
                67, 71, 74, 78, 79, 78, 74, 71,
            ),
            shifts=(0, 0, 0, 0, 0, 0, 12, 12),
            chord=(12, 16, 23),
            arpeggio=(12, 16, 19, 23),
            turnaround=(19, 17, 14, 12),
            drive=0.72,
        ),
        Phrase(
            roots=(43, 43, 38, 38, 40, 40, 36, 36),
            melody=(
                79, 83, 86, 83, 79, 78, 76, 78,
                74, 78, 81, 86, 88, 86, 81, 78,
                76, 79, 83, 88, 86, 83, 79, 76,
                74, 78, 81, 83, 86, 83, 79, 78,
            ),
            chord=(12, 19, 24),
            arpeggio=(12, 24, 19, 24),
            turnaround=(24, 26, 28, 31),
            drive=1.15,
        ),
    ),
    palette=EffectPalette(
        seed=2600,
        lead=sine,
        body=soft_square,
        noise=0.9,
        pickup=(79, 83, 88),
        respawn_run=(67, 71, 74, 79),
        checkpoint_run=(74, 79, 86),
        goal_run=(67, 71, 74, 79, 83),
    ),
    loop_kwargs={"kick": (110.0, 50.0), "lead": soft_square, "bass": triangle},
)


# Haunted Graveyard: D minor, slower, hollow triangle lead, three phrases.
HAUNTED = ThemePack(
    pack_id="haunted_graveyard_v1",
    bpm=96,
    seed=3100,
    phrases=(
        Phrase(
            roots=(38, 38, 34, 34, 41, 41, 45, 45),
            melody=(
                74, 77, 81, 77, 74, 72, 69, 72,
                70, 74, 77, 74, 70, 69, 65, 69,
                72, 69, 65, 69, 72, 77, 76, 72,
                68, 69, 72, 77, 74, 72, 69, 68,
            ),
            shifts=(0, 0, 0, 0, 0, 12, 0, 0),
            chord=(12, 19, 24),
            arpeggio=(12, 15, 19, 15),
            turnaround=(24, 22, 19, 15),
            drive=0.82,
        ),
        Phrase(
            roots=(38, 38, 34, 34, 41, 41, 45, 45),
            melody=(
                81, 84, 86, 84, 81, 77, 74, 77,
                79, 77, 74, 77, 79, 81, 84, 81,
                77, 74, 70, 74, 77, 81, 84, 86,
                84, 81, 77, 74, 72, 70, 69, 68,
            ),
            shifts=(0, 0, 0, 0, -12, 0, 0, 0),
            chord=(12, 19, 27),
            arpeggio=(24, 19, 15, 19),
            turnaround=(27, 24, 20, 19),
            drive=0.95,
        ),
        # The B section slides a semitone up into Eb and back, which is where the
        # graveyard gets its unease without leaving the scale for long.
        Phrase(
            roots=(39, 39, 44, 44, 38, 38, 45, 45),
            melody=(
                75, 78, 82, 78, 75, 73, 70, 73,
                80, 82, 75, 73, 70, 68, 70, 73,
                74, 77, 81, 77, 74, 72, 69, 72,
                68, 69, 72, 74, 77, 74, 72, 68,
            ),
            shifts=(0, 0, 0, 0, 0, 0, 12, 0),
            chord=(12, 18, 24),
            arpeggio=(12, 18, 24, 18),
            turnaround=(19, 18, 15, 12),
            drive=0.7,
        ),
    ),
    palette=EffectPalette(
        seed=3100,
        lead=triangle,
        body=soft_square,
        noise=1.25,
        low=0.86,
        pickup=(72, 77, 84),
        respawn_run=(57, 60, 65, 69),
        checkpoint_run=(69, 74, 81),
        goal_run=(62, 65, 69, 74, 77),
    ),
    loop_kwargs={
        "lead": triangle,
        "bass": sine,
        "kick": (85.0, 40.0),
        "pad_gain": 0.028,
        "hat_gain": 0.038,
    },
)


# Ice World: A major with an F# minor turn, bell-like sine lead, sparse and airy.
ICE_WORLD = ThemePack(
    pack_id="ice_world_v1",
    bpm=100,
    seed=3700,
    phrases=(
        Phrase(
            roots=(45, 45, 42, 42, 38, 38, 40, 40),
            melody=(
                81, 85, 88, 85, 81, 80, 78, 80,
                76, 78, 81, 85, 81, 78, 76, 73,
                74, 78, 81, 78, 74, 73, 71, 73,
                76, 78, 80, 81, 83, 81, 78, 76,
            ),
            shifts=(0, 0, 0, 0, 0, 12, 0, 0),
            chord=(12, 19, 28),
            arpeggio=(12, 19, 28, 19),
            turnaround=(28, 24, 21, 19),
            drive=0.78,
        ),
        Phrase(
            roots=(45, 45, 42, 42, 38, 38, 40, 40),
            melody=(
                88, 85, 81, 85, 88, 90, 88, 85,
                83, 81, 78, 76, 78, 81, 83, 85,
                81, 78, 74, 78, 81, 85, 88, 90,
                88, 85, 81, 78, 76, 74, 73, 76,
            ),
            shifts=(0, 0, 0, 0, -12, 0, 0, 0),
            chord=(12, 16, 23),
            arpeggio=(24, 28, 31, 28),
            turnaround=(31, 28, 24, 21),
            drive=0.92,
        ),
        Phrase(
            roots=(42, 42, 38, 38, 45, 45, 40, 40),
            melody=(
                78, 81, 85, 81, 78, 76, 73, 76,
                74, 78, 81, 78, 74, 73, 71, 69,
                81, 85, 88, 85, 81, 78, 76, 78,
                80, 81, 83, 85, 88, 85, 81, 80,
            ),
            shifts=(0, 0, 0, 0, 12, 0, 0, 0),
            chord=(12, 19, 24),
            arpeggio=(12, 24, 19, 24),
            turnaround=(24, 21, 19, 16),
            drive=1.05,
        ),
    ),
    palette=EffectPalette(
        seed=3700,
        lead=sine,
        body=triangle,
        noise=0.78,
        low=1.1,
        pickup=(85, 90, 93),
        respawn_run=(69, 73, 76, 81),
        checkpoint_run=(76, 81, 88),
        goal_run=(69, 73, 76, 81, 85),
    ),
    loop_kwargs={
        "lead": sine,
        "counter": triangle,
        "bass": triangle,
        "kick": (95.0, 45.0),
        "lead_gain": 0.115,
        "arpeggio_gain": 0.036,
        "hat_gain": 0.042,
    },
)


THEME_PACKS: tuple[ThemePack, ...] = (GREEN_HILLS, HAUNTED, ICE_WORLD)


def generate_pack(pack: ThemePack) -> None:
    output_dir = REPO_ROOT / "audio" / pack.pack_id
    loop = render_phrased_loop(
        pack.bpm,
        pack.phrases,
        seed=pack.seed,
        **(pack.loop_kwargs or {}),  # type: ignore[arg-type]
    )
    write_wav(output_dir / "gameplay_loop.wav", loop)
    effects = themed_effects(pack.palette)
    for cue, samples in effects.items():
        write_wav(output_dir / f"{cue}.wav", samples)
    print(
        f"Generated {1 + len(effects)} audio files in {output_dir.relative_to(REPO_ROOT)} "
        f"({pack.bars} bars at {pack.bpm} BPM)"
    )


def main() -> None:
    requested = sys.argv[1:]
    packs = THEME_PACKS
    if requested:
        by_id = {pack.pack_id: pack for pack in THEME_PACKS}
        unknown = [name for name in requested if name not in by_id]
        if unknown:
            known = ", ".join(by_id)
            raise SystemExit(f"Unknown pack(s): {', '.join(unknown)}. Known packs: {known}")
        packs = tuple(by_id[name] for name in requested)
    for pack in packs:
        generate_pack(pack)
    print("Run tools/generate_boss_music.py to refresh the shared boss loop in every pack.")


if __name__ == "__main__":
    main()
