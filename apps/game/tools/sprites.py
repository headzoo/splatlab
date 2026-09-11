#!/usr/bin/env python3
"""Normalize, validate, and preview Splat Lab! sprite sheets.

The tool treats generated images as source art, never as trusted grids. It finds
the expected primary subjects, assigns them to rows and columns, extracts every
frame, aligns it using the asset recipe, and validates the reconstructed sheet.
Approved runtime sprites are only overwritten when --replace is explicitly used.
"""

from __future__ import annotations

import argparse
import copy
import colorsys
import json
import math
import re
import shutil
import sys
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

from PIL import Image, ImageColor, ImageDraw


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SPEC_DIR = REPO_ROOT / "sprite-specs"
DEFAULT_BUILD_DIR = REPO_ROOT / "sprite-build"
DEFAULT_REPORT_DIR = REPO_ROOT / "sprite-reports"
DEFAULT_PALETTE_DIR = REPO_ROOT / "sprite-palettes"
RESAMPLING = getattr(Image, "Resampling", Image)

# top_down_v1 project contract. Keeping these values in the pipeline makes a
# stale 32 px character recipe fail before it can build or replace an asset.
CHARACTER_FRAME_SIZE = (64, 64)
CHARACTER_SHEET_GRID = (5, 4)
CHARACTER_ANCHOR = (32, 56)
BOSS_FRAME_SIZE = (128, 128)
BOSS_SHEET_GRID = (5, 2)
BOSS_ANCHOR = (64, 120)
BOSS_DEFEATED_SHEET_GRID = (8, 2)
BOSS_LOCOMOTION_FPS = 8
BOSS_DEFEATED_FPS = 10
EVENT_ID_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")
SKIN_MASK_SHADE_VALUES = (0, 85, 170, 255)
HAIR_MASK_SHADE_VALUES = SKIN_MASK_SHADE_VALUES
DEFAULT_SKIN_MASK_GENERATION = {
    "hueDegrees": [8.0, 38.0],
    "saturation": [0.18, 0.72],
    "value": [0.45, 1.0],
    "greenRedRatio": [0.55, 0.9],
    "blueGreenRatio": [0.42, 0.9],
    "minimumRed": 135,
}
DEFAULT_HAIR_MASK_GENERATION = {
    "hueDegrees": [4.0, 36.0],
    "saturation": [0.28, 0.9],
    "value": [0.16, 0.78],
    "minimumRed": 45,
    "maximumFrameY": 43,
}


class SpriteError(RuntimeError):
    """An actionable, fail-closed sprite pipeline error."""


@dataclass(frozen=True)
class Component:
    area: int
    bbox: tuple[int, int, int, int]
    center: tuple[float, float]


@dataclass
class ValidationResult:
    asset_id: str
    image_path: str
    passed: bool
    errors: list[str]
    warnings: list[str]
    measurements: dict[str, Any]

    def as_dict(self) -> dict[str, Any]:
        return {
            "assetId": self.asset_id,
            "image": self.image_path,
            "passed": self.passed,
            "errors": self.errors,
            "warnings": self.warnings,
            "measurements": self.measurements,
        }


def is_human_character(spec: dict[str, Any]) -> bool:
    return spec.get("kind") == "character" and (
        spec.get("body") == "human" or "human" in str(spec.get("id", "")).split("_")
    )


def skin_tone_config(spec: dict[str, Any]) -> dict[str, Any] | None:
    appearance = spec.get("appearance")
    if not isinstance(appearance, dict):
        return None
    value = appearance.get("skinTone")
    return value if isinstance(value, dict) else None


def hair_color_config(spec: dict[str, Any]) -> dict[str, Any] | None:
    appearance = spec.get("appearance")
    if not isinstance(appearance, dict):
        return None
    value = appearance.get("hairColor")
    return value if isinstance(value, dict) else None


def frame_offsets(spec: dict[str, Any]) -> list[dict[str, int]]:
    """Return one recorded, pixel-space adjustment per output frame."""
    frame_count = int(spec["sheet"]["columns"]) * int(spec["sheet"]["rows"])
    configured = spec.get("alignment", {}).get("frameOffsets")
    if configured is None:
        return [{"x": 0, "y": 0} for _ in range(frame_count)]
    return [{"x": int(offset["x"]), "y": int(offset["y"])} for offset in configured]


def has_frame_offsets(spec: dict[str, Any]) -> bool:
    return any(offset["x"] or offset["y"] for offset in frame_offsets(spec))


