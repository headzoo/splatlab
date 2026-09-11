#!/usr/bin/env python3
"""Validate Splat Lab! sound-pack specs and their local WAV assets."""

from __future__ import annotations

import argparse
import json
import re
import wave
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parent.parent
ASSET_ID = re.compile(r"^[a-z0-9_]+$")
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
        "durationSec": round(duration, 3),
    }


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

    gameplay = spec.get("music", {}).get("gameplay")
    if not isinstance(gameplay, dict):
        raise AudioSpecError("music.gameplay must be an object")
    if gameplay.get("loop") is not True:
        raise AudioSpecError("music.gameplay.loop must be true")
    asset_id = gameplay.get("assetId")
    if not isinstance(asset_id, str) or ASSET_ID.fullmatch(asset_id) is None:
        raise AudioSpecError("music.gameplay.assetId must be a stable lowercase ID")
    music_path = _audio_path(gameplay.get("path"), pack_id, repo_root)
    music = _inspect_wav(music_path, "music.gameplay", 8, 120, repo_root)
    music["defaultGain"] = _number(gameplay.get("defaultGain"), "music.gameplay.defaultGain", 0, 1)

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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["validate"])
    parser.parse_args()
    try:
        packs = validate_all()
    except AudioSpecError as exc:
        print(f"Audio validation failed: {exc}")
        return 1
    for pack in packs:
        print(f"PASS {pack['id']}: 1 music loop, {len(pack['effects'])} effects")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
