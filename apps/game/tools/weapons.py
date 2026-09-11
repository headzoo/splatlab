#!/usr/bin/env python3
"""Validate Splat Lab! weapon specs used by trusted runtimes."""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parent.parent
ASSET_ID = re.compile(r"^[a-z][a-z0-9_]*$")
SUPPORTED_RUNTIMES = {"platformer_v1"}
SUPPORTED_KINDS = {"melee_weapon"}
SUPPORTED_DIRECTIONS = {"left", "right"}
SUPPORTED_LAYERS = {"behind", "front"}


class WeaponSpecError(ValueError):
    """Raised when a weapon spec cannot safely enter the runtime registry."""


def _number(value: Any, field: str, minimum: float, maximum: float) -> float:
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
    ):
        raise WeaponSpecError(f"{field} must be a finite number")
    number = float(value)
    if number < minimum or number > maximum:
        raise WeaponSpecError(f"{field} must be from {minimum} to {maximum}")
    return number


def _stable_id(value: Any, field: str) -> str:
    if not isinstance(value, str) or ASSET_ID.fullmatch(value) is None:
        raise WeaponSpecError(f"{field} must be a stable lowercase ID")
    return value


def _load_sprite_recipe(asset_id: str, repo_root: Path) -> dict[str, Any]:
    path = repo_root / "sprite-specs" / f"{asset_id}.json"
    try:
        recipe = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise WeaponSpecError(f"sprite recipe is missing: {path.relative_to(repo_root)}") from exc
    except (OSError, json.JSONDecodeError) as exc:
        raise WeaponSpecError(f"cannot read sprite recipe {path.name}: {exc}") from exc
    if not isinstance(recipe, dict) or recipe.get("id") != asset_id:
        raise WeaponSpecError(f"sprite recipe {path.name} does not declare {asset_id}")
    return recipe