def load_skin_palette(spec: dict[str, Any]) -> dict[str, Any]:
    config = skin_tone_config(spec)
    if config is None:
        raise SpriteError(f"{spec['id']}: human characters require appearance.skinTone")
    palette_id = config.get("palette")
    if not isinstance(palette_id, str) or not palette_id:
        raise SpriteError(f"{spec['id']}: appearance.skinTone.palette must be a non-empty id")
    palette_path = DEFAULT_PALETTE_DIR / f"{palette_id}.json"
    try:
        palette = json.loads(palette_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SpriteError(f"Cannot read skin-tone palette {palette_path}: {exc}") from exc
    if palette.get("schemaVersion") != 1 or palette.get("id") != palette_id:
        raise SpriteError(f"{palette_path.name}: invalid skin-tone palette identity")
    tones = palette.get("tones")
    if not isinstance(tones, list) or not tones:
        raise SpriteError(f"{palette_path.name}: tones must be a non-empty list")
    seen: set[str] = set()
    for tone in tones:
        if not isinstance(tone, dict) or not isinstance(tone.get("id"), str):
            raise SpriteError(f"{palette_path.name}: each tone requires an id")
        if tone["id"] in seen:
            raise SpriteError(f"{palette_path.name}: duplicate tone id {tone['id']}")
        seen.add(tone["id"])
        colors = tone.get("colors")
        if not isinstance(colors, list) or len(colors) != len(SKIN_MASK_SHADE_VALUES):
            raise SpriteError(
                f"{palette_path.name}: tone {tone['id']} requires four shadow-to-highlight colors"
            )
        if not all(isinstance(color, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", color) for color in colors):
            raise SpriteError(f"{palette_path.name}: tone {tone['id']} contains an invalid color")
    default_tone = palette.get("defaultToneId")
    if default_tone not in seen:
        raise SpriteError(f"{palette_path.name}: defaultToneId must reference a declared tone")
    return palette


def load_hair_palette(spec: dict[str, Any]) -> dict[str, Any]:
    config = hair_color_config(spec)
    if config is None:
        raise SpriteError(f"{spec['id']}: human characters require appearance.hairColor")
    palette_id = config.get("palette")
    if not isinstance(palette_id, str) or not palette_id:
        raise SpriteError(f"{spec['id']}: appearance.hairColor.palette must be a non-empty id")
    palette_path = DEFAULT_PALETTE_DIR / f"{palette_id}.json"
    try:
        palette = json.loads(palette_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SpriteError(f"Cannot read hair-color palette {palette_path}: {exc}") from exc
    if palette.get("schemaVersion") != 1 or palette.get("id") != palette_id:
        raise SpriteError(f"{palette_path.name}: invalid hair-color palette identity")
    colors = palette.get("colors")
    if not isinstance(colors, list) or not colors:
        raise SpriteError(f"{palette_path.name}: colors must be a non-empty list")
    seen: set[str] = set()
    for color in colors:
        if not isinstance(color, dict) or not isinstance(color.get("id"), str):
            raise SpriteError(f"{palette_path.name}: each color requires an id")
        if color["id"] in seen:
            raise SpriteError(f"{palette_path.name}: duplicate color id {color['id']}")
        seen.add(color["id"])
        ramp = color.get("colors")
        if not isinstance(ramp, list) or len(ramp) != len(HAIR_MASK_SHADE_VALUES):
            raise SpriteError(
                f"{palette_path.name}: color {color['id']} requires four shadow-to-highlight colors"
            )
        if not all(isinstance(value, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", value) for value in ramp):
            raise SpriteError(f"{palette_path.name}: color {color['id']} contains an invalid color")
    if palette.get("defaultColorId") not in seen:
        raise SpriteError(f"{palette_path.name}: defaultColorId must reference a declared color")
    return palette


def repo_path(value: str) -> Path:
    path = Path(value)
    if not path.is_absolute():
        path = REPO_ROOT / path
    resolved = path.resolve()
    try:
        resolved.relative_to(REPO_ROOT)
    except ValueError as exc:
        raise SpriteError(f"Path must stay inside the project: {value}") from exc
    return resolved


def _validate_spec(spec: dict[str, Any], label: str, *, allow_event_sheets: bool) -> dict[str, Any]:
    required = (
        "schemaVersion",
        "id",
        "source",
        "output",
        "sourceLayout",
        "sheet",
        "alignment",
        "frameLabels",
    )
    missing = [key for key in required if key not in spec]
    if missing:
        raise SpriteError(f"{label} is missing required keys: {', '.join(missing)}")
    if spec["schemaVersion"] != 1:
        raise SpriteError(f"{label} uses unsupported schemaVersion {spec['schemaVersion']!r}")

    asset_id = spec["id"]
    if not isinstance(asset_id, str) or not asset_id or any(
        character not in "abcdefghijklmnopqrstuvwxyz0123456789_" for character in asset_id
    ):
        raise SpriteError(f"{label} has an invalid lowercase snake-case id")

    for section, keys in {
        "sourceLayout": ("columns", "rows"),
        "sheet": ("columns", "rows", "frameWidth", "frameHeight"),
        "alignment": ("mode", "anchor", "contentBox"),
    }.items():
        if not isinstance(spec[section], dict):
            raise SpriteError(f"{label}: {section} must be an object")
        absent = [key for key in keys if key not in spec[section]]
        if absent:
            raise SpriteError(f"{label}: {section} is missing {', '.join(absent)}")

    source_count = spec["sourceLayout"]["columns"] * spec["sourceLayout"]["rows"]
    output_count = spec["sheet"]["columns"] * spec["sheet"]["rows"]
    if source_count != output_count:
        raise SpriteError(
            f"{label}: source layout has {source_count} frames but output layout has {output_count}"
        )
    source_id = spec.get("sourceId", asset_id)
    if not isinstance(source_id, str) or not source_id or any(
        character not in "abcdefghijklmnopqrstuvwxyz0123456789_" for character in source_id
    ):
        raise SpriteError(f"{label} has an invalid lowercase snake-case sourceId")
    if Path(spec["source"]).name != f"{source_id}-source.png":
        raise SpriteError(f"{label}: source filename must be {source_id}-source.png")
    if Path(spec["output"]).name != f"{asset_id}.png":
        raise SpriteError(f"{label}: runtime filename must be {asset_id}.png")
    frame_labels = spec.get("frameLabels")
    if frame_labels is not None and (not isinstance(frame_labels, list) or len(frame_labels) != output_count):
        raise SpriteError(f"{label}: frameLabels must contain exactly {output_count} entries")
    if spec["alignment"]["mode"] not in {
        "bottom_center",
        "center",
        "fixed_envelope",
        "bright_core",
        "dark_opening",
        "manual",
    }:
        raise SpriteError(f"{label}: unsupported alignment mode {spec['alignment']['mode']!r}")
    if spec["alignment"]["mode"] == "manual":
        placements = spec["alignment"].get("manualPlacements")
        if not isinstance(placements, list) or len(placements) != output_count:
            raise SpriteError(f"{label}: manual alignment requires one manualPlacement per frame")
    offsets = spec["alignment"].get("frameOffsets")
    if offsets is not None:
        if not isinstance(offsets, list) or len(offsets) != output_count:
            raise SpriteError(f"{label}: alignment.frameOffsets must contain one offset per frame")
        for index, offset in enumerate(offsets):
            if (
                not isinstance(offset, dict)
                or not isinstance(offset.get("x"), int)
                or isinstance(offset.get("x"), bool)
                or not isinstance(offset.get("y"), int)
                or isinstance(offset.get("y"), bool)
            ):
                raise SpriteError(
                    f"{label}: alignment.frameOffsets[{index}] must contain integer x and y values"
                )
    validation = spec.get("validation", {})
    if not isinstance(validation, dict):
        raise SpriteError(f"{label}: validation must be an object")
    allow_opaque_full_frame = validation.get("allowOpaqueFullFrame", False)
    if not isinstance(allow_opaque_full_frame, bool):
        raise SpriteError(f"{label}: validation.allowOpaqueFullFrame must be true or false")
    if allow_opaque_full_frame:
        sheet = spec["sheet"]
        content_box = spec["alignment"]["contentBox"]
        if (
            spec.get("kind") not in {"terrain", "obstacle"}
            or spec.get("visualSlot") not in {"ground", "platform", "obstacle"}
            or output_count != 1
            or content_box.get("width") != sheet["frameWidth"]
            or content_box.get("height") != sheet["frameHeight"]
            or spec["alignment"].get("resizeMode") != "stretch_each"
        ):
            raise SpriteError(
                f"{label}: validation.allowOpaqueFullFrame is limited to one-frame "
                "ground/platform/obstacle terrain that stretches across the complete frame"
            )
    if spec.get("kind") == "character":
        sheet = spec["sheet"]
        anchor = spec["alignment"]["anchor"]
        actual_frame = (sheet["frameWidth"], sheet["frameHeight"])
        actual_grid = (sheet["columns"], sheet["rows"])
        actual_anchor = (anchor["x"], anchor["y"])
        if actual_frame != CHARACTER_FRAME_SIZE:
            raise SpriteError(
                f"{label}: top_down_v1 characters require 64 x 64 frames; "
                f"got {actual_frame[0]} x {actual_frame[1]}"
            )
        if actual_grid != CHARACTER_SHEET_GRID:
            raise SpriteError(
                f"{label}: top_down_v1 characters require a 5 x 4 sheet; "
                f"got {actual_grid[0]} x {actual_grid[1]}"
            )
        if actual_anchor != CHARACTER_ANCHOR:
            raise SpriteError(
                f"{label}: top_down_v1 characters require anchor (32, 56); "
                f"got ({actual_anchor[0]}, {actual_anchor[1]})"
            )
    if spec.get("kind") == "boss":
        sheet = spec["sheet"]
        source_layout = spec["sourceLayout"]
        anchor = spec["alignment"]["anchor"]
        actual_frame = (sheet["frameWidth"], sheet["frameHeight"])
        actual_grid = (sheet["columns"], sheet["rows"])
        actual_source_grid = (source_layout["columns"], source_layout["rows"])
        actual_anchor = (anchor["x"], anchor["y"])
        expected_labels = [
            "idle_left",
            "walk_left_1",
            "walk_left_2",
            "walk_left_3",
            "walk_left_4",
            "idle_right",
            "walk_right_1",
            "walk_right_2",
            "walk_right_3",
            "walk_right_4",
        ]
        if spec.get("runtime") != "platformer_v1":
            raise SpriteError(f"{label}: bosses require runtime platformer_v1")
        roles = spec.get("roles")
        if not isinstance(roles, list) or "boss" not in roles:
            raise SpriteError(f"{label}: boss recipes must include the boss role")
        if spec.get("collisionProfile") != "boss_large_v1":
            raise SpriteError(f"{label}: bosses require collisionProfile boss_large_v1")
        if actual_frame != BOSS_FRAME_SIZE:
            raise SpriteError(
                f"{label}: bosses require 128 x 128 frames assembled from four 64 px tiles; "
                f"got {actual_frame[0]} x {actual_frame[1]}"
            )
        if actual_grid != BOSS_SHEET_GRID or actual_source_grid != BOSS_SHEET_GRID:
            raise SpriteError(
                f"{label}: bosses require 5 x 2 left/right source and runtime sheets"
            )
        if actual_anchor != BOSS_ANCHOR:
            raise SpriteError(
                f"{label}: bosses require anchor (64, 120); "
                f"got ({actual_anchor[0]}, {actual_anchor[1]})"
            )
        if spec.get("frameLabels") != expected_labels:
            raise SpriteError(f"{label}: boss frames must be idle plus four walk frames for left, then right")
        if (
            spec["alignment"].get("mode") != "bottom_center"
            or spec.get("animation", {}).get("fps") != BOSS_LOCOMOTION_FPS
            or spec.get("animation", {}).get("loop") is not True
        ):
            raise SpriteError(f"{label}: boss locomotion must be bottom-anchored and loop at 8 fps")
        event_sheets = spec.get("eventSheets")
        defeated = event_sheets.get("defeated") if isinstance(event_sheets, dict) else None
        if not isinstance(defeated, dict):
            raise SpriteError(f"{label}: bosses require a defeated event sheet")
        defeated_source_layout = defeated.get("sourceLayout", {})
        defeated_sheet = defeated.get("sheet", {})
        defeated_anchor = defeated.get("alignment", {}).get("anchor", {})
        expected_defeated_labels = [
            *(f"defeated_left_{index}" for index in range(1, 9)),
            *(f"defeated_right_{index}" for index in range(1, 9)),
        ]
        if (
            (defeated_sheet.get("frameWidth"), defeated_sheet.get("frameHeight"))
            != BOSS_FRAME_SIZE
            or (defeated_sheet.get("columns"), defeated_sheet.get("rows"))
            != BOSS_DEFEATED_SHEET_GRID
            or (defeated_source_layout.get("columns"), defeated_source_layout.get("rows"))
            != BOSS_DEFEATED_SHEET_GRID
            or (defeated_anchor.get("x"), defeated_anchor.get("y")) != BOSS_ANCHOR
            or defeated.get("alignment", {}).get("mode") != "bottom_center"
            or defeated.get("frameLabels") != expected_defeated_labels
            or defeated.get("animation", {}).get("fps") != BOSS_DEFEATED_FPS
            or defeated.get("animation", {}).get("loop") is not False
        ):
            raise SpriteError(
                f"{label}: defeated must be an 8 x 2 play-once sheet of 128 x 128 "
                "left/right frames anchored at (64, 120) and running at 10 fps"
            )
    if is_human_character(spec):
        if spec.get("body") != "human":
            raise SpriteError(f"{label}: human character assets must declare body as human")
        config = skin_tone_config(spec)
        if config is None:
            raise SpriteError(f"{label}: human characters require appearance.skinTone")
        mask = config.get("mask")
        if not isinstance(mask, str) or not mask:
            raise SpriteError(f"{label}: appearance.skinTone.mask must be a non-empty path")
        if Path(mask).name != f"{asset_id}-skin-mask.png":
            raise SpriteError(
                f"{label}: skin mask filename must be {asset_id}-skin-mask.png"
            )
        if not isinstance(config.get("palette"), str) or not config["palette"]:
            raise SpriteError(f"{label}: appearance.skinTone.palette must be a non-empty id")
        hair_config = hair_color_config(spec)
        if hair_config is None:
            raise SpriteError(f"{label}: human characters require appearance.hairColor")
        hair_mask = hair_config.get("mask")
        if not isinstance(hair_mask, str) or not hair_mask:
            raise SpriteError(f"{label}: appearance.hairColor.mask must be a non-empty path")
        if Path(hair_mask).name != f"{asset_id}-hair-mask.png":
            raise SpriteError(
                f"{label}: hair mask filename must be {asset_id}-hair-mask.png"
            )
        if not isinstance(hair_config.get("palette"), str) or not hair_config["palette"]:
            raise SpriteError(f"{label}: appearance.hairColor.palette must be a non-empty id")
    if allow_event_sheets:
        event_sheets = spec.get("eventSheets", {})
        if not isinstance(event_sheets, dict):
            raise SpriteError(f"{label}: eventSheets must be an object keyed by event name")
        for event_id, event_config in event_sheets.items():
            if not isinstance(event_id, str) or EVENT_ID_PATTERN.fullmatch(event_id) is None:
                raise SpriteError(f"{label}: event sheet names must be lowercase snake case")
            if not isinstance(event_config, dict):
                raise SpriteError(f"{label}: eventSheets.{event_id} must be an object")
            for reserved_key in ("id", "schemaVersion", "eventSheets", "parentAssetId", "eventId"):
                if reserved_key in event_config:
                    raise SpriteError(f"{label}: eventSheets.{event_id} cannot override {reserved_key}")
            event_spec = _event_sheet_spec(spec, event_id, event_config)
            _validate_spec(event_spec, f"{label}: eventSheets.{event_id}", allow_event_sheets=False)
    return spec


def _event_sheet_spec(
    parent_spec: dict[str, Any], event_id: str, event_config: dict[str, Any]
) -> dict[str, Any]:
    sheet_id = f"{parent_spec['id']}_{event_id}"
    event_spec = {
        "schemaVersion": parent_spec["schemaVersion"],
        "id": sheet_id,
        "kind": "effect",
        "parentAssetId": parent_spec["id"],
        "eventId": event_id,
        **event_config,
    }
    return event_spec


def event_sheet_specs(spec: dict[str, Any]) -> list[dict[str, Any]]:
    """Return validated, processable sheet specs declared for runtime events."""
    event_sheets = spec.get("eventSheets", {})
    return [
        _event_sheet_spec(spec, event_id, event_config)
        for event_id, event_config in event_sheets.items()
    ]


def all_sheet_specs(spec: dict[str, Any]) -> list[dict[str, Any]]:
    """Return the primary sheet followed by its event sheets in recipe order."""
    return [spec, *event_sheet_specs(spec)]


def load_spec(path: Path) -> dict[str, Any]:
    try:
        spec = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SpriteError(f"Cannot read sprite spec {path}: {exc}") from exc
    if not isinstance(spec, dict):
        raise SpriteError(f"{path.name}: recipe must be a JSON object")
    return _validate_spec(spec, path.name, allow_event_sheets=True)


def discover_specs(paths: Sequence[str]) -> list[tuple[Path, dict[str, Any]]]:
    if paths:
        spec_paths = [repo_path(path) for path in paths]
    else:
        spec_paths = sorted(DEFAULT_SPEC_DIR.glob("*.json"))
    if not spec_paths:
        raise SpriteError("No sprite specs found")
    return [(path, load_spec(path)) for path in spec_paths]


def alpha_mask(image: Image.Image, threshold: int) -> Image.Image:
    alpha = image.getchannel("A")
    return alpha.point(lambda value: 255 if value >= threshold else 0, mode="1")


def connected_components(mask: Image.Image) -> list[Component]:
    width, height = mask.size
    pixels = mask.convert("L").tobytes()
    visited = bytearray(width * height)
    components: list[Component] = []

    for start in range(width * height):
        if visited[start] or pixels[start] == 0:
            continue
        queue: deque[int] = deque([start])
        visited[start] = 1
        area = 0
        min_x = width
        min_y = height
        max_x = -1
        max_y = -1
        sum_x = 0
        sum_y = 0

        while queue:
            index = queue.popleft()
            y, x = divmod(index, width)
            area += 1
            sum_x += x
            sum_y += y
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)

            for next_y in range(max(0, y - 1), min(height, y + 2)):
                row_start = next_y * width
                for next_x in range(max(0, x - 1), min(width, x + 2)):
                    next_index = row_start + next_x
                    if not visited[next_index] and pixels[next_index] != 0:
                        visited[next_index] = 1
                        queue.append(next_index)

        components.append(
            Component(
                area=area,
                bbox=(min_x, min_y, max_x + 1, max_y + 1),
                center=(sum_x / area, sum_y / area),
            )
        )
    return components


def kmeans_1d(values: Sequence[float], cluster_count: int) -> list[float]:
    if cluster_count == 1:
        return [sum(values) / len(values)]
    ordered = sorted(values)
    centers = [ordered[round(index * (len(ordered) - 1) / (cluster_count - 1))] for index in range(cluster_count)]
    for _ in range(50):
        groups = [[] for _ in centers]
        for value in values:
            group_index = min(range(len(centers)), key=lambda index: abs(value - centers[index]))
            groups[group_index].append(value)
        if any(not group for group in groups):
            raise SpriteError("Detected subjects cannot be separated into the declared rows or columns")
        next_centers = [sum(group) / len(group) for group in groups]
        if all(abs(left - right) < 0.01 for left, right in zip(centers, next_centers)):
            break
        centers = next_centers
    return sorted(centers)


def choose_primary_components(
    image: Image.Image, expected: int, detection: dict[str, Any]
) -> tuple[list[Component], float, float]:
    threshold = int(detection.get("alphaThreshold", 32))
    max_dimension = int(detection.get("analysisMaxDimension", 700))
    scale = min(1.0, max_dimension / max(image.size))
    analysis = image
    if scale < 1:
        analysis = image.resize(
            (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
            RESAMPLING.NEAREST,
        )
    components = connected_components(alpha_mask(analysis, threshold))
    min_ratio = float(detection.get("minPrimaryAreaRatio", 0.001))
    min_area = max(4, round(analysis.width * analysis.height * min_ratio))
    eligible = sorted((component for component in components if component.area >= min_area), key=lambda item: item.area, reverse=True)
    if len(eligible) < expected:
        raise SpriteError(
            f"Found {len(eligible)} primary subjects but expected {expected}; "
            "adjust detection.alphaThreshold or minPrimaryAreaRatio only after visual inspection"
        )

    selected = eligible[:expected]
    ambiguity_ratio = float(detection.get("ambiguityRatio", 0.45))
    next_ratio = 0.0
    if len(eligible) > expected:
        next_ratio = eligible[expected].area / selected[-1].area
        if next_ratio >= ambiguity_ratio:
            raise SpriteError(
                f"Subject detection is ambiguous: the next component is {next_ratio:.2f} of the smallest selected subject "
                f"(limit {ambiguity_ratio:.2f})"
            )
    return selected, scale, next_ratio


def nearest_index(value: float, centers: Sequence[float]) -> int:
    return min(range(len(centers)), key=lambda index: abs(value - centers[index]))


def partition_edges(centers: Sequence[float], extent: int, inverse_scale: float) -> list[int]:
    original_centers = [center * inverse_scale for center in centers]
    edges = [0]
    edges.extend(round((left + right) / 2) for left, right in zip(original_centers, original_centers[1:]))
    edges.append(extent)
    return edges


def detect_frame_regions(image: Image.Image, spec: dict[str, Any]) -> tuple[list[tuple[int, int, int, int]], dict[str, Any]]:
    layout = spec["sourceLayout"]
    rows = int(layout["rows"])
    columns = int(layout["columns"])
    expected = rows * columns
    manual_regions = layout.get("regions")
    if manual_regions is not None:
        if not isinstance(manual_regions, list) or len(manual_regions) != expected:
            raise SpriteError(f"sourceLayout.regions must contain exactly {expected} boxes")
        regions: list[tuple[int, int, int, int]] = []
        for index, value in enumerate(manual_regions):
            if not isinstance(value, list) or len(value) != 4 or not all(isinstance(item, int) for item in value):
                raise SpriteError(f"Manual source region {index} must be [left, top, right, bottom] integers")
            left, top, right, bottom = value
            if left < 0 or top < 0 or right > image.width or bottom > image.height or left >= right or top >= bottom:
                raise SpriteError(f"Manual source region {index} is outside the source image: {value}")
            regions.append((left, top, right, bottom))
        return regions, {"mode": "manual", "regions": [list(region) for region in regions]}

    detection = spec.get("detection", {})
    selected, scale, next_ratio = choose_primary_components(image, expected, detection)

    x_centers = kmeans_1d([component.center[0] for component in selected], columns)
    y_centers = kmeans_1d([component.center[1] for component in selected], rows)
    assignments: dict[tuple[int, int], Component] = {}
    for component in selected:
        column = nearest_index(component.center[0], x_centers)
        row = nearest_index(component.center[1], y_centers)
        key = (row, column)
        if key in assignments:
            raise SpriteError(f"Two detected subjects map to source cell row {row}, column {column}")
        assignments[key] = component
    expected_cells = {(row, column) for row in range(rows) for column in range(columns)}
    missing = expected_cells - assignments.keys()
    if missing:
        raise SpriteError(f"No primary subject was detected for source cells: {sorted(missing)}")

    inverse_scale = 1.0 / scale
    x_edges = partition_edges(x_centers, image.width, inverse_scale)
    y_edges = partition_edges(y_centers, image.height, inverse_scale)
    regions = [
        (x_edges[column], y_edges[row], x_edges[column + 1], y_edges[row + 1])
        for row in range(rows)
        for column in range(columns)
    ]
    diagnostics = {
        "analysisScale": scale,
        "selectedComponentAreas": [component.area for component in selected],
        "nextComponentRatio": round(next_ratio, 4),
        "xCenters": [round(value * inverse_scale, 2) for value in x_centers],
        "yCenters": [round(value * inverse_scale, 2) for value in y_centers],
        "regions": [list(region) for region in regions],
    }
    return regions, diagnostics


def threshold_bbox(image: Image.Image, threshold: int) -> tuple[int, int, int, int] | None:
    return alpha_mask(image, threshold).getbbox()


def extract_frames(image: Image.Image, regions: Sequence[tuple[int, int, int, int]], threshold: int) -> list[Image.Image]:
    frames: list[Image.Image] = []
    for index, region in enumerate(regions):
        region_image = image.crop(region)
        bbox = threshold_bbox(region_image, threshold)
        if bbox is None:
            raise SpriteError(f"Detected source frame {index} is empty")
        frames.append(region_image.crop(bbox))
    return frames


def resized_frames(frames: Sequence[Image.Image], alignment: dict[str, Any]) -> list[Image.Image]:
    box_width = int(alignment["contentBox"]["width"])
    box_height = int(alignment["contentBox"]["height"])
    mode = alignment.get("resizeMode", "contain_shared")
    if box_width <= 0 or box_height <= 0:
        raise SpriteError("alignment.contentBox dimensions must be positive")

    if mode == "stretch_each":
        return [frame.resize((box_width, box_height), RESAMPLING.NEAREST) for frame in frames]

    if mode == "contain_shared":
        scale = min(box_width / max(frame.width for frame in frames), box_height / max(frame.height for frame in frames))
        scales = [scale] * len(frames)
    elif mode == "contain_each":
        scales = [min(box_width / frame.width, box_height / frame.height) for frame in frames]
    else:
        raise SpriteError(f"Unsupported resizeMode {mode!r}")

    resized: list[Image.Image] = []
    for frame, scale in zip(frames, scales):
        width = max(1, min(box_width, round(frame.width * scale)))
        height = max(1, min(box_height, round(frame.height * scale)))
        resized.append(frame.resize((width, height), RESAMPLING.NEAREST))
    return resized


def pixel_luminance(red: int, green: int, blue: int) -> float:
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def landmark_center(image: Image.Image, mode: str, alignment: dict[str, Any]) -> tuple[float, float]:
    if mode == "center":
        return image.width / 2, image.height / 2

    landmark = alignment.get("landmark", {})
    alpha_threshold = int(landmark.get("alphaThreshold", 96))
    region = landmark.get("region", [0.0, 0.0, 1.0, 1.0])
    if len(region) != 4:
        raise SpriteError("alignment.landmark.region must contain four fractions")
    left = max(0, math.floor(image.width * float(region[0])))
    top = max(0, math.floor(image.height * float(region[1])))
    right = min(image.width, math.ceil(image.width * float(region[2])))
    bottom = min(image.height, math.ceil(image.height * float(region[3])))
    minimum = float(landmark.get("minLuminance", 215))
    maximum = float(landmark.get("maxLuminance", 80))
    points: list[tuple[int, int]] = []
    pixels = image.load()
    for y in range(top, bottom):
        for x in range(left, right):
            red, green, blue, alpha = pixels[x, y]
            if alpha < alpha_threshold:
                continue
            luminance = pixel_luminance(red, green, blue)
            if mode == "bright_core" and luminance >= minimum:
                points.append((x, y))
            elif mode == "dark_opening" and luminance <= maximum:
                points.append((x, y))
    minimum_pixels = int(landmark.get("minimumPixels", 3))
    if len(points) < minimum_pixels:
        raise SpriteError(f"Could not find a stable {mode} landmark ({len(points)} pixels, need {minimum_pixels})")
    return (
        sum(point[0] for point in points) / len(points),
        sum(point[1] for point in points) / len(points),
    )


def place_frame(frame: Image.Image, spec: dict[str, Any], frame_index: int) -> tuple[Image.Image, dict[str, Any]]:
    sheet = spec["sheet"]
    frame_width = int(sheet["frameWidth"])
    frame_height = int(sheet["frameHeight"])
    alignment = spec["alignment"]
    mode = alignment["mode"]
    anchor = alignment["anchor"]
    target_x = float(anchor["x"])
    target_y = float(anchor["y"])

    if mode == "manual":
        placement = alignment["manualPlacements"][frame_index]
        paste_x = int(placement["x"])
        paste_y = int(placement["y"])
        local_x = 0.0
        local_y = 0.0
        target_x = float(paste_x)
        target_y = float(paste_y)
    elif mode in {"bottom_center", "fixed_envelope"}:
        local_x, local_y = frame.width / 2, frame.height
    elif mode == "center":
        local_x, local_y = frame.width / 2, frame.height / 2
    else:
        target = alignment.get("landmark", {}).get("target")
        if target:
            target_x = float(target["x"])
            target_y = float(target["y"])
        local_x, local_y = landmark_center(frame, mode, alignment)

    if mode != "manual":
        paste_x = round(target_x - local_x)
        paste_y = round(target_y - local_y)
    if paste_x < 0 or paste_y < 0 or paste_x + frame.width > frame_width or paste_y + frame.height > frame_height:
        raise SpriteError(
            f"Automatic alignment would be clipped: {frame.size} at ({paste_x}, {paste_y}) in {frame_width}x{frame_height}"
        )
    offset = frame_offsets(spec)[frame_index]
    paste_x += offset["x"]
    paste_y += offset["y"]
    if (
        paste_x >= frame_width
        or paste_y >= frame_height
        or paste_x + frame.width <= 0
        or paste_y + frame.height <= 0
    ):
        raise SpriteError(
            f"Frame offset would move the artwork completely outside the frame: {frame.size} at ({paste_x}, {paste_y}) in {frame_width}x{frame_height}"
        )
    clipped = (
        paste_x < 0
        or paste_y < 0
        or paste_x + frame.width > frame_width
        or paste_y + frame.height > frame_height
    )
    canvas = Image.new("RGBA", (frame_width, frame_height), (0, 0, 0, 0))
    canvas.alpha_composite(frame, (paste_x, paste_y))
    return canvas, {
        "size": [frame.width, frame.height],
        "paste": [paste_x, paste_y],
        "localLandmark": [round(local_x, 3), round(local_y, 3)],
        "target": [target_x, target_y],
        "frameOffset": [offset["x"], offset["y"]],
        "intentionallyClipped": clipped,
    }


def assemble_sheet(frames: Sequence[Image.Image], spec: dict[str, Any]) -> Image.Image:
    sheet = spec["sheet"]
    columns = int(sheet["columns"])
    rows = int(sheet["rows"])
    frame_width = int(sheet["frameWidth"])
    frame_height = int(sheet["frameHeight"])
    if len(frames) != columns * rows:
        raise SpriteError(f"Cannot assemble {len(frames)} frames into a {columns}x{rows} sheet")
    output = Image.new("RGBA", (columns * frame_width, rows * frame_height), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        column = index % columns
        row = index // columns
        output.alpha_composite(frame, (column * frame_width, row * frame_height))
    return output


def normalize(spec: dict[str, Any]) -> tuple[Image.Image, dict[str, Any]]:
    source_path = repo_path(spec["source"])
    if not source_path.exists():
        raise SpriteError(f"Source image does not exist: {source_path}")
    with Image.open(source_path) as opened:
        if opened.format != "PNG":
            raise SpriteError(f"Source master must be PNG, found {opened.format}")
        if "A" not in opened.getbands():
            raise SpriteError("Source master has no alpha channel; a visible checkerboard is not transparency")
        source_alpha = opened.getchannel("A").getextrema()
        if source_alpha[0] != 0:
            raise SpriteError("Source master has no fully transparent pixels; verify that its background is genuine alpha")
        if source_alpha[1] == 0:
            raise SpriteError("Source master is completely transparent")
        source = opened.convert("RGBA")
    regions, detection = detect_frame_regions(source, spec)
    threshold = int(spec.get("detection", {}).get("alphaThreshold", 32))
    extracted = extract_frames(source, regions, threshold)
    resized = resized_frames(extracted, spec["alignment"])
    placed: list[Image.Image] = []
    placements: list[dict[str, Any]] = []
    for index, frame in enumerate(resized):
        canvas, placement = place_frame(frame, spec, index)
        placed.append(canvas)
        placements.append(placement)
    return assemble_sheet(placed, spec), {
        "source": str(source_path.relative_to(REPO_ROOT)),
        "sourceSize": list(source.size),
        "detection": detection,
        "placements": placements,
    }


def split_sheet(image: Image.Image, spec: dict[str, Any]) -> list[Image.Image]:
    sheet = spec["sheet"]
    columns = int(sheet["columns"])
    rows = int(sheet["rows"])
    frame_width = int(sheet["frameWidth"])
    frame_height = int(sheet["frameHeight"])
    return [
        image.crop(
            (
                column * frame_width,
                row * frame_height,
                (column + 1) * frame_width,
                (row + 1) * frame_height,
            )
        )
        for row in range(rows)
        for column in range(columns)
    ]


def skin_mask_path(spec: dict[str, Any]) -> Path:
    config = skin_tone_config(spec)
    if config is None:
        raise SpriteError(f"{spec['id']}: human characters require appearance.skinTone")
    mask = config.get("mask")
    if not isinstance(mask, str) or not mask:
        raise SpriteError(f"{spec['id']}: appearance.skinTone.mask must be a non-empty path")
    return repo_path(mask)


def hair_mask_path(spec: dict[str, Any]) -> Path:
    config = hair_color_config(spec)
    if config is None:
        raise SpriteError(f"{spec['id']}: human characters require appearance.hairColor")
    mask = config.get("mask")
    if not isinstance(mask, str) or not mask:
        raise SpriteError(f"{spec['id']}: appearance.hairColor.mask must be a non-empty path")
    return repo_path(mask)


def _range_pair(value: Any, fallback: list[float], field: str) -> tuple[float, float]:
    selected = value if isinstance(value, list) and len(value) == 2 else fallback
    try:
        low, high = float(selected[0]), float(selected[1])
    except (TypeError, ValueError) as exc:
        raise SpriteError(f"{field} must contain two numbers") from exc
    if low > high:
        raise SpriteError(f"{field} minimum cannot exceed its maximum")
    return low, high


def _skin_candidate(red: int, green: int, blue: int, generation: dict[str, Any]) -> bool:
    hue_low, hue_high = _range_pair(
        generation.get("hueDegrees"), DEFAULT_SKIN_MASK_GENERATION["hueDegrees"], "hueDegrees"
    )
    saturation_low, saturation_high = _range_pair(
        generation.get("saturation"), DEFAULT_SKIN_MASK_GENERATION["saturation"], "saturation"
    )
    value_low, value_high = _range_pair(
        generation.get("value"), DEFAULT_SKIN_MASK_GENERATION["value"], "value"
    )
    green_red_low, green_red_high = _range_pair(
        generation.get("greenRedRatio"),
        DEFAULT_SKIN_MASK_GENERATION["greenRedRatio"],
        "greenRedRatio",
    )
    blue_green_low, blue_green_high = _range_pair(
        generation.get("blueGreenRatio"),
        DEFAULT_SKIN_MASK_GENERATION["blueGreenRatio"],
        "blueGreenRatio",
    )
    minimum_red = int(generation.get("minimumRed", DEFAULT_SKIN_MASK_GENERATION["minimumRed"]))
    if red < minimum_red or red == 0 or green == 0:
        return False
    hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
    hue_degrees = hue * 360
    return (
        hue_low <= hue_degrees <= hue_high
        and saturation_low <= saturation <= saturation_high
        and value_low <= value <= value_high
        and green_red_low <= green / red <= green_red_high
        and blue_green_low <= blue / green <= blue_green_high
    )


def _hair_candidate(red: int, green: int, blue: int, generation: dict[str, Any]) -> bool:
    hue_low, hue_high = _range_pair(
        generation.get("hueDegrees"), DEFAULT_HAIR_MASK_GENERATION["hueDegrees"], "hueDegrees"
    )
    saturation_low, saturation_high = _range_pair(
        generation.get("saturation"), DEFAULT_HAIR_MASK_GENERATION["saturation"], "saturation"
    )
    value_low, value_high = _range_pair(
        generation.get("value"), DEFAULT_HAIR_MASK_GENERATION["value"], "value"
    )
    minimum_red = int(generation.get("minimumRed", DEFAULT_HAIR_MASK_GENERATION["minimumRed"]))
    if red < minimum_red:
        return False
    hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
    hue_degrees = hue * 360
    return (
        hue_low <= hue_degrees <= hue_high
        and saturation_low <= saturation <= saturation_high
        and value_low <= value <= value_high
    )


def _quantile(values: Sequence[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[round((len(ordered) - 1) * fraction)]


def generate_skin_mask(image: Image.Image, spec: dict[str, Any]) -> Image.Image:
    if not is_human_character(spec):
        raise SpriteError(f"{spec['id']}: skin masks are only valid for human characters")
    config = skin_tone_config(spec) or {}
    generation = config.get("maskGeneration", {})
    if not isinstance(generation, dict):
        raise SpriteError(f"{spec['id']}: appearance.skinTone.maskGeneration must be an object")
    rgba = image.convert("RGBA")
    selected: list[tuple[int, float]] = []
    pixels = list(rgba.getdata())
    for index, (red, green, blue, alpha) in enumerate(pixels):
        if alpha > 0 and _skin_candidate(red, green, blue, generation):
            selected.append((index, pixel_luminance(red, green, blue)))
    if not selected:
        raise SpriteError(f"{spec['id']}: automatic skin-mask generation found no skin pixels")
    luminances = [luminance for _, luminance in selected]
    thresholds = [_quantile(luminances, fraction) for fraction in (0.2, 0.5, 0.8)]
    mask_pixels = [(0, 0, 0, 0)] * len(pixels)
    for index, luminance in selected:
        shade_index = sum(luminance > threshold for threshold in thresholds)
        shade = SKIN_MASK_SHADE_VALUES[shade_index]
        mask_pixels[index] = (shade, shade, shade, 255)
    mask = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    mask.putdata(mask_pixels)
    return mask


def generate_hair_mask(
    image: Image.Image, spec: dict[str, Any], skin_mask: Image.Image | None = None
) -> Image.Image:
    if not is_human_character(spec):
        raise SpriteError(f"{spec['id']}: hair masks are only valid for human characters")
    config = hair_color_config(spec) or {}
    generation = config.get("maskGeneration", {})
    if not isinstance(generation, dict):
        raise SpriteError(f"{spec['id']}: appearance.hairColor.maskGeneration must be an object")
    maximum_frame_y = int(
        generation.get("maximumFrameY", DEFAULT_HAIR_MASK_GENERATION["maximumFrameY"])
    )
    frame_height = int(spec["sheet"]["frameHeight"])
    rgba = image.convert("RGBA")
    if skin_mask is None:
        with Image.open(skin_mask_path(spec)) as opened:
            skin_mask = opened.convert("RGBA")
    skin_pixels = list(skin_mask.convert("RGBA").getdata())
    selected: list[tuple[int, float]] = []
    pixels = list(rgba.getdata())
    for index, (red, green, blue, alpha) in enumerate(pixels):
        frame_y = (index // rgba.width) % frame_height
        if (
            alpha > 0
            and skin_pixels[index][3] == 0
            and frame_y <= maximum_frame_y
            and _hair_candidate(red, green, blue, generation)
        ):
            selected.append((index, pixel_luminance(red, green, blue)))
    if not selected:
        raise SpriteError(f"{spec['id']}: automatic hair-mask generation found no hair pixels")
    luminances = [luminance for _, luminance in selected]
    thresholds = [_quantile(luminances, fraction) for fraction in (0.2, 0.5, 0.8)]
    mask_pixels = [(0, 0, 0, 0)] * len(pixels)
    for index, luminance in selected:
        shade_index = sum(luminance > threshold for threshold in thresholds)
        shade = HAIR_MASK_SHADE_VALUES[shade_index]
        mask_pixels[index] = (shade, shade, shade, 255)
    mask = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    mask.putdata(mask_pixels)
    return mask


def _mask_membership(mask: Image.Image) -> list[bool]:
    return [alpha == 255 for *_, alpha in mask.convert("RGBA").getdata()]


def _prune_mask_membership(
    membership: list[bool], image_size: tuple[int, int], frame_size: tuple[int, int], minimum_area: int
) -> list[bool]:
    width, height = image_size
    frame_width, frame_height = frame_size
    output = [False] * len(membership)
    visited = bytearray(len(membership))
    for frame_y in range(0, height, frame_height):
        for frame_x in range(0, width, frame_width):
            for y in range(frame_y, frame_y + frame_height):
                for x in range(frame_x, frame_x + frame_width):
                    start = y * width + x
                    if visited[start] or not membership[start]:
                        continue
                    queue: deque[int] = deque([start])
                    visited[start] = 1
                    component: list[int] = []
                    while queue:
                        index = queue.popleft()
                        component.append(index)
                        current_y, current_x = divmod(index, width)
                        for delta_y in (-1, 0, 1):
                            for delta_x in (-1, 0, 1):
                                neighbor_x = current_x + delta_x
                                neighbor_y = current_y + delta_y
                                if (
                                    (delta_x == 0 and delta_y == 0)
                                    or neighbor_x < frame_x
                                    or neighbor_x >= frame_x + frame_width
                                    or neighbor_y < frame_y
                                    or neighbor_y >= frame_y + frame_height
                                ):
                                    continue
                                neighbor = neighbor_y * width + neighbor_x
                                if membership[neighbor] and not visited[neighbor]:
                                    visited[neighbor] = 1
                                    queue.append(neighbor)
                    if len(component) >= minimum_area:
                        for index in component:
                            output[index] = True
    return output


def _warm_appearance_candidate(
    pixel: tuple[int, int, int, int], index: int, width: int, frame_height: int, layer: str
) -> bool:
    red, green, blue, alpha = pixel
    if alpha == 0 or red < 40:
        return False
    hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
    hue_degrees = hue * 360
    if not (hue_degrees <= 42 or hue_degrees >= 350):
        return False
    if saturation < 0.14 or value < 0.14:
        return False
    if layer == "hair" and (index // width) % frame_height > 43:
        return False
    return True


def _expand_appearance_membership(
    image: Image.Image,
    spec: dict[str, Any],
    seed: list[bool],
    blocked: list[bool],
    layer: str,
) -> list[bool]:
    rgba = image.convert("RGBA")
    width, _ = rgba.size
    frame_width = int(spec["sheet"]["frameWidth"])
    frame_height = int(spec["sheet"]["frameHeight"])
    pixels = list(rgba.getdata())
    output = seed[:]
    visited = bytearray(len(seed))
    queue: deque[tuple[int, int]] = deque()
    for index, selected in enumerate(seed):
        if selected:
            visited[index] = 1
            queue.append((index, 0))
    while queue:
        index, distance = queue.popleft()
        if distance >= 1:
            continue
        y, x = divmod(index, width)
        frame_x = (x // frame_width) * frame_width
        frame_y = (y // frame_height) * frame_height
        for delta_y in (-1, 0, 1):
            for delta_x in (-1, 0, 1):
                neighbor_x = x + delta_x
                neighbor_y = y + delta_y
                if (
                    (delta_x == 0 and delta_y == 0)
                    or neighbor_x < frame_x
                    or neighbor_x >= frame_x + frame_width
                    or neighbor_y < frame_y
                    or neighbor_y >= frame_y + frame_height
                ):
                    continue
                neighbor = neighbor_y * width + neighbor_x
                if visited[neighbor] or blocked[neighbor]:
                    continue
                if not _warm_appearance_candidate(
                    pixels[neighbor], neighbor, width, frame_height, layer
                ):
                    continue
                visited[neighbor] = 1
                output[neighbor] = True
                queue.append((neighbor, distance + 1))
    return output


def _indexed_mask_from_membership(
    image: Image.Image, membership: list[bool], shade_values: Sequence[int]
) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = list(rgba.getdata())
    luminances = [
        pixel_luminance(*pixels[index][:3])
        for index, selected in enumerate(membership)
        if selected
    ]
    thresholds = [_quantile(luminances, fraction) for fraction in (0.2, 0.5, 0.8)]
    mask_pixels: list[tuple[int, int, int, int]] = []
    for index, selected in enumerate(membership):
        if not selected:
            mask_pixels.append((0, 0, 0, 0))
            continue
        luminance = pixel_luminance(*pixels[index][:3])
        shade = shade_values[sum(luminance > threshold for threshold in thresholds)]
        mask_pixels.append((shade, shade, shade, 255))
    mask = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    mask.putdata(mask_pixels)
    return mask


def generate_appearance_masks(
    image: Image.Image, spec: dict[str, Any]
) -> tuple[Image.Image, Image.Image]:
    """Build mutually exclusive skin and hair masks, including connected accent pixels."""
    skin_seed = generate_skin_mask(image, spec)
    hair_seed = generate_hair_mask(image, spec, skin_seed)
    frame_size = (
        int(spec["sheet"]["frameWidth"]),
        int(spec["sheet"]["frameHeight"]),
    )
    skin_membership = _prune_mask_membership(
        _mask_membership(skin_seed), image.size, frame_size, minimum_area=3
    )
    hair_membership = _prune_mask_membership(
        _mask_membership(hair_seed), image.size, frame_size, minimum_area=3
    )
    skin_membership = _expand_appearance_membership(
        image, spec, skin_membership, hair_membership, "skin"
    )
    hair_membership = _expand_appearance_membership(
        image, spec, hair_membership, skin_membership, "hair"
    )
    return (
        _indexed_mask_from_membership(image, skin_membership, SKIN_MASK_SHADE_VALUES),
        _indexed_mask_from_membership(image, hair_membership, HAIR_MASK_SHADE_VALUES),
    )


def validate_skin_mask(image: Image.Image, spec: dict[str, Any]) -> tuple[list[str], dict[str, Any]]:
    errors: list[str] = []
    measurements: dict[str, Any] = {}
    try:
        palette = load_skin_palette(spec)
        measurements["palette"] = palette["id"]
        measurements["toneCount"] = len(palette["tones"])
    except SpriteError as exc:
        errors.append(str(exc))
    try:
        path = skin_mask_path(spec)
        with Image.open(path) as opened:
            source_format = opened.format
            source_mode = opened.mode
            mask = opened.convert("RGBA")
    except (OSError, SpriteError) as exc:
        errors.append(f"Cannot read skin mask: {exc}")
        return errors, measurements
    measurements["mask"] = str(path.relative_to(REPO_ROOT))
    if source_format != "PNG":
        errors.append(f"Skin mask must be PNG, found {source_format}")
    if source_mode != "RGBA":
        errors.append(f"Skin mask must use RGBA mode, found {source_mode}")
    if mask.size != image.size:
        errors.append(
            f"Skin mask must match the {image.width}x{image.height} runtime sheet; "
            f"found {mask.width}x{mask.height}"
        )
        return errors, measurements

    sprite_pixels = list(image.convert("RGBA").getdata())
    mask_pixels = list(mask.getdata())
    masked = 0
    outside_sprite = 0
    invalid_alpha = 0
    invalid_color = 0
    allowed = set(SKIN_MASK_SHADE_VALUES)
    for sprite_pixel, mask_pixel in zip(sprite_pixels, mask_pixels):
        red, green, blue, alpha = mask_pixel
        if alpha not in {0, 255}:
            invalid_alpha += 1
        if alpha == 0:
            continue
        masked += 1
        if sprite_pixel[3] == 0:
            outside_sprite += 1
        if red != green or green != blue or red not in allowed:
            invalid_color += 1
    measurements["maskedPixels"] = masked
    measurements["outsideSpritePixels"] = outside_sprite
    measurements["shadeValues"] = list(SKIN_MASK_SHADE_VALUES)
    if masked == 0:
        errors.append("Skin mask contains no selected pixels")
    if outside_sprite:
        errors.append(f"Skin mask extends onto {outside_sprite} fully transparent sprite pixels")
    if invalid_alpha:
        errors.append(f"Skin mask has {invalid_alpha} pixels with non-binary membership alpha")
    if invalid_color:
        errors.append(f"Skin mask has {invalid_color} pixels outside the four grayscale shade indexes")

    frame_counts: list[int] = []
    for frame in split_sheet(mask, spec):
        frame_counts.append(sum(1 for *_, alpha in frame.getdata() if alpha == 255))
    measurements["frameMaskedPixels"] = frame_counts
    minimum = int((skin_tone_config(spec) or {}).get("minimumPixelsPerFrame", 6))
    for index, count in enumerate(frame_counts):
        if count < minimum:
            errors.append(
                f"Skin mask frame {index} has {count} selected pixels; expected at least {minimum}"
            )
    return errors, measurements


def validate_hair_mask(image: Image.Image, spec: dict[str, Any]) -> tuple[list[str], dict[str, Any]]:
    errors: list[str] = []
    measurements: dict[str, Any] = {}
    try:
        palette = load_hair_palette(spec)
        measurements["palette"] = palette["id"]
        measurements["colorCount"] = len(palette["colors"])
    except SpriteError as exc:
        errors.append(str(exc))
    try:
        path = hair_mask_path(spec)
        with Image.open(path) as opened:
            source_format = opened.format
            source_mode = opened.mode
            mask = opened.convert("RGBA")
        with Image.open(skin_mask_path(spec)) as opened:
            skin_mask = opened.convert("RGBA")
    except (OSError, SpriteError) as exc:
        errors.append(f"Cannot read hair mask: {exc}")
        return errors, measurements
    measurements["mask"] = str(path.relative_to(REPO_ROOT))
    if source_format != "PNG":
        errors.append(f"Hair mask must be PNG, found {source_format}")
    if source_mode != "RGBA":
        errors.append(f"Hair mask must use RGBA mode, found {source_mode}")
    if mask.size != image.size:
        errors.append(
            f"Hair mask must match the {image.width}x{image.height} runtime sheet; "
            f"found {mask.width}x{mask.height}"
        )
        return errors, measurements
    if skin_mask.size != image.size:
        errors.append("Skin mask must match the runtime sheet before overlap can be checked")
        return errors, measurements

    sprite_pixels = list(image.convert("RGBA").getdata())
    mask_pixels = list(mask.getdata())
    skin_pixels = list(skin_mask.getdata())
    masked = outside_sprite = invalid_alpha = invalid_color = overlaps_skin = 0
    allowed = set(HAIR_MASK_SHADE_VALUES)
    for sprite_pixel, mask_pixel, skin_pixel in zip(sprite_pixels, mask_pixels, skin_pixels):
        red, green, blue, alpha = mask_pixel
        if alpha not in {0, 255}:
            invalid_alpha += 1
        if alpha == 0:
            continue
        masked += 1
        if sprite_pixel[3] == 0:
            outside_sprite += 1
        if skin_pixel[3] == 255:
            overlaps_skin += 1
        if red != green or green != blue or red not in allowed:
            invalid_color += 1
    measurements.update({
        "maskedPixels": masked,
        "outsideSpritePixels": outside_sprite,
        "skinOverlapPixels": overlaps_skin,
        "shadeValues": list(HAIR_MASK_SHADE_VALUES),
    })
    if masked == 0:
        errors.append("Hair mask contains no selected pixels")
    if outside_sprite:
        errors.append(f"Hair mask extends onto {outside_sprite} fully transparent sprite pixels")
    if overlaps_skin:
        errors.append(f"Hair mask overlaps the skin mask at {overlaps_skin} pixels")
    if invalid_alpha:
        errors.append(f"Hair mask has {invalid_alpha} pixels with non-binary membership alpha")
    if invalid_color:
        errors.append(f"Hair mask has {invalid_color} pixels outside the four grayscale shade indexes")

    frame_counts = [
        sum(1 for *_, alpha in frame.getdata() if alpha == 255)
        for frame in split_sheet(mask, spec)
    ]
    measurements["frameMaskedPixels"] = frame_counts
    minimum = int((hair_color_config(spec) or {}).get("minimumPixelsPerFrame", 12))
    for index, count in enumerate(frame_counts):
        if count < minimum:
            errors.append(
                f"Hair mask frame {index} has {count} selected pixels; expected at least {minimum}"
            )
    return errors, measurements


def apply_skin_tone(image: Image.Image, mask: Image.Image, colors: Sequence[str]) -> Image.Image:
    if len(colors) != len(SKIN_MASK_SHADE_VALUES):
        raise SpriteError("Skin-tone ramps require four colors")
    ramp = [ImageColor.getrgb(color) for color in colors]
    output = image.convert("RGBA")
    output_pixels = list(output.getdata())
    for index, mask_pixel in enumerate(mask.convert("RGBA").getdata()):
        if mask_pixel[3] == 0:
            continue
        try:
            shade_index = SKIN_MASK_SHADE_VALUES.index(mask_pixel[0])
        except ValueError:
            continue
        red, green, blue = ramp[shade_index]
        output_pixels[index] = (red, green, blue, output_pixels[index][3])
    output.putdata(output_pixels)
    return output


def apply_hair_color(image: Image.Image, mask: Image.Image, colors: Sequence[str]) -> Image.Image:
    if len(colors) != len(HAIR_MASK_SHADE_VALUES):
        raise SpriteError("Hair-color ramps require four colors")
    return apply_skin_tone(image, mask, colors)


def write_skin_tone_preview(
    image: Image.Image, spec: dict[str, Any], report_dir: Path
) -> str:
    palette = load_skin_palette(spec)
    with Image.open(skin_mask_path(spec)) as opened:
        mask = opened.convert("RGBA")
    columns = int(spec["sheet"]["columns"])
    frame_width = int(spec["sheet"]["frameWidth"])
    frame_height = int(spec["sheet"]["frameHeight"])
    idle_indexes = [row * columns for row in range(int(spec["sheet"]["rows"]))]
    preview = Image.new(
        "RGBA",
        (len(idle_indexes) * frame_width, len(palette["tones"]) * frame_height),
        (0, 0, 0, 0),
    )
    for tone_row, tone in enumerate(palette["tones"]):
        tinted = apply_skin_tone(image, mask, tone["colors"])
        frames = split_sheet(tinted, spec)
        for column, frame_index in enumerate(idle_indexes):
            cell = checkerboard((frame_width, frame_height), max(2, frame_width // 4))
            cell.alpha_composite(frames[frame_index])
            preview.alpha_composite(cell, (column * frame_width, tone_row * frame_height))
    preview_path = report_dir / f"{spec['id']}-skin-tones.png"
    preview.resize((preview.width * 2, preview.height * 2), RESAMPLING.NEAREST).save(preview_path)
    return str(preview_path.relative_to(REPO_ROOT))


def write_hair_color_preview(
    image: Image.Image, spec: dict[str, Any], report_dir: Path
) -> str:
    skin_palette = load_skin_palette(spec)
    default_skin = next(
        tone for tone in skin_palette["tones"] if tone["id"] == skin_palette["defaultToneId"]
    )
    with Image.open(skin_mask_path(spec)) as opened:
        skin_mask = opened.convert("RGBA")
    base = apply_skin_tone(image, skin_mask, default_skin["colors"])
    palette = load_hair_palette(spec)
    with Image.open(hair_mask_path(spec)) as opened:
        mask = opened.convert("RGBA")
    columns = int(spec["sheet"]["columns"])
    frame_width = int(spec["sheet"]["frameWidth"])
    frame_height = int(spec["sheet"]["frameHeight"])
    idle_indexes = [row * columns for row in range(int(spec["sheet"]["rows"]))]
    preview = Image.new(
        "RGBA",
        (len(idle_indexes) * frame_width, len(palette["colors"]) * frame_height),
        (0, 0, 0, 0),
    )
    for color_row, color in enumerate(palette["colors"]):
        tinted = apply_hair_color(base, mask, color["colors"])
        frames = split_sheet(tinted, spec)
        for column, frame_index in enumerate(idle_indexes):
            cell = checkerboard((frame_width, frame_height), max(2, frame_width // 4))
            cell.alpha_composite(frames[frame_index])
            preview.alpha_composite(cell, (column * frame_width, color_row * frame_height))
    preview_path = report_dir / f"{spec['id']}-hair-colors.png"
    preview.resize((preview.width * 2, preview.height * 2), RESAMPLING.NEAREST).save(preview_path)
    return str(preview_path.relative_to(REPO_ROOT))


def bbox_measurement(frame: Image.Image, threshold: int) -> list[int] | None:
    bbox = threshold_bbox(frame, threshold)
    return list(bbox) if bbox else None


def validate(image_path: Path, spec: dict[str, Any]) -> ValidationResult:
    errors: list[str] = []
    warnings: list[str] = []
    measurements: dict[str, Any] = {}
    try:
        with Image.open(image_path) as opened:
            source_format = opened.format
            source_mode = opened.mode
            image = opened.convert("RGBA")
    except OSError as exc:
        return ValidationResult(spec["id"], str(image_path), False, [f"Cannot read PNG: {exc}"], [], {})

    sheet = spec["sheet"]
    expected_size = (
        int(sheet["columns"]) * int(sheet["frameWidth"]),
        int(sheet["rows"]) * int(sheet["frameHeight"]),
    )
    if source_format != "PNG":
        errors.append(f"Expected PNG format, found {source_format}")
    if source_mode != "RGBA":
        errors.append(f"Expected RGBA mode, found {source_mode}")
    if image.size != expected_size:
        errors.append(f"Expected sheet size {expected_size[0]}x{expected_size[1]}, found {image.width}x{image.height}")
        return ValidationResult(spec["id"], str(image_path), False, errors, warnings, measurements)

    extrema = image.getchannel("A").getextrema()
    measurements["alphaRange"] = list(extrema)
    allow_opaque_full_frame = spec.get("validation", {}).get("allowOpaqueFullFrame", False)
    if extrema[0] != 0 and not allow_opaque_full_frame:
        errors.append("Sheet has no fully transparent background pixels")
    if extrema[1] == 0:
        errors.append("Sheet is completely transparent")

    if is_human_character(spec):
        skin_errors, skin_measurements = validate_skin_mask(image, spec)
        errors.extend(skin_errors)
        measurements["skinTone"] = skin_measurements
        hair_errors, hair_measurements = validate_hair_mask(image, spec)
        errors.extend(hair_errors)
        measurements["hairColor"] = hair_measurements

    threshold = int(spec.get("validation", {}).get("alphaThreshold", spec.get("detection", {}).get("alphaThreshold", 32)))
    frames = split_sheet(image, spec)
    bboxes = [bbox_measurement(frame, threshold) for frame in frames]
    measurements["frameBboxes"] = bboxes
    offsets = frame_offsets(spec)
    measurements["frameOffsets"] = [[offset["x"], offset["y"]] for offset in offsets]
    required_padding = int(spec.get("validation", {}).get("requiredPadding", 0))
    intentionally_clipped: set[int] = set()
    for index, bbox in enumerate(bboxes):
        if bbox is None:
            errors.append(f"Frame {index} is empty")
            continue
        left, top, right, bottom = bbox
        offset = offsets[index]
        clipped_left = offset["x"] < 0 and left == 0
        clipped_top = offset["y"] < 0 and top == 0
        clipped_right = offset["x"] > 0 and right == frames[index].width
        clipped_bottom = offset["y"] > 0 and bottom == frames[index].height
        if clipped_left or clipped_top or clipped_right or clipped_bottom:
            intentionally_clipped.add(index)
        if (
            (not clipped_left and left < required_padding)
            or (not clipped_top and top < required_padding)
            or (not clipped_right and right > frames[index].width - required_padding)
            or (not clipped_bottom and bottom > frames[index].height - required_padding)
        ):
            errors.append(f"Frame {index} violates the required {required_padding}px transparent padding: {bbox}")

    measurements["intentionallyClippedFrames"] = sorted(intentionally_clipped)
    nonempty_entries = [
        (index, bbox, offsets[index]) for index, bbox in enumerate(bboxes) if bbox
    ]
    nonempty = [bbox for _, bbox, _ in nonempty_entries]
    if nonempty:
        widths = [bbox[2] - bbox[0] for bbox in nonempty]
        heights = [bbox[3] - bbox[1] for bbox in nonempty]
        center_x = [(bbox[0] + bbox[2]) / 2 for bbox in nonempty]
        center_y = [(bbox[1] + bbox[3]) / 2 for bbox in nonempty]
        bottoms = [bbox[3] for bbox in nonempty]
        adjusted_bottom_entries = [
            (index, bbox[3] - offset["y"])
            for index, bbox, offset in nonempty_entries
            if index not in intentionally_clipped
        ]
        measurements["bboxWidthRange"] = [min(widths), max(widths)]
        measurements["bboxHeightRange"] = [min(heights), max(heights)]
        measurements["bboxCenterXRange"] = [min(center_x), max(center_x)]
        measurements["bboxCenterYRange"] = [min(center_y), max(center_y)]
        measurements["bboxBottomRange"] = [min(bottoms), max(bottoms)]

        mode = spec["alignment"]["mode"]
        tolerance = float(spec.get("validation", {}).get("pivotTolerance", 1.0))
        adjusted_bottoms = [bottom for _, bottom in adjusted_bottom_entries]
        if (
            mode in {"bottom_center", "fixed_envelope"}
            and len(adjusted_bottoms) > 1
            and max(adjusted_bottoms) - min(adjusted_bottoms) > tolerance
        ):
            errors.append(
                "Frame baselines drift before recorded offsets by "
                f"{max(adjusted_bottoms) - min(adjusted_bottoms):.1f}px "
                f"(limit {tolerance:.1f}px)"
            )
        if mode in {"bottom_center", "fixed_envelope"}:
            anchor_y = float(spec["alignment"]["anchor"]["y"])
            for index, bottom in adjusted_bottom_entries:
                if abs(bottom - anchor_y) > tolerance:
                    errors.append(
                        f"Frame {index} baseline before its recorded offset is at {bottom}px "
                        f"instead of anchor {anchor_y:g}px "
                        f"(limit {tolerance:.1f}px)"
                    )
        if mode == "fixed_envelope":
            envelope_tolerance = float(spec.get("validation", {}).get("envelopeTolerance", 1.0))
            envelope_bboxes = [
                bbox for index, bbox, _ in nonempty_entries
                if index not in intentionally_clipped
            ]
            envelope_widths = [bbox[2] - bbox[0] for bbox in envelope_bboxes]
            envelope_heights = [bbox[3] - bbox[1] for bbox in envelope_bboxes]
            if envelope_bboxes and (
                max(envelope_widths) - min(envelope_widths) > envelope_tolerance
                or max(envelope_heights) - min(envelope_heights) > envelope_tolerance
            ):
                errors.append(
                    "Structural envelope changes by more than "
                    f"{envelope_tolerance:.1f}px (widths {min(envelope_widths)}-{max(envelope_widths)}, heights {min(envelope_heights)}-{max(envelope_heights)})"
                )

        if mode in {"bright_core", "dark_opening"}:
            target = spec["alignment"].get("landmark", {}).get("target", spec["alignment"]["anchor"])
            landmark_points: list[list[float] | None] = []
            for index, frame in enumerate(frames):
                if index in intentionally_clipped:
                    landmark_points.append(None)
                    continue
                try:
                    point = landmark_center(frame, mode, spec["alignment"])
                    landmark_points.append([round(point[0], 3), round(point[1], 3)])
                    expected = (
                        float(target["x"]) + offsets[index]["x"],
                        float(target["y"]) + offsets[index]["y"],
                    )
                    distance = math.dist(point, expected)
                    if distance > tolerance:
                        errors.append(
                            f"Frame {index} {mode} landmark is {distance:.2f}px from target (limit {tolerance:.2f}px)"
                        )
                except SpriteError as exc:
                    landmark_points.append(None)
                    errors.append(f"Frame {index}: {exc}")
            measurements["landmarks"] = landmark_points

        if len(nonempty) > 1 and max(center_x) - min(center_x) > float(
            spec.get("validation", {}).get("centerDriftWarning", 3.0)
        ):
            warnings.append(
                f"Visible alpha centers vary by {max(center_x) - min(center_x):.1f}px; inspect the animation preview"
            )

    return ValidationResult(spec["id"], str(image_path), not errors, errors, warnings, measurements)


def checkerboard(size: tuple[int, int], block: int) -> Image.Image:
    image = Image.new("RGBA", size, (205, 205, 205, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], block):
        for x in range(0, size[0], block):
            if (x // block + y // block) % 2:
                draw.rectangle((x, y, min(size[0], x + block) - 1, min(size[1], y + block) - 1), fill=(235, 235, 235, 255))
    return image


def write_previews(image: Image.Image, spec: dict[str, Any], report_dir: Path) -> dict[str, str]:
    report_dir.mkdir(parents=True, exist_ok=True)
    frames = split_sheet(image, spec)
    scale = int(spec.get("preview", {}).get("scale", 8))
    sheet = spec["sheet"]
    frame_width = int(sheet["frameWidth"])
    frame_height = int(sheet["frameHeight"])
    anchor = spec["alignment"]["anchor"]

    background = checkerboard(image.size, max(2, min(frame_width, frame_height) // 4))
    background.alpha_composite(image)
    draw = ImageDraw.Draw(background)
    for column in range(1, int(sheet["columns"])):
        x = column * frame_width
        draw.line((x, 0, x, image.height - 1), fill=(255, 0, 255, 255), width=1)
    for row in range(1, int(sheet["rows"])):
        y = row * frame_height
        draw.line((0, y, image.width - 1, y), fill=(255, 0, 255, 255), width=1)
    for row in range(int(sheet["rows"])):
        for column in range(int(sheet["columns"])):
            x = column * frame_width + int(anchor["x"])
            y = row * frame_height + int(anchor["y"])
            draw.line((x - 2, y, x + 2, y), fill=(255, 255, 0, 255), width=1)
            draw.line((x, y - 2, x, y + 2), fill=(255, 255, 0, 255), width=1)
    contact_path = report_dir / f"{spec['id']}-contact.png"
    background.resize((background.width * scale, background.height * scale), RESAMPLING.NEAREST).save(contact_path)

    animation_frames: list[Image.Image] = []
    for frame in frames:
        canvas = checkerboard(frame.size, max(2, min(frame.size) // 4))
        canvas.alpha_composite(frame)
        animation_frames.append(canvas.resize((frame.width * scale, frame.height * scale), RESAMPLING.NEAREST).convert("P"))
    animation = spec.get("animation", {})
    fps = max(1, int(animation.get("fps", 8)))
    gif_path = report_dir / f"{spec['id']}-preview.gif"
    save_options: dict[str, Any] = {
        "save_all": True,
        "append_images": animation_frames[1:],
        "duration": round(1000 / fps),
        "disposal": 2,
    }
    if animation.get("loop", True):
        save_options["loop"] = 0
    animation_frames[0].save(gif_path, **save_options)
    previews = {
        "contactSheet": str(contact_path.relative_to(REPO_ROOT)),
        "animationPreview": str(gif_path.relative_to(REPO_ROOT)),
    }
    if is_human_character(spec):
        try:
            previews["skinTonePreview"] = write_skin_tone_preview(image, spec, report_dir)
            previews["hairColorPreview"] = write_hair_color_preview(image, spec, report_dir)
        except (OSError, SpriteError):
            pass
    return previews


def write_report(
    spec: dict[str, Any], report_dir: Path, validation: ValidationResult, normalization: dict[str, Any] | None, previews: dict[str, str]
) -> Path:
    report_dir.mkdir(parents=True, exist_ok=True)
    report_path = report_dir / f"{spec['id']}-report.json"
    payload = {
        "schemaVersion": 1,
        "assetId": spec["id"],
        "frameLabels": spec.get("frameLabels"),
        "normalization": normalization,
        "validation": validation.as_dict(),
        "previews": previews,
        "humanApprovalRequired": True,
    }
    report_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return report_path


def output_path_for(spec: dict[str, Any], build_dir: Path, replace: bool) -> Path:
    return repo_path(spec["output"]) if replace else build_dir / Path(spec["output"]).name


def stage_offset_appearance_masks(
    image: Image.Image, spec: dict[str, Any], build_dir: Path
) -> dict[str, Any]:
    """Regenerate human masks beside an offset candidate without touching approved masks."""
    staged_spec = copy.deepcopy(spec)
    skin_config = skin_tone_config(staged_spec)
    hair_config = hair_color_config(staged_spec)
    if skin_config is None or hair_config is None:
        raise SpriteError(f"{spec['id']}: offset human sprite is missing its appearance contract")
    skin_output = build_dir / Path(str(skin_config["mask"])).name
    hair_output = build_dir / Path(str(hair_config["mask"])).name
    skin_output.parent.mkdir(parents=True, exist_ok=True)
    skin_mask, hair_mask = generate_appearance_masks(image, spec)
    skin_mask.save(skin_output, format="PNG", optimize=False)
    hair_mask.save(hair_output, format="PNG", optimize=False)
    skin_config["mask"] = str(skin_output.relative_to(REPO_ROOT))
    hair_config["mask"] = str(hair_output.relative_to(REPO_ROOT))
    return staged_spec


def process_one(spec: dict[str, Any], build_dir: Path, report_root: Path, replace: bool) -> ValidationResult:
    normalized, diagnostics = normalize(spec)
    output_path = output_path_for(spec, build_dir, replace)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    normalized.save(output_path, format="PNG", optimize=False)
    validation_spec = spec
    if is_human_character(spec) and has_frame_offsets(spec) and not replace:
        validation_spec = stage_offset_appearance_masks(normalized, spec, build_dir)
    result = validate(output_path, validation_spec)
    asset_report_dir = report_root / spec["id"]
    previews = write_previews(normalized, validation_spec, asset_report_dir)
    report_path = write_report(validation_spec, asset_report_dir, result, diagnostics, previews)
    status = "PASS" if result.passed else "FAIL"
    print(f"{status} {spec['id']}: {output_path.relative_to(REPO_ROOT)}")
    print(f"  report: {report_path.relative_to(REPO_ROOT)}")
    for warning in result.warnings:
        print(f"  warning: {warning}")
    for error in result.errors:
        print(f"  error: {error}")
    return result


def validate_one(spec: dict[str, Any], image_path: Path, report_root: Path) -> ValidationResult:
    result = validate(image_path, spec)
    asset_report_dir = report_root / spec["id"]
    previews: dict[str, str] = {}
    if image_path.exists():
        try:
            with Image.open(image_path) as opened:
                image = opened.convert("RGBA")
            if image.size == (
                int(spec["sheet"]["columns"]) * int(spec["sheet"]["frameWidth"]),
                int(spec["sheet"]["rows"]) * int(spec["sheet"]["frameHeight"]),
            ):
                previews = write_previews(image, spec, asset_report_dir)
        except OSError:
            pass
    report_path = write_report(spec, asset_report_dir, result, None, previews)
    status = "PASS" if result.passed else "FAIL"
    try:
        display_image_path = image_path.relative_to(REPO_ROOT)
    except ValueError:
        display_image_path = image_path
    try:
        display_report_path = report_path.relative_to(REPO_ROOT)
    except ValueError:
        display_report_path = report_path
    print(f"{status} {spec['id']}: {display_image_path}")
    print(f"  report: {display_report_path}")
    for warning in result.warnings:
        print(f"  warning: {warning}")
    for error in result.errors:
        print(f"  error: {error}")
    return result


def generate_skin_mask_one(spec: dict[str, Any], replace: bool) -> Path:
    if not is_human_character(spec):
        raise SpriteError(f"{spec['id']}: skin-mask generation requires a human character recipe")
    image_path = repo_path(spec["output"])
    try:
        with Image.open(image_path) as opened:
            if opened.format != "PNG" or opened.mode != "RGBA":
                raise SpriteError(f"{spec['id']}: approved runtime image must be an RGBA PNG")
            image = opened.convert("RGBA")
    except OSError as exc:
        raise SpriteError(f"Cannot read approved runtime sprite {image_path}: {exc}") from exc
    output_path = skin_mask_path(spec)
    if output_path.exists() and not replace:
        raise SpriteError(
            f"Skin mask already exists: {output_path.relative_to(REPO_ROOT)}; pass --replace to regenerate it"
        )
    mask, _ = generate_appearance_masks(image, spec)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    mask.save(output_path, format="PNG", optimize=False)
    errors, _ = validate_skin_mask(image, spec)
    if errors:
        raise SpriteError("; ".join(errors))
    print(f"WROTE {spec['id']}: {output_path.relative_to(REPO_ROOT)}")
    return output_path


def generate_hair_mask_one(spec: dict[str, Any], replace: bool) -> Path:
    if not is_human_character(spec):
        raise SpriteError(f"{spec['id']}: hair-mask generation requires a human character recipe")
    image_path = repo_path(spec["output"])
    try:
        with Image.open(image_path) as opened:
            if opened.format != "PNG" or opened.mode != "RGBA":
                raise SpriteError(f"{spec['id']}: approved runtime image must be an RGBA PNG")
            image = opened.convert("RGBA")
    except OSError as exc:
        raise SpriteError(f"Cannot read approved runtime sprite {image_path}: {exc}") from exc
    output_path = hair_mask_path(spec)
    if output_path.exists() and not replace:
        raise SpriteError(
            f"Hair mask already exists: {output_path.relative_to(REPO_ROOT)}; pass --replace to regenerate it"
        )
    _, mask = generate_appearance_masks(image, spec)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    mask.save(output_path, format="PNG", optimize=False)
    errors, _ = validate_hair_mask(image, spec)
    if errors:
        raise SpriteError("; ".join(errors))
    print(f"WROTE {spec['id']}: {output_path.relative_to(REPO_ROOT)}")
    return output_path


def generate_appearance_masks_one(spec: dict[str, Any], replace: bool) -> tuple[Path, Path]:
    if not is_human_character(spec):
        raise SpriteError(f"{spec['id']}: appearance-mask generation requires a human character recipe")
    image_path = repo_path(spec["output"])
    try:
        with Image.open(image_path) as opened:
            if opened.format != "PNG" or opened.mode != "RGBA":
                raise SpriteError(f"{spec['id']}: approved runtime image must be an RGBA PNG")
            image = opened.convert("RGBA")
    except OSError as exc:
        raise SpriteError(f"Cannot read approved runtime sprite {image_path}: {exc}") from exc
    skin_path = skin_mask_path(spec)
    hair_path = hair_mask_path(spec)
    existing = [path for path in (skin_path, hair_path) if path.exists()]
    if existing and not replace:
        names = ", ".join(str(path.relative_to(REPO_ROOT)) for path in existing)
        raise SpriteError(f"Appearance mask already exists: {names}; pass --replace to regenerate it")
    skin_mask, hair_mask = generate_appearance_masks(image, spec)
    skin_path.parent.mkdir(parents=True, exist_ok=True)
    hair_path.parent.mkdir(parents=True, exist_ok=True)
    skin_mask.save(skin_path, format="PNG", optimize=False)
    hair_mask.save(hair_path, format="PNG", optimize=False)
    skin_errors, _ = validate_skin_mask(image, spec)
    hair_errors, _ = validate_hair_mask(image, spec)
    if skin_errors or hair_errors:
        raise SpriteError("; ".join(skin_errors + hair_errors))
    print(
        f"WROTE {spec['id']}: {skin_path.relative_to(REPO_ROOT)}, "
        f"{hair_path.relative_to(REPO_ROOT)}"
    )
    return skin_path, hair_path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    normalize_parser = subparsers.add_parser("normalize", help="reconstruct staged sheets without validation reports")
    normalize_parser.add_argument("specs", nargs="*", help="spec paths; defaults to every sprite-specs/*.json")
    normalize_parser.add_argument("--output-dir", default=str(DEFAULT_BUILD_DIR.relative_to(REPO_ROOT)))
    normalize_parser.add_argument("--replace", action="store_true", help="explicitly overwrite each spec's runtime output")

    process_parser = subparsers.add_parser("process", help="normalize, validate, and produce visual reports")
    process_parser.add_argument("specs", nargs="*", help="spec paths; defaults to every sprite-specs/*.json")
    process_parser.add_argument("--output-dir", default=str(DEFAULT_BUILD_DIR.relative_to(REPO_ROOT)))
    process_parser.add_argument("--report-dir", default=str(DEFAULT_REPORT_DIR.relative_to(REPO_ROOT)))
    process_parser.add_argument("--replace", action="store_true", help="explicitly overwrite each spec's runtime output")

    process_all = subparsers.add_parser("process-all", help="process every sprite spec into staging")
    process_all.add_argument("--output-dir", default=str(DEFAULT_BUILD_DIR.relative_to(REPO_ROOT)))
    process_all.add_argument("--report-dir", default=str(DEFAULT_REPORT_DIR.relative_to(REPO_ROOT)))
    process_all.add_argument("--replace", action="store_true", help="explicitly overwrite every runtime output")

    validate_parser = subparsers.add_parser("validate", help="validate approved runtime sheets and create reports")
    validate_parser.add_argument("specs", nargs="*", help="spec paths; defaults to every sprite-specs/*.json")
    validate_parser.add_argument("--report-dir", default=str(DEFAULT_REPORT_DIR.relative_to(REPO_ROOT)))

    skin_parser = subparsers.add_parser(
        "skin-masks", help="generate deterministic four-shade masks for human runtime sheets"
    )
    skin_parser.add_argument("specs", nargs="*", help="human spec paths; defaults to every human recipe")
    skin_parser.add_argument(
        "--replace", action="store_true", help="explicitly overwrite existing skin masks"
    )
    hair_parser = subparsers.add_parser(
        "hair-masks", help="generate deterministic four-shade hair masks for human runtime sheets"
    )
    hair_parser.add_argument("specs", nargs="*", help="human spec paths; defaults to every human recipe")
    hair_parser.add_argument(
        "--replace", action="store_true", help="explicitly overwrite existing hair masks"
    )
    appearance_parser = subparsers.add_parser(
        "appearance-masks",
        help="generate mutually exclusive skin and hair masks for human runtime sheets",
    )
    appearance_parser.add_argument(
        "specs", nargs="*", help="human spec paths; defaults to every human recipe"
    )
    appearance_parser.add_argument(
        "--replace", action="store_true", help="explicitly overwrite existing appearance masks"
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        spec_args = [] if args.command == "process-all" else args.specs
        specs = discover_specs(spec_args)
        build_dir = repo_path(getattr(args, "output_dir", str(DEFAULT_BUILD_DIR.relative_to(REPO_ROOT))))
        report_root = repo_path(getattr(args, "report_dir", str(DEFAULT_REPORT_DIR.relative_to(REPO_ROOT))))
        results: list[ValidationResult] = []

        if args.command == "skin-masks":
            human_specs = [spec for _, spec in specs if is_human_character(spec)]
            if not human_specs:
                raise SpriteError("No human character specs found")
            for spec in human_specs:
                generate_skin_mask_one(spec, args.replace)
            return 0

        if args.command == "hair-masks":
            human_specs = [spec for _, spec in specs if is_human_character(spec)]
            if not human_specs:
                raise SpriteError("No human character specs found")
            for spec in human_specs:
                generate_hair_mask_one(spec, args.replace)
            return 0

        if args.command == "appearance-masks":
            human_specs = [spec for _, spec in specs if is_human_character(spec)]
            if not human_specs:
                raise SpriteError("No human character specs found")
            for spec in human_specs:
                generate_appearance_masks_one(spec, args.replace)
            return 0

        if args.command == "normalize":
            for _, spec in specs:
                for sheet_spec in all_sheet_specs(spec):
                    image, _ = normalize(sheet_spec)
                    output_path = output_path_for(sheet_spec, build_dir, args.replace)
                    output_path.parent.mkdir(parents=True, exist_ok=True)
                    image.save(output_path, format="PNG", optimize=False)
                    print(f"WROTE {sheet_spec['id']}: {output_path.relative_to(REPO_ROOT)}")
            return 0

        if args.command in {"process", "process-all"}:
            processed_specs: list[dict[str, Any]] = []
            for _, spec in specs:
                for sheet_spec in all_sheet_specs(spec):
                    # Always build and validate the whole package in staging first.
                    # Promotion only begins after every primary and event sheet passes.
                    results.append(process_one(sheet_spec, build_dir, report_root, False))
                    processed_specs.append(sheet_spec)
            if args.replace and all(result.passed for result in results):
                appearance_promotions: list[tuple[dict[str, Any], Path, Path]] = []
                for _, spec in specs:
                    if not is_human_character(spec) or not has_frame_offsets(spec):
                        continue
                    for mask_path in (skin_mask_path(spec), hair_mask_path(spec)):
                        staged_mask = build_dir / mask_path.name
                        if not staged_mask.is_file():
                            raise SpriteError(
                                f"{spec['id']}: staged appearance mask is missing: "
                                f"{staged_mask.relative_to(REPO_ROOT)}"
                            )
                        appearance_promotions.append((spec, staged_mask, mask_path))
                for sheet_spec in processed_specs:
                    staged_path = output_path_for(sheet_spec, build_dir, False)
                    runtime_path = output_path_for(sheet_spec, build_dir, True)
                    runtime_path.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(staged_path, runtime_path)
                    print(
                        f"PROMOTED {sheet_spec['id']}: "
                        f"{runtime_path.relative_to(REPO_ROOT)}"
                    )
                for spec, staged_mask, mask_path in appearance_promotions:
                    mask_path.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(staged_mask, mask_path)
                    print(
                        f"PROMOTED {spec['id']}: {mask_path.relative_to(REPO_ROOT)}"
                    )
        elif args.command == "validate":
            for _, spec in specs:
                for sheet_spec in all_sheet_specs(spec):
                    results.append(
                        validate_one(sheet_spec, repo_path(sheet_spec["output"]), report_root)
                    )
        return 0 if all(result.passed for result in results) else 1
    except SpriteError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
