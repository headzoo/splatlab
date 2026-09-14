#!/usr/bin/env python3
"""Validate Splat Lab! sound-pack specs and their local WAV assets."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import wave
from array import array
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parent.parent
ASSET_ID = re.compile(r"^[a-z0-9_]+$")

# Loop-seam limits. A music loop is played end to end forever, so the last frame
# has to carry the same material as the first one. The original packs faded every
# voice to zero before the buffer ended, which read as a rhythmic hole on repeat.
SEAM_WINDOW_SECONDS = 0.025
SEAM_SILENCE_FLOOR = 0.005  # about -46 dBFS
MAX_SEAM_STEP = 0.05
MAX_EDGE_SILENCE_SECONDS = 0.005
MIN_SEAM_ENERGY_RATIO = 0.15
REQUIRED_EFFECTS = {
    "jump",
    "land",
    "collectible",
    "enemy_defeat",
    "player_damage",
    "player_death",
    "respawn",
    "weapon_swing",
    "weapon_hit",
    "fire",
    "checkpoint",
    "goal",
}


class AudioSpecError(ValueError):
    """Raised when a sound pack cannot safely enter the runtime registry."""


def _number(value: Any, field: str, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise AudioSpecError(f"{field} must be a number")
    number = float(value)
    if number < minimum or number > maximum:
        raise AudioSpecError(f"{field} must be from {minimum} to {maximum}")
    return number


def _audio_path(value: Any, pack_id: str, repo_root: Path) -> Path:
    if not isinstance(value, str) or not value:
        raise AudioSpecError("audio path must be a non-empty string")
    path = (repo_root / value).resolve()
    expected_root = (repo_root / "audio" / pack_id).resolve()
    try:
        path.relative_to(expected_root)
    except ValueError as exc:
        raise AudioSpecError(f"audio path must stay under audio/{pack_id}/") from exc
    if path.suffix.lower() != ".wav" or not path.is_file():
        raise AudioSpecError(f"audio file is missing or is not WAV: {value}")
    return path


def _inspect_wav(
    path: Path,
    field: str,
    minimum_duration: float,
    maximum_duration: float,
    repo_root: Path,
) -> dict[str, Any]:
    try:
        with wave.open(str(path), "rb") as source:
            channels = source.getnchannels()
            sample_width = source.getsampwidth()
            sample_rate = source.getframerate()
            frame_count = source.getnframes()
    except (OSError, wave.Error) as exc:
        raise AudioSpecError(f"{field} is not a readable WAV: {exc}") from exc
    if channels not in {1, 2}:
        raise AudioSpecError(f"{field} must be mono or stereo")
    if sample_width != 2:
        raise AudioSpecError(f"{field} must use 16-bit PCM")
    if sample_rate not in {22_050, 44_100, 48_000}:
        raise AudioSpecError(f"{field} uses unsupported sample rate {sample_rate}")
    duration = frame_count / sample_rate
    if duration < minimum_duration or duration > maximum_duration:
        raise AudioSpecError(
            f"{field} duration must be from {minimum_duration} to {maximum_duration} seconds"
        )
    return {
        "path": str(path.relative_to(repo_root)),
        "channels": channels,
        "sampleRate": sample_rate,
        "frameCount": frame_count,
        "durationSec": round(duration, 3),
    }


def _read_samples(path: Path, field: str) -> tuple[array, int, int, int]:
    try:
        with wave.open(str(path), "rb") as source:
            channels = source.getnchannels()
            sample_rate = source.getframerate()
            frame_count = source.getnframes()
            raw = source.readframes(frame_count)
    except (OSError, wave.Error) as exc:
        raise AudioSpecError(f"{field} could not be read for loop analysis: {exc}") from exc
    samples = array("h")
    samples.frombytes(raw)
    if sys.byteorder == "big":
        samples.byteswap()
    if not samples:
        raise AudioSpecError(f"{field} contains no audio frames")
    return samples, channels, sample_rate, frame_count


def _rms(samples: Any) -> float:
    if not len(samples):
        return 0.0
    return math.sqrt(sum(value * value for value in samples) / len(samples)) / 32768


def _edge_silence_frames(samples: array, channels: int, frame_count: int, reverse: bool) -> int:
    floor_value = SEAM_SILENCE_FLOOR * 32768
    order = range(frame_count - 1, -1, -1) if reverse else range(frame_count)
    silent = 0
    for frame in order:
        base = frame * channels
        if any(abs(samples[base + channel]) >= floor_value for channel in range(channels)):
            break
        silent += 1
    return silent


def loop_seam_report(path: Path, field: str = "loop") -> dict[str, Any]:
    """Measure how cleanly a buffer joins back to its own start.

    Reports the per-channel sample step across the join, the energy at each edge
    relative to the whole file, and how much near-silence sits at each edge.
    """
    samples, channels, sample_rate, frame_count = _read_samples(path, field)
    overall = _rms(samples)
    window = max(1, int(SEAM_WINDOW_SECONDS * sample_rate)) * channels
    leading = _edge_silence_frames(samples, channels, frame_count, reverse=False)
    trailing = _edge_silence_frames(samples, channels, frame_count, reverse=True)
    last_frame = (frame_count - 1) * channels
    return {
        "channels": channels,
        "sampleRate": sample_rate,
        "frameCount": frame_count,
        "overallRms": overall,
        "headEnergyRatio": (_rms(samples[:window]) / overall) if overall else 0.0,
        "tailEnergyRatio": (_rms(samples[-window:]) / overall) if overall else 0.0,
        "seamStep": max(
            abs(samples[last_frame + channel] - samples[channel]) / 32768
            for channel in range(channels)
        ),
        "leadingSilenceSec": leading / sample_rate,
        "trailingSilenceSec": trailing / sample_rate,
    }


def _check_loop_seam(path: Path, field: str) -> dict[str, Any]:
    report = loop_seam_report(path, field)
    if report["overallRms"] <= 0:
        raise AudioSpecError(f"{field} is silent")
    if report["seamStep"] > MAX_SEAM_STEP:
        raise AudioSpecError(
            f"{field} jumps {report['seamStep']:.3f} full scale between its last and first frame, "
            f"which clicks on every repeat (limit {MAX_SEAM_STEP})"
        )
    for edge in ("leading", "trailing"):
        silence = report[f"{edge}SilenceSec"]
        if silence > MAX_EDGE_SILENCE_SECONDS:
            raise AudioSpecError(
                f"{field} has {silence * 1000:.1f} ms of {edge} silence, which opens a hole at the "
                f"loop point (limit {MAX_EDGE_SILENCE_SECONDS * 1000:.0f} ms). Let sustained voices "
                "run past the buffer end and wrap to the front instead of fading to zero."
            )
    for edge in ("head", "tail"):
        ratio = report[f"{edge}EnergyRatio"]
        if ratio < MIN_SEAM_ENERGY_RATIO:
            raise AudioSpecError(
                f"{field} carries only {ratio:.2f} of its average level in the "
                f"{SEAM_WINDOW_SECONDS * 1000:.0f} ms at its {edge}, so the loop audibly dips when "
                f"it repeats (minimum {MIN_SEAM_ENERGY_RATIO})"
            )
    return report


def _check_tempo(tempo: Any, field: str, sample_rate: int, frame_count: int) -> dict[str, Any]:
    if not isinstance(tempo, dict):
        raise AudioSpecError(f"{field}.tempo must be an object with bpm and bars")
    bpm = _number(tempo.get("bpm"), f"{field}.tempo.bpm", 20, 300)
    bars = tempo.get("bars")
    if isinstance(bars, bool) or not isinstance(bars, int) or not 1 <= bars <= 512:
        raise AudioSpecError(f"{field}.tempo.bars must be an integer from 1 to 512")
    beats_per_bar = tempo.get("beatsPerBar", 4)
    if isinstance(beats_per_bar, bool) or not isinstance(beats_per_bar, int) or not 1 <= beats_per_bar <= 16:
        raise AudioSpecError(f"{field}.tempo.beatsPerBar must be an integer from 1 to 16")
    expected = beats_per_bar * bars * 60 * sample_rate / bpm
    if abs(expected - frame_count) > 1e-9:
        raise AudioSpecError(
            f"{field} is {frame_count} frames but {bars} bars at {bpm:g} BPM is {expected:g} frames "
            f"at {sample_rate} Hz. A fractional frame at the loop point reopens the seam; pick a "
            "tempo that divides the sample rate evenly."
        )
    return {"bpm": bpm, "bars": bars, "beatsPerBar": beats_per_bar}


def load_audio_spec(path: Path, repo_root: Path = REPO_ROOT) -> dict[str, Any]:
    try:
        spec = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise AudioSpecError(f"cannot read sound pack: {exc}") from exc
    if not isinstance(spec, dict) or spec.get("schemaVersion") != 1:
        raise AudioSpecError("sound pack schemaVersion must be 1")
    pack_id = spec.get("id")
    if not isinstance(pack_id, str) or ASSET_ID.fullmatch(pack_id) is None:
        raise AudioSpecError("sound pack id must be a stable lowercase ID")
    if path.stem != pack_id:
        raise AudioSpecError(f"sound pack filename must be {pack_id}.json")
    if spec.get("kind") != "sound_pack":
        raise AudioSpecError("kind must be sound_pack")
    if not isinstance(spec.get("name"), str) or not spec["name"].strip():
        raise AudioSpecError("name must be a non-empty string")
    themes = spec.get("themeTags")
    if not isinstance(themes, list) or not themes or any(
        not isinstance(theme, str) or ASSET_ID.fullmatch(theme) is None for theme in themes
    ):
        raise AudioSpecError("themeTags must contain stable lowercase IDs")

    music_entries = spec.get("music")
    if not isinstance(music_entries, dict) or not isinstance(music_entries.get("gameplay"), dict):
        raise AudioSpecError("music.gameplay must be an object")
    music: dict[str, dict[str, Any]] = {}
    for cue, entry in music_entries.items():
        if ASSET_ID.fullmatch(cue) is None or not isinstance(entry, dict):
            raise AudioSpecError(f"invalid music entry: {cue}")
        if entry.get("loop") is not True:
            raise AudioSpecError(f"music.{cue}.loop must be true")
        asset_id = entry.get("assetId")
        if not isinstance(asset_id, str) or ASSET_ID.fullmatch(asset_id) is None:
            raise AudioSpecError(f"music.{cue}.assetId must be a stable lowercase ID")
        name = entry.get("name", cue.replace("_", " ").title())
        if not isinstance(name, str) or not name.strip():
            raise AudioSpecError(f"music.{cue}.name must be a non-empty string")
        music_path = _audio_path(entry.get("path"), pack_id, repo_root)
        item = _inspect_wav(music_path, f"music.{cue}", 8, 120, repo_root)
        item["assetId"] = asset_id
        item["name"] = name.strip()
        item["loop"] = True
        item["defaultGain"] = _number(entry.get("defaultGain"), f"music.{cue}.defaultGain", 0, 1)
        item["tempo"] = _check_tempo(
            entry.get("tempo"), f"music.{cue}", item["sampleRate"], item["frameCount"]
        )
        _check_loop_seam(music_path, f"music.{cue}")
        music[cue] = item

    effects = spec.get("effects")
    if not isinstance(effects, dict):
        raise AudioSpecError("effects must be an object")
    missing = REQUIRED_EFFECTS - effects.keys()
    if missing:
        raise AudioSpecError(f"effects are missing required cues: {', '.join(sorted(missing))}")
    normalized_effects: dict[str, dict[str, Any]] = {}
    for cue, entry in effects.items():
        if ASSET_ID.fullmatch(cue) is None or not isinstance(entry, dict):
            raise AudioSpecError(f"invalid effect entry: {cue}")
        effect_path = _audio_path(entry.get("path"), pack_id, repo_root)
        item = _inspect_wav(effect_path, f"effects.{cue}", 0.04, 3, repo_root)
        item["defaultGain"] = _number(entry.get("defaultGain"), f"effects.{cue}.defaultGain", 0, 1)
        voices = entry.get("maxVoices")
        if isinstance(voices, bool) or not isinstance(voices, int) or not 1 <= voices <= 8:
            raise AudioSpecError(f"effects.{cue}.maxVoices must be an integer from 1 to 8")
        item["maxVoices"] = voices
        normalized_effects[cue] = item
    return {
        "id": pack_id,
        "name": spec["name"].strip(),
        "themeTags": themes,
        "music": music,
        "effects": normalized_effects,
    }


def validate_all(repo_root: Path = REPO_ROOT) -> list[dict[str, Any]]:
    specs = sorted((repo_root / "audio-specs").glob("*.json"))
    if not specs:
        raise AudioSpecError("no sound-pack specs found")
    return [load_audio_spec(path, repo_root) for path in specs]


def write_loop_join(source: Path, destination: Path) -> None:
    """Write the loop back to back with itself so a human can hear the join."""
    samples, channels, sample_rate, frame_count = _read_samples(source, str(source))
    destination.parent.mkdir(parents=True, exist_ok=True)
    doubled = array("h", samples)
    doubled.extend(samples)
    if sys.byteorder == "big":
        doubled.byteswap()
    with wave.open(str(destination), "wb") as output:
        output.setnchannels(channels)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        output.writeframes(doubled.tobytes())


def loopcheck(paths: list[Path], join_path: Path | None) -> int:
    if not paths:
        print("loopcheck needs at least one WAV path")
        return 1
    if join_path is not None and len(paths) != 1:
        print("--write-join takes exactly one WAV path")
        return 1
    failed = False
    for path in paths:
        try:
            report = loop_seam_report(path, str(path))
            _check_loop_seam(path, str(path))
            status = "PASS"
        except AudioSpecError as exc:
            report = None
            status = f"FAIL {exc}"
            failed = True
        if report is not None:
            print(
                f"PASS {path}: {report['frameCount']} frames, {report['channels']} channels, "
                f"seam step {report['seamStep']:.4f}, head energy {report['headEnergyRatio']:.2f}, "
                f"tail energy {report['tailEnergyRatio']:.2f}, edge silence "
                f"{report['leadingSilenceSec'] * 1000:.1f} ms / "
                f"{report['trailingSilenceSec'] * 1000:.1f} ms"
            )
        else:
            print(f"{status}")
    if join_path is not None and not failed:
        write_loop_join(paths[0], join_path)
        print(f"Wrote loop join preview to {join_path}")
    return 1 if failed else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["validate", "loopcheck"])
    parser.add_argument("paths", nargs="*", type=Path, help="WAV files to inspect with loopcheck")
    parser.add_argument(
        "--write-join",
        type=Path,
        default=None,
        help="write the loop concatenated with itself so the join can be auditioned",
    )
    args = parser.parse_args()
    if args.command == "loopcheck":
        return loopcheck(args.paths, args.write_join)
    try:
        packs = validate_all()
    except AudioSpecError as exc:
        print(f"Audio validation failed: {exc}")
        return 1
    for pack in packs:
        print(f"PASS {pack['id']}: {len(pack['music'])} music loops, {len(pack['effects'])} effects")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