def load_weapon_spec(path: Path, repo_root: Path = REPO_ROOT) -> dict[str, Any]:
    try:
        spec = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise WeaponSpecError(f"cannot read weapon spec: {exc}") from exc
    if not isinstance(spec, dict) or spec.get("schemaVersion") != 1:
        raise WeaponSpecError("weapon spec schemaVersion must be 1")

    weapon_id = _stable_id(spec.get("id"), "id")
    if path.stem != weapon_id:
        raise WeaponSpecError(f"weapon spec filename must be {weapon_id}.json")
    if spec.get("kind") not in SUPPORTED_KINDS:
        raise WeaponSpecError("kind must be melee_weapon")
    if spec.get("runtime") not in SUPPORTED_RUNTIMES:
        raise WeaponSpecError("runtime must be platformer_v1")
    if not isinstance(spec.get("name"), str) or not spec["name"].strip():
        raise WeaponSpecError("name must be a non-empty string")

    mechanics = spec.get("mechanics")
    if not isinstance(mechanics, dict):
        raise WeaponSpecError("mechanics must be an object")
    damage = _number(mechanics.get("damage"), "mechanics.damage", 1, 10)
    reach = _number(mechanics.get("reachTiles"), "mechanics.reachTiles", 0.25, 2)
    attack_duration = _number(
        mechanics.get("attackDurationMs"), "mechanics.attackDurationMs", 100, 2_000
    )
    active_start = _number(
        mechanics.get("activeStartMs"), "mechanics.activeStartMs", 0, attack_duration
    )
    active_end = _number(
        mechanics.get("activeEndMs"), "mechanics.activeEndMs", active_start, attack_duration
    )
    cooldown = _number(
        mechanics.get("cooldownMs"), "mechanics.cooldownMs", attack_duration, 3_000
    )
    knockback = _number(
        mechanics.get("knockbackTiles"), "mechanics.knockbackTiles", 0, 2
    )

    visual = spec.get("visual")
    if not isinstance(visual, dict):
        raise WeaponSpecError("visual must be an object")
    sprite_asset_id = _stable_id(visual.get("spriteAssetId"), "visual.spriteAssetId")
    attack_event_id = _stable_id(visual.get("attackEventId"), "visual.attackEventId")
    sword_recipe = _load_sprite_recipe(sprite_asset_id, repo_root)
    if sword_recipe.get("kind") != "weapon":
        raise WeaponSpecError("visual.spriteAssetId must reference a weapon sprite recipe")
    sword_sheet = sword_recipe.get("sheet", {})
    if sword_sheet.get("columns") != 1 or sword_sheet.get("rows") != 1:
        raise WeaponSpecError("the first melee weapon sprite must be a single frame")

    grip = visual.get("grip")
    if not isinstance(grip, dict):
        raise WeaponSpecError("visual.grip must be an object")
    grip_x = _number(grip.get("x"), "visual.grip.x", 0, sword_sheet.get("frameWidth", 0))
    grip_y = _number(grip.get("y"), "visual.grip.y", 0, sword_sheet.get("frameHeight", 0))

    characters = visual.get("characters")
    if not isinstance(characters, dict) or not characters:
        raise WeaponSpecError("visual.characters must contain at least one compatible character")
    public_characters: dict[str, Any] = {}
    expected_frames: int | None = None
    for character_id, character_visual in characters.items():
        _stable_id(character_id, "visual.characters key")
        if not isinstance(character_visual, dict):
            raise WeaponSpecError(f"visual.characters.{character_id} must be an object")
        character_recipe = _load_sprite_recipe(character_id, repo_root)
        event_sheet = character_recipe.get("eventSheets", {}).get(attack_event_id)
        if not isinstance(event_sheet, dict):
            raise WeaponSpecError(
                f"{character_id} must declare eventSheets.{attack_event_id}"
            )
        frame_count = event_sheet.get("sheet", {}).get("columns", 0) * event_sheet.get(
            "sheet", {}
        ).get("rows", 0)
        if frame_count <= 0 or frame_count % 2:
            raise WeaponSpecError(f"{character_id} attack event must have two equal direction rows")
        frames_per_direction = frame_count // 2
        if expected_frames is None:
            expected_frames = frames_per_direction
        elif expected_frames != frames_per_direction:
            raise WeaponSpecError("all visible character attacks must use the same frame count")

        directions = character_visual.get("directions")
        if not isinstance(directions, dict) or set(directions) != SUPPORTED_DIRECTIONS:
            raise WeaponSpecError(
                f"visual.characters.{character_id}.directions must contain left and right"
            )
        public_directions: dict[str, list[dict[str, Any]]] = {}
        for direction, frames in directions.items():
            if not isinstance(frames, list) or len(frames) != frames_per_direction:
                raise WeaponSpecError(
                    f"visual.characters.{character_id}.directions.{direction} must contain "
                    f"{frames_per_direction} frames"
                )
            public_frames = []
            for index, frame in enumerate(frames):
                prefix = f"visual.characters.{character_id}.directions.{direction}[{index}]"
                if not isinstance(frame, dict) or frame.get("layer") not in SUPPORTED_LAYERS:
                    raise WeaponSpecError(f"{prefix}.layer must be behind or front")
                public_frames.append(
                    {
                        "offsetX": _number(frame.get("offsetX"), f"{prefix}.offsetX", -64, 64),
                        "offsetY": _number(frame.get("offsetY"), f"{prefix}.offsetY", -64, 64),
                        "rotationDegrees": _number(
                            frame.get("rotationDegrees"),
                            f"{prefix}.rotationDegrees",
                            -360,
                            360,
                        ),
                        "layer": frame["layer"],
                    }
                )
            public_directions[direction] = public_frames
        public_characters[character_id] = {"directions": public_directions}

    return {
        "schemaVersion": 1,
        "id": weapon_id,
        "name": spec["name"].strip(),
        "kind": spec["kind"],
        "runtime": spec["runtime"],
        "mechanics": {
            "damage": damage,
            "reachTiles": reach,
            "attackDurationMs": attack_duration,
            "activeStartMs": active_start,
            "activeEndMs": active_end,
            "cooldownMs": cooldown,
            "knockbackTiles": knockback,
        },
        "visual": {
            "spriteAssetId": sprite_asset_id,
            "attackEventId": attack_event_id,
            "grip": {"x": grip_x, "y": grip_y},
            "characters": public_characters,
        },
        "source": str(path.relative_to(repo_root)),
    }


def discover_weapon_specs(
    repo_root: Path = REPO_ROOT, spec_dir: Path | None = None
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    spec_dir = spec_dir or repo_root / "weapon-specs"
    weapons: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    seen: set[str] = set()
    for path in sorted(spec_dir.glob("*.json")):
        try:
            weapon = load_weapon_spec(path, repo_root)
            if weapon["id"] in seen:
                raise WeaponSpecError(f"duplicate weapon id: {weapon['id']}")
            seen.add(weapon["id"])
            weapons.append(weapon)
        except WeaponSpecError as exc:
            errors.append({"spec": path.name, "message": str(exc)})
    return weapons, errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("validate",))
    parser.add_argument("specs", nargs="*")
    args = parser.parse_args()
    paths = [REPO_ROOT / value for value in args.specs]
    if not paths:
        paths = sorted((REPO_ROOT / "weapon-specs").glob("*.json"))
    failed = False
    for path in paths:
        try:
            weapon = load_weapon_spec(path)
            print(f"PASS {weapon['id']}: {weapon['name']}")
        except WeaponSpecError as exc:
            failed = True
            print(f"FAIL {path.name}: {exc}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
