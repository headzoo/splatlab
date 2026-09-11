import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

from tools import sprites
from tools.restore_checker_alpha import remove_small_components


def base_spec(mode: str = "bottom_center") -> dict:
    return {
        "schemaVersion": 1,
        "id": "test_sprite_01",
        "source": "sprites/source.png",
        "output": "sprites/output.png",
        "sourceLayout": {"columns": 2, "rows": 1},
        "sheet": {"columns": 2, "rows": 1, "frameWidth": 16, "frameHeight": 16},
        "alignment": {
            "mode": mode,
            "anchor": {"x": 8, "y": 14},
            "contentBox": {"width": 8, "height": 8},
            "resizeMode": "stretch_each",
        },
        "validation": {
            "alphaThreshold": 32,
            "requiredPadding": 0,
            "pivotTolerance": 0,
            "envelopeTolerance": 0,
        },
    }


def save_sheet(path: Path, rectangles: list[tuple[int, int, int, int]]) -> None:
    image = Image.new("RGBA", (32, 16), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for index, rectangle in enumerate(rectangles):
        offset = index * 16
        left, top, right, bottom = rectangle
        draw.rectangle((offset + left, top, offset + right - 1, bottom - 1), fill=(255, 255, 255, 255))
    image.save(path)


class ValidationTests(unittest.TestCase):
    def test_checker_cleanup_removes_only_tiny_isolated_components(self) -> None:
        alpha = Image.new("L", (8, 8), 0)
        draw = ImageDraw.Draw(alpha)
        draw.rectangle((1, 1, 4, 4), fill=255)
        alpha.putpixel((7, 7), 255)

        removed = remove_small_components(alpha, 4)

        self.assertEqual(removed, 1)
        self.assertEqual(alpha.getpixel((2, 2)), 255)
        self.assertEqual(alpha.getpixel((7, 7)), 0)

    def test_current_recipes_load(self) -> None:
        recipes = sprites.discover_specs([])
        self.assertGreaterEqual(len(recipes), 6)

    def test_space_platformer_set_has_locked_slots_and_geometry(self) -> None:
        expected = {
            "ground": ("terrain", "solid", 64, 1, 1, 1, False),
            "platform": ("terrain", "solid", 64, 1, 1, 1, False),
            "obstacle": ("terrain", "solid", 64, 1, 1, 1, False),
            "hazard": ("hazard", "hazard", 64, 2, 2, 8, True),
            "coin": ("collectible", "collectible", 64, 2, 2, 4, True),
            "checkpoint": ("checkpoint", "checkpoint", 64, 2, 2, 4, True),
            "goal": ("goal", "goal", 96, 2, 2, 4, True),
        }

        for slot, (kind, collision, frame_height, columns, rows, fps, loop) in expected.items():
            asset_id = f"space_platformer_{slot}_01"
            recipe_path = sprites.REPO_ROOT / "sprite-specs" / f"{asset_id}.json"
            candidate_path = sprites.REPO_ROOT / "sprite-build" / f"{asset_id}.png"
            recipe = sprites.load_spec(recipe_path)

            self.assertEqual(recipe["runtime"], "platformer_v1")
            self.assertEqual(recipe["themeTags"], ["space"])
            self.assertEqual(recipe["visualSlot"], slot)
            self.assertEqual(recipe["kind"], kind)
            self.assertEqual(recipe["collision"], collision)
            self.assertEqual(recipe["sheet"]["frameWidth"], 64)
            self.assertEqual(recipe["sheet"]["frameHeight"], frame_height)
            self.assertEqual(recipe["sheet"]["columns"], columns)
            self.assertEqual(recipe["sheet"]["rows"], rows)
            self.assertEqual(recipe["animation"], {"fps": fps, "loop": loop})
            self.assertEqual(len(recipe["frameLabels"]), columns * rows)
            self.assertTrue(candidate_path.is_file())
            with Image.open(candidate_path) as candidate:
                self.assertEqual(candidate.mode, "RGBA")
                self.assertEqual(candidate.size, (columns * 64, rows * frame_height))

                if slot == "obstacle":
                    self.assertEqual(candidate.getchannel("A").getbbox(), (0, 0, 64, 64))

            if slot == "obstacle":
                self.assertEqual(recipe["alignment"]["contentBox"], {"width": 64, "height": 64})
                self.assertEqual(recipe["alignment"]["resizeMode"], "stretch_each")

            if slot == "coin":
                collected = recipe["eventSheets"]["collected"]
                self.assertEqual(collected["frameLabels"], ["poof_1", "poof_2", "poof_3", "poof_4"])
                self.assertEqual(collected["animation"], {"fps": 12, "loop": False})
                event_specs = sprites.event_sheet_specs(recipe)
                self.assertEqual([event["id"] for event in event_specs], [f"{asset_id}_collected"])
                self.assertTrue(
                    (sprites.REPO_ROOT / "sprite-build" / f"{asset_id}_collected.png").is_file()
                )
            elif slot == "checkpoint":
                activated = recipe["eventSheets"]["activated"]
                self.assertEqual(
                    activated["frameLabels"],
                    ["activate_1", "activate_2", "activate_3", "activated"],
                )
                self.assertEqual(activated["animation"], {"fps": 10, "loop": False})
                event_specs = sprites.event_sheet_specs(recipe)
                self.assertEqual([event["id"] for event in event_specs], [f"{asset_id}_activated"])
                self.assertTrue(
                    (sprites.REPO_ROOT / "sprite-build" / f"{asset_id}_activated.png").is_file()
                )
            elif slot == "goal":
                level_complete = recipe["eventSheets"]["level_complete"]
                self.assertEqual(
                    level_complete["frameLabels"],
                    ["complete_1", "complete_2", "complete_3", "level_complete"],
                )
                self.assertEqual(level_complete["animation"], {"fps": 10, "loop": False})
                event_specs = sprites.event_sheet_specs(recipe)
                self.assertEqual(
                    [event["id"] for event in event_specs],
                    [f"{asset_id}_level_complete"],
                )
                self.assertTrue(
                    (
                        sprites.REPO_ROOT
                        / "sprite-build"
                        / f"{asset_id}_level_complete.png"
                    ).is_file()
                )

    def test_space_platformer_hud_icons_are_static_staged_sprites(self) -> None:
        for counter in ("lives", "coins"):
            asset_id = f"space_platformer_hud_{counter}_01"
            recipe = sprites.load_spec(sprites.REPO_ROOT / "sprite-specs" / f"{asset_id}.json")
            candidate = sprites.REPO_ROOT / "sprite-build" / f"{asset_id}.png"

            self.assertEqual(recipe["kind"], "hud")
            self.assertEqual(recipe["runtime"], "platformer_v1")
            self.assertEqual(recipe["themeTags"], ["space"])
            self.assertEqual(recipe["visualSlot"], f"hud_{counter}")
            self.assertEqual(recipe["collision"], "none")
            self.assertEqual(recipe["sheet"], {
                "columns": 1,
                "rows": 1,
                "frameWidth": 64,
                "frameHeight": 64,
            })
            self.assertEqual(recipe["animation"], {"fps": 1, "loop": False})
            with Image.open(candidate) as image:
                self.assertEqual(image.mode, "RGBA")
                self.assertEqual(image.size, (64, 64))

    def test_shared_victory_burst_is_a_play_once_production_effect(self) -> None:
        asset_id = "shared_victory_burst_01"
        recipe = sprites.load_spec(
            sprites.REPO_ROOT / "sprite-specs" / f"{asset_id}.json"
        )
        candidate = sprites.REPO_ROOT / "sprite-build" / f"{asset_id}.png"

        self.assertEqual(recipe["name"], "Fireworks burst")
        self.assertEqual(recipe["kind"], "effect")
        self.assertEqual(recipe["runtime"], "shared_v1")
        self.assertEqual(recipe["themeTags"], ["neutral"])
        self.assertEqual(recipe["visualSlot"], "victory")
        self.assertEqual(recipe["sheet"], {
            "columns": 4,
            "rows": 2,
            "frameWidth": 64,
            "frameHeight": 64,
        })
        self.assertEqual(
            recipe["frameLabels"],
            [f"victory_{index}" for index in range(8)],
        )
        self.assertEqual(recipe["animation"], {"fps": 8, "loop": False})
        with Image.open(candidate) as image:
            self.assertEqual(image.mode, "RGBA")
            self.assertEqual(image.size, (256, 128))

    def test_shared_game_over_effect_composes_four_runtime_sprites(self) -> None:
        asset_id = "shared_game_over_01"
        recipe = sprites.load_spec(
            sprites.REPO_ROOT / "sprite-specs" / f"{asset_id}.json"
        )
        candidate = sprites.REPO_ROOT / "sprite-build" / f"{asset_id}.png"

        self.assertEqual(recipe["name"], "Game Over impact")
        self.assertEqual(recipe["kind"], "effect")
        self.assertEqual(recipe["runtime"], "shared_v1")
        self.assertEqual(recipe["themeTags"], ["neutral"])
        self.assertEqual(recipe["visualSlot"], "game_over")
        self.assertEqual(recipe["collision"], "none")
        self.assertEqual(recipe["sheet"], {
            "columns": 2,
            "rows": 2,
            "frameWidth": 64,
            "frameHeight": 64,
        })
        self.assertEqual(recipe["frameLabels"], [
            "game_over_game",
            "game_over_over",
            "game_over_impact_left",
            "game_over_impact_right",
        ])
        with Image.open(candidate) as image:
            self.assertEqual(image.mode, "RGBA")
            self.assertEqual(image.size, (128, 128))

    def test_space_combat_event_matrix_and_short_sword_candidates_are_locked(self) -> None:
        visible_wielders = {"space_cooper_01", "space_human_01"}
        space_characters = visible_wielders | {"space_ghost_01", "space_robot_01"}

        for asset_id in sorted(space_characters):
            recipe = sprites.load_spec(
                sprites.REPO_ROOT / "sprite-specs" / f"{asset_id}.json"
            )
            event_sheets = recipe["eventSheets"]
            self.assertIn("defeated", event_sheets)
            self.assertEqual(
                event_sheets["defeated"]["frameLabels"],
                [
                    "defeated_left_1",
                    "defeated_left_2",
                    "defeated_left_3",
                    "defeated_left_4",
                    "defeated_right_1",
                    "defeated_right_2",
                    "defeated_right_3",
                    "defeated_right_4",
                ],
            )
            self.assertEqual(
                "attack" in event_sheets,
                asset_id in visible_wielders,
            )
            event_ids = {event["eventId"] for event in sprites.event_sheet_specs(recipe)}
            self.assertIn("defeated", event_ids)
            if asset_id in visible_wielders:
                self.assertIn("attack", event_ids)

            defeated_candidate = (
                sprites.REPO_ROOT / "sprite-build" / f"{asset_id}_defeated.png"
            )
            with Image.open(defeated_candidate) as image:
                self.assertEqual(image.mode, "RGBA")
                self.assertEqual(image.size, (256, 128))

        sword_recipe = sprites.load_spec(
            sprites.REPO_ROOT / "sprite-specs/short_sword_v1.json"
        )
        self.assertEqual(sword_recipe["kind"], "weapon")
        self.assertEqual(sword_recipe["sheet"], {
            "columns": 1,
            "rows": 1,
            "frameWidth": 64,
            "frameHeight": 64,
        })
        with Image.open(sprites.REPO_ROOT / "sprite-build/short_sword_v1.png") as image:
            self.assertEqual(image.mode, "RGBA")
            self.assertEqual(image.size, (64, 64))

    def test_event_sheet_names_and_filenames_are_canonical(self) -> None:
        recipe_path = sprites.REPO_ROOT / "sprite-specs/space_platformer_coin_01.json"
        recipe = json.loads(recipe_path.read_text(encoding="utf-8"))
        recipe["eventSheets"]["Collected!"] = recipe["eventSheets"].pop("collected")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad-event.json"
            path.write_text(json.dumps(recipe), encoding="utf-8")
            with self.assertRaisesRegex(sprites.SpriteError, "lowercase snake case"):
                sprites.load_spec(path)

        recipe = json.loads(recipe_path.read_text(encoding="utf-8"))
        recipe["eventSheets"]["collected"]["output"] = "sprites/wrong.png"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad-output.json"
            path.write_text(json.dumps(recipe), encoding="utf-8")
            with self.assertRaisesRegex(
                sprites.SpriteError, "runtime filename must be space_platformer_coin_01_collected.png"
            ):
                sprites.load_spec(path)

    def test_character_recipe_rejects_obsolete_32px_contract(self) -> None:
        spec = base_spec()
        spec["kind"] = "character"
        spec["source"] = "sprites/test_sprite_01-source.png"
        spec["output"] = "sprites/test_sprite_01.png"
        spec["frameLabels"] = ["frame_1", "frame_2"]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "old-character.json"
            path.write_text(json.dumps(spec), encoding="utf-8")
            with self.assertRaisesRegex(sprites.SpriteError, "require 64 x 64 frames"):
                sprites.load_spec(path)

    def test_boss_recipe_locks_large_left_right_frames_and_grand_defeat_sheet(self) -> None:
        spec = {
            "schemaVersion": 1,
            "id": "green_hills_boss_01",
            "name": "Green Hills Boss",
            "kind": "boss",
            "runtime": "platformer_v1",
            "roles": ["boss"],
            "collisionProfile": "boss_large_v1",
            "source": "sprites/green_hills_boss_01-source.png",
            "output": "sprites/green_hills_boss_01.png",
            "sourceLayout": {"columns": 5, "rows": 2},
            "sheet": {"columns": 5, "rows": 2, "frameWidth": 128, "frameHeight": 128},
            "frameLabels": [
                "idle_left", "walk_left_1", "walk_left_2", "walk_left_3", "walk_left_4",
                "idle_right", "walk_right_1", "walk_right_2", "walk_right_3", "walk_right_4",
            ],
            "alignment": {
                "mode": "bottom_center",
                "anchor": {"x": 64, "y": 120},
                "contentBox": {"width": 120, "height": 120},
                "resizeMode": "contain_shared",
            },
            "animation": {"fps": 8, "loop": True},
            "eventSheets": {
                "defeated": {
                    "source": "sprites/green_hills_boss_01_defeated-source.png",
                    "output": "sprites/green_hills_boss_01_defeated.png",
                    "sourceLayout": {"columns": 8, "rows": 2},
                    "sheet": {"columns": 8, "rows": 2, "frameWidth": 128, "frameHeight": 128},
                    "frameLabels": [
                        *(f"defeated_left_{index}" for index in range(1, 9)),
                        *(f"defeated_right_{index}" for index in range(1, 9)),
                    ],
                    "alignment": {
                        "mode": "bottom_center",
                        "anchor": {"x": 64, "y": 120},
                        "contentBox": {"width": 124, "height": 124},
                        "resizeMode": "contain_shared",
                    },
                    "animation": {"fps": 10, "loop": False},
                }
            },
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "boss.json"
            path.write_text(json.dumps(spec), encoding="utf-8")

            loaded = sprites.load_spec(path)
            self.assertEqual(loaded["sheet"]["frameWidth"], 128)

            spec["eventSheets"].pop("defeated")
            path.write_text(json.dumps(spec), encoding="utf-8")
            with self.assertRaisesRegex(sprites.SpriteError, "require a defeated event sheet"):
                sprites.load_spec(path)

    def test_valid_sheet_passes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "valid.png"
            save_sheet(path, [(4, 6, 12, 14), (4, 6, 12, 14)])
            result = sprites.validate(path, base_spec())
            self.assertTrue(result.passed, result.errors)

    def test_wrong_dimensions_fail(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "wrong-size.png"
            Image.new("RGBA", (31, 16), (0, 0, 0, 0)).save(path)
            result = sprites.validate(path, base_spec())
            self.assertFalse(result.passed)
            self.assertTrue(any("Expected sheet size" in error for error in result.errors))

    def test_missing_image_fails_cleanly(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "missing.png"
            result = sprites.validate(path, base_spec())
            self.assertFalse(result.passed)
            self.assertTrue(any("Cannot read PNG" in error for error in result.errors))

    def test_validate_one_reports_missing_image_without_crashing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with contextlib.redirect_stdout(io.StringIO()):
                result = sprites.validate_one(base_spec(), root / "missing.png", root / "reports")
            self.assertFalse(result.passed)
            self.assertTrue((root / "reports/test_sprite_01/test_sprite_01-report.json").exists())

    def test_empty_frame_fails(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "empty-frame.png"
            save_sheet(path, [(4, 6, 12, 14)])
            result = sprites.validate(path, base_spec())
            self.assertFalse(result.passed)
            self.assertIn("Frame 1 is empty", result.errors)

    def test_baseline_drift_fails(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "drift.png"
            save_sheet(path, [(4, 6, 12, 14), (4, 5, 12, 13)])
            result = sprites.validate(path, base_spec())
            self.assertFalse(result.passed)
            self.assertTrue(any("baselines drift" in error for error in result.errors))

    def test_frame_offset_applies_after_automatic_alignment(self) -> None:
        spec = base_spec()
        spec["alignment"]["frameOffsets"] = [
            {"x": 1, "y": -2},
            {"x": 0, "y": 0},
        ]
        frame = Image.new("RGBA", (8, 8), (255, 255, 255, 255))

        _, placement = sprites.place_frame(frame, spec, 0)

        self.assertEqual(placement["paste"], [5, 4])
        self.assertEqual(placement["frameOffset"], [1, -2])

    def test_explicit_frame_offset_may_intentionally_clip_the_artwork(self) -> None:
        spec = base_spec()
        spec["alignment"]["frameOffsets"] = [
            {"x": 0, "y": 4},
            {"x": 0, "y": 0},
        ]
        frame = Image.new("RGBA", (8, 8), (255, 255, 255, 255))

        clipped_frame, placement = sprites.place_frame(frame, spec, 0)
        regular_frame, _ = sprites.place_frame(frame, spec, 1)

        self.assertEqual(placement["paste"], [4, 10])
        self.assertTrue(placement["intentionallyClipped"])
        self.assertEqual(clipped_frame.getbbox(), (4, 10, 12, 16))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "intentional-crop.png"
            sprites.assemble_sheet([clipped_frame, regular_frame], spec).save(path)
            result = sprites.validate(path, spec)
        self.assertTrue(result.passed, result.errors)
        self.assertEqual(result.measurements["intentionallyClippedFrames"], [0])

    def test_automatic_alignment_still_rejects_clipping(self) -> None:
        spec = base_spec()
        spec["alignment"]["anchor"]["y"] = 18
        frame = Image.new("RGBA", (8, 8), (255, 255, 255, 255))

        with self.assertRaisesRegex(sprites.SpriteError, "Automatic alignment would be clipped"):
            sprites.place_frame(frame, spec, 0)

    def test_explicit_frame_offset_cannot_move_artwork_fully_off_canvas(self) -> None:
        spec = base_spec()
        spec["alignment"]["frameOffsets"] = [
            {"x": 0, "y": 20},
            {"x": 0, "y": 0},
        ]
        frame = Image.new("RGBA", (8, 8), (255, 255, 255, 255))

        with self.assertRaisesRegex(sprites.SpriteError, "completely outside"):
            sprites.place_frame(frame, spec, 0)

    def test_validation_accounts_for_recorded_frame_offsets(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "offset.png"
            save_sheet(path, [(4, 6, 12, 14), (4, 5, 12, 13)])
            spec = base_spec()
            spec["alignment"]["frameOffsets"] = [
                {"x": 0, "y": 0},
                {"x": 0, "y": -1},
            ]

            result = sprites.validate(path, spec)

            self.assertTrue(result.passed, result.errors)
            self.assertEqual(result.measurements["frameOffsets"], [[0, 0], [0, -1]])

    def test_frame_offsets_require_one_integer_pair_per_frame(self) -> None:
        spec = base_spec()
        spec["frameLabels"] = ["frame_0", "frame_1"]
        spec["source"] = "sprites/test_sprite_01-source.png"
        spec["output"] = "sprites/test_sprite_01.png"
        spec["alignment"]["frameOffsets"] = [{"x": 1, "y": 0}]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad-offsets.json"
            path.write_text(json.dumps(spec), encoding="utf-8")

            with self.assertRaisesRegex(sprites.SpriteError, "one offset per frame"):
                sprites.load_spec(path)

    def test_fixed_envelope_drift_fails(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "envelope.png"
            save_sheet(path, [(4, 6, 12, 14), (5, 6, 11, 14)])
            result = sprites.validate(path, base_spec("fixed_envelope"))
            self.assertFalse(result.passed)
            self.assertTrue(any("Structural envelope changes" in error for error in result.errors))

    def test_project_paths_cannot_escape_repository(self) -> None:
        with self.assertRaises(sprites.SpriteError):
            sprites.repo_path("../../outside.png")

    def test_normalize_rejects_baked_checkerboard_without_alpha(self) -> None:
        with tempfile.TemporaryDirectory(dir=sprites.REPO_ROOT) as directory:
            path = Path(directory) / "opaque.png"
            Image.new("RGB", (32, 16), (192, 192, 192)).save(path)
            spec = base_spec()
            spec["source"] = str(path.relative_to(sprites.REPO_ROOT))
            with self.assertRaisesRegex(sprites.SpriteError, "no alpha channel"):
                sprites.normalize(spec)

    def test_opaque_runtime_sheet_is_limited_to_full_cell_terrain(self) -> None:
        spec = base_spec()
        spec.update({"kind": "terrain", "visualSlot": "ground"})
        spec["source"] = "sprites/test_sprite_01-source.png"
        spec["output"] = "sprites/test_sprite_01.png"
        spec["sourceLayout"] = {"columns": 1, "rows": 1}
        spec["sheet"] = {"columns": 1, "rows": 1, "frameWidth": 16, "frameHeight": 16}
        spec["frameLabels"] = ["static"]
        spec["alignment"]["contentBox"] = {"width": 16, "height": 16}
        spec["alignment"]["anchor"] = {"x": 8, "y": 16}
        spec["validation"]["allowOpaqueFullFrame"] = True

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "opaque-terrain.png"
            Image.new("RGBA", (16, 16), (92, 140, 54, 255)).save(path)
            result = sprites.validate(path, spec)

        self.assertTrue(result.passed, result.errors)

        spec.update({"kind": "obstacle", "visualSlot": "obstacle"})
        sprites._validate_spec(spec, "opaque-obstacle", allow_event_sheets=True)

        spec.update({"kind": "hazard", "visualSlot": "hazard"})
        with self.assertRaisesRegex(sprites.SpriteError, "ground/platform/obstacle terrain"):
            sprites._validate_spec(spec, "opaque-hazard", allow_event_sheets=True)

    def test_human_recipe_requires_skin_tone_contract(self) -> None:
        spec_path = sprites.REPO_ROOT / "sprite-specs/neutral_human_01.json"
        spec = json.loads(spec_path.read_text(encoding="utf-8"))
        del spec["appearance"]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "neutral_human_01.json"
            path.write_text(json.dumps(spec), encoding="utf-8")
            with self.assertRaisesRegex(sprites.SpriteError, "require appearance.skinTone"):
                sprites.load_spec(path)

    def test_human_recipe_requires_hair_color_contract(self) -> None:
        spec_path = sprites.REPO_ROOT / "sprite-specs/neutral_human_01.json"
        spec = json.loads(spec_path.read_text(encoding="utf-8"))
        del spec["appearance"]["hairColor"]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "neutral_human_01.json"
            path.write_text(json.dumps(spec), encoding="utf-8")
            with self.assertRaisesRegex(sprites.SpriteError, "require appearance.hairColor"):
                sprites.load_spec(path)

    def test_skin_mask_validation_accepts_four_index_mask(self) -> None:
        with tempfile.TemporaryDirectory(dir=sprites.REPO_ROOT) as directory:
            root = Path(directory)
            mask_path = root / "test_human_01-skin-mask.png"
            image = Image.new("RGBA", (32, 16), (0, 0, 0, 0))
            draw = ImageDraw.Draw(image)
            draw.rectangle((2, 2, 13, 13), fill=(220, 160, 110, 255))
            draw.rectangle((18, 2, 29, 13), fill=(220, 160, 110, 255))
            mask = Image.new("RGBA", image.size, (0, 0, 0, 0))
            mask_draw = ImageDraw.Draw(mask)
            mask_draw.rectangle((4, 4, 11, 11), fill=(170, 170, 170, 255))
            mask_draw.rectangle((20, 4, 27, 11), fill=(85, 85, 85, 255))
            mask.save(mask_path)
            spec = base_spec()
            spec.update({"id": "test_human_01", "kind": "character", "body": "human"})
            spec["appearance"] = {
                "skinTone": {
                    "palette": "skin_tones_v1",
                    "mask": str(mask_path.relative_to(sprites.REPO_ROOT)),
                    "minimumPixelsPerFrame": 4,
                }
            }

            errors, measurements = sprites.validate_skin_mask(image, spec)

            self.assertEqual(errors, [])
            self.assertEqual(measurements["frameMaskedPixels"], [64, 64])

    def test_skin_mask_cannot_extend_outside_sprite(self) -> None:
        with tempfile.TemporaryDirectory(dir=sprites.REPO_ROOT) as directory:
            root = Path(directory)
            mask_path = root / "test_human_01-skin-mask.png"
            image = Image.new("RGBA", (32, 16), (0, 0, 0, 0))
            mask = Image.new("RGBA", image.size, (0, 0, 0, 0))
            mask.putpixel((1, 1), (85, 85, 85, 255))
            mask.save(mask_path)
            spec = base_spec()
            spec.update({"id": "test_human_01", "kind": "character", "body": "human"})
            spec["appearance"] = {
                "skinTone": {
                    "palette": "skin_tones_v1",
                    "mask": str(mask_path.relative_to(sprites.REPO_ROOT)),
                    "minimumPixelsPerFrame": 0,
                }
            }

            errors, _ = sprites.validate_skin_mask(image, spec)

            self.assertTrue(any("fully transparent sprite pixels" in error for error in errors))

    def test_hair_mask_cannot_overlap_skin_mask(self) -> None:
        with tempfile.TemporaryDirectory(dir=sprites.REPO_ROOT) as directory:
            root = Path(directory)
            image = Image.new("RGBA", (32, 16), (220, 160, 110, 255))
            skin_mask_path = root / "test_human_01-skin-mask.png"
            hair_mask_path = root / "test_human_01-hair-mask.png"
            skin_mask = Image.new("RGBA", image.size, (0, 0, 0, 0))
            hair_mask = Image.new("RGBA", image.size, (0, 0, 0, 0))
            skin_mask.putpixel((4, 4), (85, 85, 85, 255))
            hair_mask.putpixel((4, 4), (170, 170, 170, 255))
            skin_mask.save(skin_mask_path)
            hair_mask.save(hair_mask_path)
            spec = base_spec()
            spec.update({"id": "test_human_01", "kind": "character", "body": "human"})
            spec["appearance"] = {
                "skinTone": {
                    "palette": "skin_tones_v1",
                    "mask": str(skin_mask_path.relative_to(sprites.REPO_ROOT)),
                },
                "hairColor": {
                    "palette": "hair_colors_v1",
                    "mask": str(hair_mask_path.relative_to(sprites.REPO_ROOT)),
                    "minimumPixelsPerFrame": 0,
                },
            }

            errors, _ = sprites.validate_hair_mask(image, spec)

            self.assertTrue(any("overlaps the skin mask" in error for error in errors))

    def test_appearance_masks_capture_adjacent_accents_without_flooding(self) -> None:
        image = Image.new("RGBA", (32, 16), (0, 0, 0, 0))
        for frame_x in (0, 16):
            draw = ImageDraw.Draw(image)
            draw.rectangle((frame_x + 4, 4, frame_x + 7, 7), fill=(220, 160, 110, 255))
            image.putpixel((frame_x + 8, 5), (240, 100, 80, 255))
            draw.rectangle((frame_x + 10, 2, frame_x + 13, 4), fill=(137, 70, 45, 255))
            image.putpixel((frame_x + 9, 3), (230, 120, 70, 255))
            image.putpixel((frame_x + 12, 12), (240, 100, 80, 255))
        spec = base_spec()
        spec.update({"id": "test_human_01", "kind": "character", "body": "human"})
        spec["appearance"] = {
            "skinTone": {"palette": "skin_tones_v1", "mask": "unused-skin-mask.png"},
            "hairColor": {
                "palette": "hair_colors_v1",
                "mask": "unused-hair-mask.png",
                "maskGeneration": {"maximumFrameY": 7},
            },
        }

        skin_mask, hair_mask = sprites.generate_appearance_masks(image, spec)

        self.assertEqual(skin_mask.getpixel((8, 5))[3], 255)
        self.assertEqual(hair_mask.getpixel((9, 3))[3], 255)
        self.assertEqual(skin_mask.getpixel((12, 12))[3], 0)
        self.assertEqual(hair_mask.getpixel((12, 12))[3], 0)
        overlaps = sum(
            1
            for skin_pixel, hair_pixel in zip(skin_mask.getdata(), hair_mask.getdata())
            if skin_pixel[3] == 255 and hair_pixel[3] == 255
        )
        self.assertEqual(overlaps, 0)

    def test_offset_human_candidate_stages_matching_appearance_masks(self) -> None:
        spec = sprites.load_spec(sprites.REPO_ROOT / "sprite-specs/neutral_human_01.json")
        frame_count = spec["sheet"]["columns"] * spec["sheet"]["rows"]
        spec["alignment"]["frameOffsets"] = [
            {"x": 1 if index == 1 else 0, "y": 0}
            for index in range(frame_count)
        ]
        with tempfile.TemporaryDirectory(dir=sprites.REPO_ROOT) as directory:
            root = Path(directory)

            result = sprites.process_one(spec, root / "build", root / "reports", False)

            self.assertTrue(result.passed, result.errors)
            self.assertTrue((root / "build/neutral_human_01-skin-mask.png").is_file())
            self.assertTrue((root / "build/neutral_human_01-hair-mask.png").is_file())


if __name__ == "__main__":
    unittest.main()
