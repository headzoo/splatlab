#!/usr/bin/env python3
"""Validate and inspect Splat Lab's versioned physics profiles."""

from __future__ import annotations

import argparse
import copy
import json
import math
import re
import sys
from pathlib import Path
from typing import Any, Iterable


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SPEC_DIR = REPO_ROOT / "physics-specs"
DEFAULT_GAME_SPEC_DIR = REPO_ROOT / "game-physics"
REGISTRY_PATH = DEFAULT_SPEC_DIR / "registry.json"
PROFILE_ID_PATTERN = re.compile(r"^[a-z][a-z0-9_]*_v[0-9]+$")
SUPPORTED_RUNTIMES = {"top_down_v1", "platformer_v1"}
PLATFORMER_EDITABLE_PATHS = {
    "/movement/maximumRunSpeedTilesPerSecond",
    "/movement/groundTimeToMaximumSpeedSeconds",
    "/movement/groundTimeToStopSeconds",
    "/movement/airTimeToMaximumSpeedSeconds",
    "/verticalMovement/mode",
    "/verticalMovement/groundedJump/jumpHeightTiles",
    "/verticalMovement/groundedJump/timeToApexSeconds",
    "/verticalMovement/groundedJump/maximumFallSpeedTilesPerSecond",
    "/verticalMovement/groundedJump/coyoteTimeTicks",
    "/verticalMovement/groundedJump/inputBufferTicks",
    "/verticalMovement/groundedJump/earlyReleaseVelocityMultiplier",
    "/verticalMovement/flight/maximumRiseSpeedTilesPerSecond",
    "/verticalMovement/flight/maximumFallSpeedTilesPerSecond",
    "/verticalMovement/flight/timeToMaximumSpeedSeconds",
    "/verticalMovement/flight/timeToStopSeconds",
}
TOP_DOWN_EDITABLE_PATHS = {
    "/movement/maximumSpeedTilesPerSecond",
}


class PhysicsSpecError(RuntimeError):
    """Raised when a physics profile cannot be loaded or is invalid."""


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _mapping(parent: dict[str, Any], key: str, errors: list[str]) -> dict[str, Any]:
    value = parent.get(key)
    if not isinstance(value, dict):
        errors.append(f"{key} must be an object")
        return {}
    return value


def _reject_unknown(
    value: dict[str, Any], allowed: set[str], label: str, errors: list[str]
) -> None:
    unknown = sorted(set(value) - allowed)
    if unknown:
        errors.append(f"{label} has unknown fields: {', '.join(unknown)}")


def _number(
    parent: dict[str, Any],
    key: str,
    errors: list[str],
    *,
    positive: bool = False,
) -> float | None:
    value = parent.get(key)
    if not _is_number(value):
        errors.append(f"{key} must be a finite number")
        return None
    result = float(value)
    if positive and result <= 0:
        errors.append(f"{key} must be greater than zero")
        return None
    return result


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PhysicsSpecError(f"Cannot read {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise PhysicsSpecError(f"{path}: root must be a JSON object")
    return value


def discover_profiles(spec_dir: Path = DEFAULT_SPEC_DIR) -> list[Path]:
    return sorted(
        path
        for path in spec_dir.glob("*.json")
        if path.name not in {"registry.json", "physics-profile.schema.json"}
    )


def discover_game_physics(spec_dir: Path = DEFAULT_GAME_SPEC_DIR) -> list[Path]:
    return sorted(path for path in spec_dir.glob("*.json") if not path.name.endswith(".schema.json"))


def derive_platformer_metrics(profile: dict[str, Any]) -> dict[str, float]:
    """Return the ideal no-collision jump envelope implied by a valid profile."""
    tile_size = float(profile["units"]["tileSizePx"])
    gravity = float(profile["gravity"]["accelerationPxPerSecondSquared"])
    launch_speed = abs(float(profile["jump"]["launchVelocityYPxPerSecond"]))
    run_speed = float(profile["movement"]["maxRunSpeedPxPerSecond"])
    time_to_apex = launch_speed / gravity
    same_height_flight = 2 * time_to_apex
    apex_height = launch_speed * launch_speed / (2 * gravity)
    range_at_max_speed = run_speed * same_height_flight
    launch_angle = math.degrees(math.atan2(launch_speed, run_speed))
    return {
        "apexHeightPx": apex_height,
        "apexHeightTiles": apex_height / tile_size,
        "timeToApexSeconds": time_to_apex,
        "sameHeightFlightSeconds": same_height_flight,
        "sameHeightRangeAtMaxSpeedPx": range_at_max_speed,
        "sameHeightRangeAtMaxSpeedTiles": range_at_max_speed / tile_size,
        "launchAngleAtMaxSpeedDegrees": launch_angle,
    }


def derive_top_down_metrics(profile: dict[str, Any]) -> dict[str, float]:
    tile_size = float(profile["units"]["tileSizePx"])
    speed = float(profile["movement"]["maxSpeedPxPerSecond"])
    return {
        "secondsPerTileAtMaxSpeed": tile_size / speed,
        "tilesPerSecondAtMaxSpeed": speed / tile_size,
    }


def _bounded_number(
    parent: dict[str, Any],
    key: str,
    errors: list[str],
    minimum: float,
    maximum: float,
    label: str,
) -> float | None:
    value = _number(parent, key, errors)
    if value is not None and not minimum <= value <= maximum:
        errors.append(f"{label}.{key} must be between {minimum} and {maximum}")
        return None
    return value


def validate_game_physics(
    game_spec: dict[str, Any],
    profiles_by_id: dict[str, dict[str, Any]],
    path: Path | None = None,
) -> list[str]:
    """Validate one user/Cooper-editable per-game physics document."""
    errors: list[str] = []
    _reject_unknown(
        game_spec,
        {
            "schemaVersion",
            "id",
            "revision",
            "runtime",
            "baseProfileId",
            "movement",
            "verticalMovement",
            "editPolicy",
            "provenance",
        },
        "game physics",
        errors,
    )
    if game_spec.get("schemaVersion") != 1:
        errors.append("game physics schemaVersion must be 1")
    spec_id = game_spec.get("id")
    if not isinstance(spec_id, str) or not re.fullmatch(r"^[a-z][a-z0-9_-]*$", spec_id):
        errors.append("game physics id must be lowercase kebab or snake case")
    elif path is not None and path.stem != spec_id:
        errors.append(f"game physics filename must be {spec_id}.json")
    revision = game_spec.get("revision")
    if not isinstance(revision, int) or isinstance(revision, bool) or revision < 1:
        errors.append("game physics revision must be a positive integer")
    runtime = game_spec.get("runtime")
    if runtime not in SUPPORTED_RUNTIMES:
        errors.append(f"game physics runtime must be one of {sorted(SUPPORTED_RUNTIMES)}")
    base_profile_id = game_spec.get("baseProfileId")
    base_profile = profiles_by_id.get(base_profile_id)
    if base_profile is None:
        errors.append(f"baseProfileId references missing profile {base_profile_id}")
    elif base_profile.get("runtime") != runtime:
        errors.append("game physics runtime must match its base profile runtime")

    movement = _mapping(game_spec, "movement", errors)
    if runtime == "platformer_v1":
        _reject_unknown(
            movement,
            {
                "maximumRunSpeedTilesPerSecond",
                "groundTimeToMaximumSpeedSeconds",
                "groundTimeToStopSeconds",
                "airTimeToMaximumSpeedSeconds",
            },
            "movement",
            errors,
        )
        _bounded_number(movement, "maximumRunSpeedTilesPerSecond", errors, 0.5, 12, "movement")
        for key in (
            "groundTimeToMaximumSpeedSeconds",
            "groundTimeToStopSeconds",
            "airTimeToMaximumSpeedSeconds",
        ):
            _bounded_number(movement, key, errors, 0.05, 2, "movement")
        errors.extend(_validate_game_vertical_movement(game_spec))
        expected_paths = PLATFORMER_EDITABLE_PATHS
    elif runtime == "top_down_v1":
        _reject_unknown(
            movement,
            {"maximumSpeedTilesPerSecond"},
            "movement",
            errors,
        )
        _bounded_number(movement, "maximumSpeedTilesPerSecond", errors, 0.5, 12, "movement")
        if "verticalMovement" in game_spec:
            errors.append("top_down_v1 game physics must not define verticalMovement")
        expected_paths = TOP_DOWN_EDITABLE_PATHS
    else:
        expected_paths = set()

    edit_policy = _mapping(game_spec, "editPolicy", errors)
    _reject_unknown(
        edit_policy,
        {"agentEditable", "applyTiming", "allowedPaths"},
        "editPolicy",
        errors,
    )
    if edit_policy.get("agentEditable") is not True:
        errors.append("editPolicy.agentEditable must be true")
    if edit_policy.get("applyTiming") != "next_simulation_reset":
        errors.append("editPolicy.applyTiming must be next_simulation_reset")
    allowed_paths = edit_policy.get("allowedPaths")
    if not isinstance(allowed_paths, list) or not all(isinstance(value, str) for value in allowed_paths):
        errors.append("editPolicy.allowedPaths must be a string list")
    elif len(set(allowed_paths)) != len(allowed_paths):
        errors.append("editPolicy.allowedPaths cannot contain duplicates")
    elif set(allowed_paths) != expected_paths:
        errors.append("editPolicy.allowedPaths must match the runtime's supported tuning fields")

    provenance = _mapping(game_spec, "provenance", errors)
    _reject_unknown(provenance, {"lastEditedBy", "lastPrompt"}, "provenance", errors)
    if provenance.get("lastEditedBy") not in {"system_default", "user", "cooper"}:
        errors.append("provenance.lastEditedBy is invalid")
    last_prompt = provenance.get("lastPrompt")
    if last_prompt is not None and not isinstance(last_prompt, str):
        errors.append("provenance.lastPrompt must be a string or null")

    if not errors and base_profile is not None and runtime == "platformer_v1":
        resolved = resolve_game_physics(game_spec, base_profile)
        if resolved["verticalMode"] == "grounded_jump":
            metrics = derive_platformer_metrics(resolved)
            level_design = base_profile["levelDesign"]
            required_height = (
                level_design["maximumDirectRiseTiles"] * resolved["units"]["tileSizePx"]
                + level_design["minimumJumpHeightMarginPx"]
            )
            required_range = (
                level_design["maximumCriticalPathGapTiles"] * resolved["units"]["tileSizePx"]
                + level_design["minimumJumpRangeMarginPx"]
            )
            if metrics["apexHeightPx"] < required_height:
                errors.append("editable jump does not clear the base profile's direct-rise envelope")
            if metrics["sameHeightRangeAtMaxSpeedPx"] < required_range:
                errors.append("editable jump does not clear the base profile's gap envelope")
    return errors


def _validate_game_vertical_movement(game_spec: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    vertical = _mapping(game_spec, "verticalMovement", errors)
    _reject_unknown(vertical, {"mode", "groundedJump", "flight"}, "verticalMovement", errors)
    if vertical.get("mode") not in {"grounded_jump", "flight"}:
        errors.append("verticalMovement.mode must be grounded_jump or flight")
    jump = _mapping(vertical, "groundedJump", errors)
    _reject_unknown(
        jump,
        {
            "jumpHeightTiles",
            "timeToApexSeconds",
            "maximumFallSpeedTilesPerSecond",
            "coyoteTimeTicks",
            "inputBufferTicks",
            "earlyReleaseVelocityMultiplier",
        },
        "verticalMovement.groundedJump",
        errors,
    )
    _bounded_number(jump, "jumpHeightTiles", errors, 0.5, 8, "verticalMovement.groundedJump")
    _bounded_number(jump, "timeToApexSeconds", errors, 0.15, 1.5, "verticalMovement.groundedJump")
    _bounded_number(
        jump,
        "maximumFallSpeedTilesPerSecond",
        errors,
        2,
        30,
        "verticalMovement.groundedJump",
    )
    for key in ("coyoteTimeTicks", "inputBufferTicks"):
        value = jump.get(key)
        if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 12:
            errors.append(f"verticalMovement.groundedJump.{key} must be an integer from 0 through 12")
    _bounded_number(
        jump,
        "earlyReleaseVelocityMultiplier",
        errors,
        0.1,
        1,
        "verticalMovement.groundedJump",
    )

    flight = _mapping(vertical, "flight", errors)
    _reject_unknown(
        flight,
        {
            "maximumRiseSpeedTilesPerSecond",
            "maximumFallSpeedTilesPerSecond",
            "timeToMaximumSpeedSeconds",
            "timeToStopSeconds",
        },
        "verticalMovement.flight",
        errors,
    )
    for key in ("maximumRiseSpeedTilesPerSecond", "maximumFallSpeedTilesPerSecond"):
        _bounded_number(flight, key, errors, 0.5, 10, "verticalMovement.flight")
    for key in ("timeToMaximumSpeedSeconds", "timeToStopSeconds"):
        _bounded_number(flight, key, errors, 0.05, 2, "verticalMovement.flight")
    return errors


def resolve_game_physics(
    game_spec: dict[str, Any], base_profile: dict[str, Any]
) -> dict[str, Any]:
    """Compile semantic per-game tuning into runtime pixel values."""
    resolved = copy.deepcopy(base_profile)
    resolved["gamePhysicsId"] = game_spec["id"]
    resolved["gamePhysicsRevision"] = game_spec["revision"]
    tile_size = float(base_profile["units"]["tileSizePx"])
    if game_spec["runtime"] == "top_down_v1":
        speed = game_spec["movement"]["maximumSpeedTilesPerSecond"] * tile_size
        resolved["movement"]["maxSpeedPxPerSecond"] = speed
        resolved["movement"]["maxSpeedTilesPerSecond"] = speed / tile_size
        return resolved

    movement = game_spec["movement"]
    run_speed = movement["maximumRunSpeedTilesPerSecond"] * tile_size
    resolved["movement"].update(
        {
            "maxRunSpeedPxPerSecond": run_speed,
            "maxRunSpeedTilesPerSecond": run_speed / tile_size,
            "groundAccelerationPxPerSecondSquared": run_speed
            / movement["groundTimeToMaximumSpeedSeconds"],
            "groundDecelerationPxPerSecondSquared": run_speed / movement["groundTimeToStopSeconds"],
            "airAccelerationPxPerSecondSquared": run_speed / movement["airTimeToMaximumSpeedSeconds"],
        }
    )
    vertical = game_spec["verticalMovement"]
    resolved["verticalMode"] = vertical["mode"]
    if vertical["mode"] == "grounded_jump":
        jump = vertical["groundedJump"]
        height = jump["jumpHeightTiles"] * tile_size
        time_to_apex = jump["timeToApexSeconds"]
        resolved["gravity"].update(
            {
                "accelerationPxPerSecondSquared": 2 * height / (time_to_apex * time_to_apex),
                "maximumFallSpeedPxPerSecond": jump["maximumFallSpeedTilesPerSecond"] * tile_size,
            }
        )
        resolved["jump"].update(
            {
                "launchVelocityYPxPerSecond": -2 * height / time_to_apex,
                "coyoteTimeTicks": jump["coyoteTimeTicks"],
                "inputBufferTicks": jump["inputBufferTicks"],
                "earlyReleaseVelocityMultiplier": jump["earlyReleaseVelocityMultiplier"],
            }
        )
    else:
        flight = vertical["flight"]
        resolved.pop("gravity", None)
        resolved.pop("jump", None)
        rise_speed = flight["maximumRiseSpeedTilesPerSecond"] * tile_size
        fall_speed = flight["maximumFallSpeedTilesPerSecond"] * tile_size
        resolved["flight"] = {
            "inputAxes": ["moveX", "moveY"],
            "gravityEnabled": False,
            "jumpInputsIgnored": True,
            "maximumRiseSpeedPxPerSecond": rise_speed,
            "maximumFallSpeedPxPerSecond": fall_speed,
            "riseAccelerationPxPerSecondSquared": rise_speed / flight["timeToMaximumSpeedSeconds"],
            "fallAccelerationPxPerSecondSquared": fall_speed / flight["timeToMaximumSpeedSeconds"],
            "riseDecelerationPxPerSecondSquared": rise_speed / flight["timeToStopSeconds"],
            "fallDecelerationPxPerSecondSquared": fall_speed / flight["timeToStopSeconds"],
        }
    return resolved


def apply_cooper_patch(
    game_spec: dict[str, Any],
    patch: dict[str, Any],
    profiles_by_id: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Apply a constrained Cooper patch and return the next validated revision."""
    if set(patch) != {"baseRevision", "prompt", "operations"}:
        raise PhysicsSpecError("Cooper patch must contain baseRevision, prompt, and operations")
    base_revision = patch["baseRevision"]
    if not isinstance(base_revision, int) or isinstance(base_revision, bool) or base_revision < 1:
        raise PhysicsSpecError("Cooper patch baseRevision must be a positive integer")
    if base_revision != game_spec.get("revision"):
        raise PhysicsSpecError("Cooper patch is based on a stale game-physics revision")
    prompt = patch.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        raise PhysicsSpecError("Cooper patch prompt must be a non-empty string")
    if len(prompt) > 1000:
        raise PhysicsSpecError("Cooper patch prompt cannot exceed 1000 characters")
    operations = patch.get("operations")
    if not isinstance(operations, list) or not 1 <= len(operations) <= 16:
        raise PhysicsSpecError("Cooper patch must contain 1 through 16 operations")
    allowed_paths = set(game_spec.get("editPolicy", {}).get("allowedPaths", []))
    updated = copy.deepcopy(game_spec)
    patched_paths: set[str] = set()
    for operation in operations:
        if not isinstance(operation, dict) or set(operation) != {"op", "path", "value"}:
            raise PhysicsSpecError("Each Cooper operation must contain op, path, and value")
        if operation["op"] != "replace":
            raise PhysicsSpecError("Cooper physics patches only support replace operations")
        path = operation["path"]
        if not isinstance(path, str):
            raise PhysicsSpecError("Cooper operation path must be a string")
        if path in patched_paths:
            raise PhysicsSpecError(f"Cooper patch repeats physics path {path}")
        patched_paths.add(path)
        if path not in allowed_paths:
            raise PhysicsSpecError(f"Cooper cannot edit protected physics path {path}")
        parts = path.removeprefix("/").split("/")
        target: Any = updated
        for part in parts[:-1]:
            if not isinstance(target, dict) or part not in target:
                raise PhysicsSpecError(f"Cooper patch path does not exist: {path}")
            target = target[part]
        if not isinstance(target, dict) or parts[-1] not in target:
            raise PhysicsSpecError(f"Cooper patch path does not exist: {path}")
        target[parts[-1]] = operation["value"]
    updated["revision"] += 1
    updated["provenance"] = {
        "lastEditedBy": "cooper",
        "lastPrompt": prompt.strip(),
    }
    errors = validate_game_physics(updated, profiles_by_id)
    if errors:
        raise PhysicsSpecError("Cooper patch failed validation: " + "; ".join(errors))
    return updated


def _validate_triggers(
    triggers: dict[str, Any],
    *,
    expected_priority: list[str],
    expected_responses: dict[str, str],
    expected_volume_names: set[str],
    tile_size: float | None,
) -> list[str]:
    errors: list[str] = []
    _reject_unknown(
        triggers,
        {"overlapRule", "priorityOrder", "responses", "volumes"},
        "triggers",
        errors,
    )
    if triggers.get("overlapRule") != "positive_area":
        errors.append("triggers.overlapRule must be positive_area")
    if triggers.get("priorityOrder") != expected_priority:
        errors.append(f"triggers.priorityOrder must be {expected_priority}")
    responses = _mapping(triggers, "responses", errors)
    if responses != expected_responses:
        errors.append("trigger responses do not match the locked runtime semantics")
    volumes = _mapping(triggers, "volumes", errors)
    if set(volumes) != expected_volume_names:
        errors.append(f"trigger volumes must cover exactly {sorted(expected_volume_names)}")
    for name, raw_volume in volumes.items():
        if not isinstance(raw_volume, dict):
            errors.append(f"trigger volume {name} must be an object")
            continue
        _reject_unknown(
            raw_volume,
            {"shape", "widthPx", "heightPx", "anchor"},
            f"trigger volume {name}",
            errors,
        )
        if raw_volume.get("shape") != "aabb":
            errors.append(f"trigger volume {name} must use an aabb")
        width = _number(raw_volume, "widthPx", errors, positive=True)
        height = _number(raw_volume, "heightPx", errors, positive=True)
        anchor = raw_volume.get("anchor")
        if anchor not in {"cell_center", "cell_bottom_center", "cell_bounds"}:
            errors.append(f"trigger volume {name} has an invalid cell anchor")
        if tile_size is not None:
            if width is not None and width > tile_size:
                errors.append(f"trigger volume {name} width cannot exceed one tile")
            if height is not None and height > tile_size:
                errors.append(f"trigger volume {name} height cannot exceed one tile")
            if anchor == "cell_bounds" and (width != tile_size or height != tile_size):
                errors.append(f"cell-bounds trigger volume {name} must fill one tile")
    return errors


def validate_profile(profile: dict[str, Any], path: Path | None = None) -> list[str]:
    errors: list[str] = []
    allowed_top_level = {
        "schemaVersion",
        "id",
        "runtime",
        "name",
        "description",
        "units",
        "simulation",
        "coordinates",
        "player",
        "movement",
        "facing",
        "gravity",
        "jump",
        "collision",
        "triggers",
        "respawn",
        "levelDesign",
        "unsupported",
    }
    unknown = sorted(set(profile) - allowed_top_level)
    if unknown:
        errors.append(f"unknown top-level fields: {', '.join(unknown)}")

    if profile.get("schemaVersion") != 1:
        errors.append("schemaVersion must be 1")
    profile_id = profile.get("id")
    if not isinstance(profile_id, str) or not PROFILE_ID_PATTERN.fullmatch(profile_id):
        errors.append("id must be lowercase snake case ending in _v<number>")
    elif path is not None and path.stem != profile_id:
        errors.append(f"filename must be {profile_id}.json")
    runtime = profile.get("runtime")
    if runtime not in SUPPORTED_RUNTIMES:
        errors.append(f"runtime must be one of {sorted(SUPPORTED_RUNTIMES)}")
    for field in ("name", "description"):
        if not isinstance(profile.get(field), str) or not profile[field].strip():
            errors.append(f"{field} must be a non-empty string")

    units = _mapping(profile, "units", errors)
    _reject_unknown(units, {"distance", "time", "tileSizePx"}, "units", errors)
    if units.get("distance") != "world_pixel":
        errors.append("units.distance must be world_pixel")
    if units.get("time") != "second":
        errors.append("units.time must be second")
    tile_size = _number(units, "tileSizePx", errors, positive=True)
    if tile_size is not None and tile_size != 64:
        errors.append("units.tileSizePx must be the canonical 64 px")

    simulation = _mapping(profile, "simulation", errors)
    _reject_unknown(
        simulation,
        {
            "tickRateHz",
            "fixedDeltaSeconds",
            "maxCatchUpSteps",
            "maxFrameDeltaSeconds",
            "numericPrecision",
        },
        "simulation",
        errors,
    )
    tick_rate = _number(simulation, "tickRateHz", errors, positive=True)
    fixed_delta = _number(simulation, "fixedDeltaSeconds", errors, positive=True)
    if tick_rate is not None and tick_rate != 60:
        errors.append("simulation.tickRateHz must be 60 for HackYard")
    if tick_rate is not None and fixed_delta is not None and not math.isclose(
        fixed_delta, 1 / tick_rate, rel_tol=0, abs_tol=1e-12
    ):
        errors.append("simulation.fixedDeltaSeconds must equal 1 / tickRateHz")
    max_catch_up = simulation.get("maxCatchUpSteps")
    if not isinstance(max_catch_up, int) or isinstance(max_catch_up, bool) or max_catch_up < 1:
        errors.append("simulation.maxCatchUpSteps must be a positive integer")
    max_frame_delta = _number(simulation, "maxFrameDeltaSeconds", errors, positive=True)
    if max_frame_delta is not None and fixed_delta is not None and max_frame_delta < fixed_delta:
        errors.append("simulation.maxFrameDeltaSeconds cannot be smaller than one fixed step")
    if simulation.get("numericPrecision") != "float64":
        errors.append("simulation.numericPrecision must be float64")

    coordinates = _mapping(profile, "coordinates", errors)
    _reject_unknown(
        coordinates,
        {"origin", "positiveX", "positiveY", "playerPositionReference"},
        "coordinates",
        errors,
    )
    expected_coordinates = {
        "origin": "top_left",
        "positiveX": "right",
        "positiveY": "down",
        "playerPositionReference": "bottom_center",
    }
    for key, expected in expected_coordinates.items():
        if coordinates.get(key) != expected:
            errors.append(f"coordinates.{key} must be {expected}")

    player = _mapping(profile, "player", errors)
    _reject_unknown(player, {"collider", "playersBlockEachOther"}, "player", errors)
    if player.get("playersBlockEachOther") is not False:
        errors.append("player.playersBlockEachOther must be false for HackYard")
    collider = _mapping(player, "collider", errors)
    _reject_unknown(
        collider,
        {"shape", "widthPx", "heightPx", "offsetFromPositionPx"},
        "player.collider",
        errors,
    )
    if collider.get("shape") != "aabb":
        errors.append("player.collider.shape must be aabb")
    width = _number(collider, "widthPx", errors, positive=True)
    height = _number(collider, "heightPx", errors, positive=True)
    offset = _mapping(collider, "offsetFromPositionPx", errors)
    _reject_unknown(offset, {"x", "y"}, "player.collider.offsetFromPositionPx", errors)
    offset_x = _number(offset, "x", errors)
    offset_y = _number(offset, "y", errors)
    if tile_size is not None:
        if width is not None and width > tile_size:
            errors.append("player collider width cannot exceed one tile")
        if height is not None and height > tile_size:
            errors.append("player collider height cannot exceed one tile")
    if width is not None and offset_x is not None and not math.isclose(offset_x, -width / 2):
        errors.append("player collider x offset must center it on the player position")
    if height is not None and offset_y is not None and not math.isclose(offset_y, -height):
        errors.append("player collider y offset must put its bottom on the player position")

    collision = _mapping(profile, "collision", errors)
    _reject_unknown(
        collision,
        {
            "source",
            "solver",
            "axisOrder",
            "skinWidthPx",
            "solidSemantics",
            "oneWaySemantics",
            "groundedDefinition",
        },
        "collision",
        errors,
    )
    if collision.get("source") != "map_semantics":
        errors.append("collision.source must be map_semantics")
    if collision.get("solver") != "axis_separated_swept_aabb":
        errors.append("collision.solver must be axis_separated_swept_aabb")
    if collision.get("axisOrder") != ["x", "y"]:
        errors.append("collision.axisOrder must be ['x', 'y']")
    skin_width = _number(collision, "skinWidthPx", errors)
    if skin_width is not None and not 0 <= skin_width <= 0.01:
        errors.append("collision.skinWidthPx must be between 0 and 0.01")
    solid_semantics = collision.get("solidSemantics")
    if not isinstance(solid_semantics, list) or not solid_semantics or not all(
        isinstance(value, str) and value for value in solid_semantics
    ):
        errors.append("collision.solidSemantics must be a non-empty string list")
    elif len(set(solid_semantics)) != len(solid_semantics):
        errors.append("collision.solidSemantics cannot contain duplicates")
    one_way_semantics = collision.get("oneWaySemantics")
    if one_way_semantics is not None:
        if not isinstance(one_way_semantics, list) or not one_way_semantics or not all(
            isinstance(value, str) and value for value in one_way_semantics
        ):
            errors.append("collision.oneWaySemantics must be a non-empty string list")
        elif len(set(one_way_semantics)) != len(one_way_semantics):
            errors.append("collision.oneWaySemantics cannot contain duplicates")

    unsupported = profile.get("unsupported")
    if not isinstance(unsupported, list) or not unsupported or not all(
        isinstance(value, str) and value for value in unsupported
    ):
        errors.append("unsupported must be a non-empty string list")
    elif len(set(unsupported)) != len(unsupported):
        errors.append("unsupported cannot contain duplicates")

    if runtime == "top_down_v1":
        errors.extend(_validate_top_down(profile, tile_size))
    elif runtime == "platformer_v1":
        errors.extend(_validate_platformer(profile, tile_size, fixed_delta))
    return errors


def _validate_top_down(profile: dict[str, Any], tile_size: float | None) -> list[str]:
    errors: list[str] = []
    if "gravity" in profile or "jump" in profile:
        errors.append("top_down_v1 must not define gravity or jump")
    movement = _mapping(profile, "movement", errors)
    _reject_unknown(
        movement,
        {
            "inputAxes",
            "inputMinimum",
            "inputMaximum",
            "diagonalNormalization",
            "response",
            "maxSpeedPxPerSecond",
            "maxSpeedTilesPerSecond",
            "zeroInputBehavior",
        },
        "movement",
        errors,
    )
    if movement.get("inputAxes") != ["moveX", "moveY"]:
        errors.append("top-down movement.inputAxes must be ['moveX', 'moveY']")
    if movement.get("diagonalNormalization") != "unit_circle":
        errors.append("top-down diagonal movement must use unit_circle normalization")
    if movement.get("response") != "instant":
        errors.append("top-down movement.response must be instant")
    if movement.get("zeroInputBehavior") != "stop_immediately":
        errors.append("top-down zero input must stop immediately")
    speed = _number(movement, "maxSpeedPxPerSecond", errors, positive=True)
    speed_tiles = _number(movement, "maxSpeedTilesPerSecond", errors, positive=True)
    if speed is not None and speed_tiles is not None and tile_size is not None and not math.isclose(
        speed / tile_size, speed_tiles, rel_tol=0, abs_tol=1e-9
    ):
        errors.append("top-down pixel and tile speeds disagree")
    if movement.get("inputMinimum") != -1 or movement.get("inputMaximum") != 1:
        errors.append("top-down input range must be -1 through 1")
    facing = _mapping(profile, "facing", errors)
    _reject_unknown(
        facing,
        {"directions", "selection", "equalAxisTieBreak"},
        "facing",
        errors,
    )
    if facing.get("directions") != ["down", "left", "right", "up"]:
        errors.append("facing.directions must match the character sheet row order")
    if facing.get("selection") != "last_dominant_input_axis":
        errors.append("facing.selection must be last_dominant_input_axis")
    if facing.get("equalAxisTieBreak") != "keep_current_facing":
        errors.append("facing.equalAxisTieBreak must be keep_current_facing")
    triggers = _mapping(profile, "triggers", errors)
    errors.extend(
        _validate_triggers(
            triggers,
            expected_priority=["key", "exit"],
            expected_responses={
                "key": "attempt_collect_key",
                "exit": "attempt_finish",
            },
            expected_volume_names={"key", "exit"},
            tile_size=tile_size,
        )
    )
    level_design = _mapping(profile, "levelDesign", errors)
    _reject_unknown(
        level_design,
        {"minimumCorridorWidthTiles", "preferredCorridorWidthTiles"},
        "levelDesign",
        errors,
    )
    minimum = _number(level_design, "minimumCorridorWidthTiles", errors, positive=True)
    preferred = _number(level_design, "preferredCorridorWidthTiles", errors, positive=True)
    if minimum is not None and preferred is not None and preferred < minimum:
        errors.append("preferred corridor width cannot be smaller than the minimum")
    return errors


def _validate_platformer(
    profile: dict[str, Any],
    tile_size: float | None,
    fixed_delta: float | None,
) -> list[str]:
    errors: list[str] = []
    movement = _mapping(profile, "movement", errors)
    _reject_unknown(
        movement,
        {
            "inputAxes",
            "inputMinimum",
            "inputMaximum",
            "maxRunSpeedPxPerSecond",
            "maxRunSpeedTilesPerSecond",
            "groundAccelerationPxPerSecondSquared",
            "groundDecelerationPxPerSecondSquared",
            "airAccelerationPxPerSecondSquared",
        },
        "movement",
        errors,
    )
    if movement.get("inputAxes") != ["moveX"]:
        errors.append("platformer movement.inputAxes must be ['moveX']")
    if movement.get("inputMinimum") != -1 or movement.get("inputMaximum") != 1:
        errors.append("platformer input range must be -1 through 1")
    run_speed = _number(movement, "maxRunSpeedPxPerSecond", errors, positive=True)
    run_speed_tiles = _number(movement, "maxRunSpeedTilesPerSecond", errors, positive=True)
    for field in (
        "groundAccelerationPxPerSecondSquared",
        "groundDecelerationPxPerSecondSquared",
        "airAccelerationPxPerSecondSquared",
    ):
        _number(movement, field, errors, positive=True)
    if run_speed is not None and run_speed_tiles is not None and tile_size is not None and not math.isclose(
        run_speed / tile_size, run_speed_tiles, rel_tol=0, abs_tol=1e-9
    ):
        errors.append("platformer pixel and tile speeds disagree")

    gravity = _mapping(profile, "gravity", errors)
    _reject_unknown(
        gravity,
        {"accelerationPxPerSecondSquared", "maximumFallSpeedPxPerSecond"},
        "gravity",
        errors,
    )
    gravity_acceleration = _number(gravity, "accelerationPxPerSecondSquared", errors, positive=True)
    maximum_fall_speed = _number(gravity, "maximumFallSpeedPxPerSecond", errors, positive=True)
    if maximum_fall_speed is not None and fixed_delta is not None and tile_size is not None:
        if maximum_fall_speed * fixed_delta >= tile_size:
            errors.append("maximum fall displacement per step must remain below one tile")

    jump = _mapping(profile, "jump", errors)
    _reject_unknown(
        jump,
        {
            "pressedInput",
            "heldInput",
            "launchVelocityYPxPerSecond",
            "requiresGroundedOrCoyoteTime",
            "coyoteTimeTicks",
            "inputBufferTicks",
            "earlyReleaseVelocityMultiplier",
            "earlyReleaseApplication",
            "requiresReleaseBeforeNextJump",
            "maximumAirJumps",
        },
        "jump",
        errors,
    )
    if jump.get("pressedInput") != "jumpPressed" or jump.get("heldInput") != "jumpHeld":
        errors.append("jump inputs must be jumpPressed and jumpHeld")
    launch_velocity = _number(jump, "launchVelocityYPxPerSecond", errors)
    if launch_velocity is not None and launch_velocity >= 0:
        errors.append("jump launch velocity must be negative because up is negative y")
    if jump.get("requiresGroundedOrCoyoteTime") is not True:
        errors.append("jump must require grounded state or coyote time")
    coyote_ticks = jump.get("coyoteTimeTicks")
    buffer_ticks = jump.get("inputBufferTicks")
    if not isinstance(coyote_ticks, int) or isinstance(coyote_ticks, bool) or not 0 <= coyote_ticks <= 9:
        errors.append("jump coyote time must be an integer from 0 through 9 ticks")
    if not isinstance(buffer_ticks, int) or isinstance(buffer_ticks, bool) or not 0 <= buffer_ticks <= 9:
        errors.append("jump input buffer must be an integer from 0 through 9 ticks")
    release_multiplier = _number(jump, "earlyReleaseVelocityMultiplier", errors)
    if release_multiplier is not None and not 0 < release_multiplier < 1:
        errors.append("early-release multiplier must be between 0 and 1")
    if jump.get("earlyReleaseApplication") != "once_when_released_while_rising":
        errors.append("early release must apply once when jumpHeld is released while rising")
    if jump.get("requiresReleaseBeforeNextJump") is not True:
        errors.append("jump must require release before another jump")
    if jump.get("maximumAirJumps") != 0:
        errors.append("maximumAirJumps must be 0 for the HackYard grounded jump")

    collision = profile.get("collision", {})
    if collision.get("oneWaySemantics") != ["one_way"]:
        errors.append("platformer one-way collision semantics must be ['one_way']")
    if collision.get("groundedDefinition") != "downward_solid_contact_this_step":
        errors.append("platformer grounded state must come from downward solid contact")
    triggers = _mapping(profile, "triggers", errors)
    errors.extend(
        _validate_triggers(
            triggers,
            expected_priority=[
                "out_of_bounds",
                "hazard",
                "goal",
                "checkpoint",
                "extra_life",
                "collectible",
            ],
            expected_responses={
                "collectible": "collect_and_score",
                "extra_life": "collect_and_add_life",
                "checkpoint": "set_latest_respawn",
                "goal": "finish_level",
                "hazard": "respawn",
                "out_of_bounds": "respawn",
            },
            expected_volume_names={"collectible", "extra_life", "checkpoint", "goal", "hazard"},
            tile_size=tile_size,
        )
    )
    respawn = _mapping(profile, "respawn", errors)
    _reject_unknown(
        respawn,
        {"checkpointSelection", "clearVelocity", "outOfBoundsMarginPx"},
        "respawn",
        errors,
    )
    if respawn.get("checkpointSelection") != "latest_checkpoint_or_initial_spawn":
        errors.append("respawn checkpoint selection is invalid")
    if respawn.get("clearVelocity") is not True:
        errors.append("respawn must clear velocity")
    out_of_bounds_margin = _number(respawn, "outOfBoundsMarginPx", errors)
    if out_of_bounds_margin is not None and tile_size is not None and out_of_bounds_margin != tile_size:
        errors.append("out-of-bounds margin must equal one tile")

    level_design = _mapping(profile, "levelDesign", errors)
    _reject_unknown(
        level_design,
        {
            "maximumCriticalPathGapTiles",
            "maximumDirectRiseTiles",
            "preferredLandingWidthTiles",
            "minimumLandingWidthTiles",
            "minimumJumpHeightMarginPx",
            "minimumJumpRangeMarginPx",
        },
        "levelDesign",
        errors,
    )
    max_gap = _number(level_design, "maximumCriticalPathGapTiles", errors, positive=True)
    max_rise = _number(level_design, "maximumDirectRiseTiles", errors, positive=True)
    preferred_landing = _number(level_design, "preferredLandingWidthTiles", errors, positive=True)
    minimum_landing = _number(level_design, "minimumLandingWidthTiles", errors, positive=True)
    jump_height_margin = _number(level_design, "minimumJumpHeightMarginPx", errors)
    jump_range_margin = _number(level_design, "minimumJumpRangeMarginPx", errors)
    if preferred_landing is not None and minimum_landing is not None and preferred_landing < minimum_landing:
        errors.append("preferred landing width cannot be smaller than the minimum")

    if all(value is not None for value in (gravity_acceleration, launch_velocity, run_speed, tile_size)):
        metrics = derive_platformer_metrics(profile)
        if max_rise is not None and jump_height_margin is not None:
            required_height = max_rise * tile_size + jump_height_margin
            if metrics["apexHeightPx"] < required_height:
                errors.append("jump apex does not satisfy the direct-rise design envelope")
        if max_gap is not None and jump_range_margin is not None:
            required_range = max_gap * tile_size + jump_range_margin
            if metrics["sameHeightRangeAtMaxSpeedPx"] < required_range:
                errors.append("jump range does not satisfy the critical-path gap envelope")
    return errors


def validate_registry(
    registry: dict[str, Any], profiles: Iterable[dict[str, Any]]
) -> list[str]:
    errors: list[str] = []
    if registry.get("schemaVersion") != 1:
        errors.append("registry schemaVersion must be 1")
    defaults = registry.get("defaults")
    if not isinstance(defaults, dict):
        return errors + ["registry defaults must be an object"]
    by_id = {profile.get("id"): profile for profile in profiles}
    if set(defaults) != SUPPORTED_RUNTIMES:
        errors.append(f"registry defaults must cover exactly {sorted(SUPPORTED_RUNTIMES)}")
    for runtime, profile_id in defaults.items():
        profile = by_id.get(profile_id)
        if profile is None:
            errors.append(f"registry default {runtime} references missing profile {profile_id}")
        elif profile.get("runtime") != runtime:
            errors.append(f"registry default {profile_id} belongs to {profile.get('runtime')}, not {runtime}")
    return errors


def _format_number(value: float, decimals: int = 2) -> str:
    return f"{value:.{decimals}f}".rstrip("0").rstrip(".")


def profile_report(profile: dict[str, Any]) -> str:
    lines = [f"{profile['id']} ({profile['runtime']})"]
    if profile["runtime"] == "platformer_v1":
        metrics = derive_platformer_metrics(profile)
        lines.extend(
            [
                f"  max run speed: {profile['movement']['maxRunSpeedPxPerSecond']} px/s "
                f"({profile['movement']['maxRunSpeedTilesPerSecond']} tiles/s)",
                f"  jump apex: {_format_number(metrics['apexHeightPx'])} px "
                f"({_format_number(metrics['apexHeightTiles'])} tiles)",
                f"  time to apex: {_format_number(metrics['timeToApexSeconds'])} s",
                f"  same-height airtime: {_format_number(metrics['sameHeightFlightSeconds'])} s",
                f"  max-speed range: {_format_number(metrics['sameHeightRangeAtMaxSpeedPx'])} px "
                f"({_format_number(metrics['sameHeightRangeAtMaxSpeedTiles'])} tiles)",
                f"  max-speed launch angle: {_format_number(metrics['launchAngleAtMaxSpeedDegrees'], 1)} degrees",
            ]
        )
    else:
        metrics = derive_top_down_metrics(profile)
        lines.extend(
            [
                f"  max speed: {profile['movement']['maxSpeedPxPerSecond']} px/s "
                f"({profile['movement']['maxSpeedTilesPerSecond']} tiles/s)",
                f"  tile traversal: {_format_number(metrics['secondsPerTileAtMaxSpeed'], 3)} s",
            ]
        )
    return "\n".join(lines)


def game_physics_report(game_spec: dict[str, Any], base_profile: dict[str, Any]) -> str:
    resolved = resolve_game_physics(game_spec, base_profile)
    lines = [
        f"{game_spec['id']} revision {game_spec['revision']} ({game_spec['runtime']})",
        f"  base profile: {game_spec['baseProfileId']}",
    ]
    if game_spec["runtime"] == "top_down_v1":
        lines.append(
            f"  max speed: {_format_number(resolved['movement']['maxSpeedPxPerSecond'])} px/s "
            f"({_format_number(resolved['movement']['maxSpeedTilesPerSecond'])} tiles/s)"
        )
        return "\n".join(lines)

    lines.append(f"  vertical mode: {resolved['verticalMode']}")
    lines.append(
        f"  max run speed: {_format_number(resolved['movement']['maxRunSpeedPxPerSecond'])} px/s "
        f"({_format_number(resolved['movement']['maxRunSpeedTilesPerSecond'])} tiles/s)"
    )
    if resolved["verticalMode"] == "grounded_jump":
        metrics = derive_platformer_metrics(resolved)
        lines.extend(
            [
                f"  jump apex: {_format_number(metrics['apexHeightPx'])} px "
                f"({_format_number(metrics['apexHeightTiles'])} tiles)",
                f"  time to apex: {_format_number(metrics['timeToApexSeconds'])} s",
                f"  max-speed range: {_format_number(metrics['sameHeightRangeAtMaxSpeedPx'])} px "
                f"({_format_number(metrics['sameHeightRangeAtMaxSpeedTiles'])} tiles)",
            ]
        )
    else:
        flight = resolved["flight"]
        lines.extend(
            [
                f"  max rise speed: {_format_number(flight['maximumRiseSpeedPxPerSecond'])} px/s",
                f"  max fall speed: {_format_number(flight['maximumFallSpeedPxPerSecond'])} px/s",
                "  gravity: disabled",
            ]
        )
    return "\n".join(lines)


def _load_and_validate(paths: list[Path]) -> tuple[list[dict[str, Any]], list[str]]:
    profiles: list[dict[str, Any]] = []
    messages: list[str] = []
    for path in paths:
        try:
            profile = load_json(path)
        except PhysicsSpecError as exc:
            messages.append(f"FAIL {path}: {exc}")
            continue
        errors = validate_profile(profile, path)
        if errors:
            messages.extend(f"FAIL {path}: {error}" for error in errors)
        else:
            messages.append(f"PASS {path}")
            profiles.append(profile)
    return profiles, messages


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    validate_parser = subparsers.add_parser("validate", help="validate physics profiles and defaults")
    validate_parser.add_argument("paths", nargs="*", type=Path)
    report_parser = subparsers.add_parser("report", help="print derived movement envelopes")
    report_parser.add_argument("paths", nargs="*", type=Path)
    game_report_parser = subparsers.add_parser(
        "game-report", help="resolve and print user-editable per-game physics"
    )
    game_report_parser.add_argument("paths", nargs="*", type=Path)
    args = parser.parse_args(argv)

    if args.command == "game-report":
        profile_paths = discover_profiles()
        profiles, profile_messages = _load_and_validate(profile_paths)
        profile_failures = [message for message in profile_messages if message.startswith("FAIL")]
        if profile_failures:
            print("\n".join(profile_failures))
            return 1
        profiles_by_id = {profile["id"]: profile for profile in profiles}
        game_paths = args.paths or discover_game_physics()
        failed = False
        reports: list[str] = []
        for path in game_paths:
            try:
                game_spec = load_json(path)
            except PhysicsSpecError as exc:
                print(f"FAIL {path}: {exc}")
                failed = True
                continue
            errors = validate_game_physics(game_spec, profiles_by_id, path)
            if errors:
                for error in errors:
                    print(f"FAIL {path}: {error}")
                failed = True
                continue
            reports.append(game_physics_report(game_spec, profiles_by_id[game_spec["baseProfileId"]]))
        if failed:
            return 1
        print("\n\n".join(reports))
        return 0

    paths = args.paths or discover_profiles()
    profiles, messages = _load_and_validate(paths)
    failures = [message for message in messages if message.startswith("FAIL")]
    if args.command == "validate" and not args.paths and not failures:
        registry = load_json(REGISTRY_PATH)
        registry_errors = validate_registry(registry, profiles)
        if registry_errors:
            failures.extend(f"FAIL {REGISTRY_PATH}: {error}" for error in registry_errors)
            messages.extend(failures)
        else:
            messages.append(f"PASS {REGISTRY_PATH}")
        profiles_by_id = {profile["id"]: profile for profile in profiles}
        for game_path in discover_game_physics():
            try:
                game_spec = load_json(game_path)
            except PhysicsSpecError as exc:
                message = f"FAIL {game_path}: {exc}"
                failures.append(message)
                messages.append(message)
                continue
            game_errors = validate_game_physics(game_spec, profiles_by_id, game_path)
            if game_errors:
                for error in game_errors:
                    message = f"FAIL {game_path}: {error}"
                    failures.append(message)
                    messages.append(message)
            else:
                messages.append(f"PASS {game_path}")
    for message in messages:
        print(message)
    if failures:
        return 1
    if args.command == "report":
        for index, profile in enumerate(profiles):
            if index:
                print()
            print(profile_report(profile))
    return 0


if __name__ == "__main__":
    sys.exit(main())
