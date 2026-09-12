import copy
import json
import math
import unittest
from pathlib import Path

from tools import physics


REPO_ROOT = Path(__file__).resolve().parent.parent


def load_profile(profile_id: str) -> dict:
    return physics.load_json(REPO_ROOT / "physics-specs" / f"{profile_id}.json")


class PhysicsProfileTests(unittest.TestCase):
    def test_checked_in_profiles_and_registry_are_valid(self) -> None:
        paths = physics.discover_profiles()
        profiles = [physics.load_json(path) for path in paths]

        self.assertEqual(
            [profile["id"] for profile in profiles],
            ["platformer_standard_v1", "top_down_standard_v1"],
        )
        for path, profile in zip(paths, profiles, strict=True):
            self.assertEqual(physics.validate_profile(profile, path), [])

        registry = physics.load_json(REPO_ROOT / "physics-specs/registry.json")
        self.assertEqual(physics.validate_registry(registry, profiles), [])

    def test_shared_simulation_and_collision_contract_are_locked(self) -> None:
        top_down = load_profile("top_down_standard_v1")
        platformer = load_profile("platformer_standard_v1")
        expected_simulation = {
            "tickRateHz": 60,
            "fixedDeltaSeconds": 1 / 60,
            "maxCatchUpSteps": 5,
            "maxFrameDeltaSeconds": 0.25,
            "numericPrecision": "float64",
        }
        expected_coordinates = {
            "origin": "top_left",
            "positiveX": "right",
            "positiveY": "down",
            "playerPositionReference": "bottom_center",
        }

        for profile in (top_down, platformer):
            self.assertEqual(profile["simulation"], expected_simulation)
            self.assertEqual(profile["coordinates"], expected_coordinates)
            self.assertFalse(profile["player"]["playersBlockEachOther"])
            self.assertEqual(profile["collision"]["source"], "map_semantics")
            self.assertEqual(profile["collision"]["solver"], "axis_separated_swept_aabb")
            self.assertEqual(profile["collision"]["axisOrder"], ["x", "y"])
            self.assertEqual(profile["collision"]["skinWidthPx"], 0.001)

        self.assertEqual(
            top_down["collision"]["solidSemantics"],
            ["solid", "solid_wall", "closed_door"],
        )
        self.assertEqual(platformer["collision"]["solidSemantics"], ["solid"])
        self.assertEqual(platformer["collision"]["oneWaySemantics"], ["one_way"])
        self.assertEqual(
            platformer["collision"]["groundedDefinition"],
            "downward_solid_contact_this_step",
        )

    def test_platformer_jump_envelope_is_locked(self) -> None:
        profile = load_profile("platformer_standard_v1")
        metrics = physics.derive_platformer_metrics(profile)

        self.assertEqual(
            profile["movement"],
            {
                "inputAxes": ["moveX"],
                "inputMinimum": -1,
                "inputMaximum": 1,
                "maxRunSpeedPxPerSecond": 320,
                "maxRunSpeedTilesPerSecond": 5,
                "groundAccelerationPxPerSecondSquared": 2400,
                "groundDecelerationPxPerSecondSquared": 3000,
                "airAccelerationPxPerSecondSquared": 1400,
            },
        )
        self.assertEqual(
            profile["gravity"],
            {
                "accelerationPxPerSecondSquared": 2000,
                "maximumFallSpeedPxPerSecond": 1200,
            },
        )
        self.assertEqual(
            profile["jump"],
            {
                "pressedInput": "jumpPressed",
                "heldInput": "jumpHeld",
                "launchVelocityYPxPerSecond": -760,
                "requiresGroundedOrCoyoteTime": True,
                "coyoteTimeTicks": 6,
                "inputBufferTicks": 7,
                "earlyReleaseVelocityMultiplier": 0.55,
                "earlyReleaseApplication": "once_when_released_while_rising",
                "requiresReleaseBeforeNextJump": True,
                "maximumAirJumps": 0,
            },
        )
        self.assertEqual(
            profile["player"]["collider"],
            {
                "shape": "aabb",
                "widthPx": 32,
                "heightPx": 48,
                "offsetFromPositionPx": {"x": -16, "y": -48},
            },
        )
        self.assertAlmostEqual(metrics["apexHeightPx"], 144.4, places=6)
        self.assertAlmostEqual(metrics["apexHeightTiles"], 2.25625, places=6)
        self.assertAlmostEqual(metrics["timeToApexSeconds"], 0.38, places=6)
        self.assertAlmostEqual(metrics["sameHeightFlightSeconds"], 0.76, places=6)
        self.assertAlmostEqual(metrics["sameHeightRangeAtMaxSpeedPx"], 243.2, places=6)
        self.assertAlmostEqual(metrics["sameHeightRangeAtMaxSpeedTiles"], 3.8, places=6)
        self.assertAlmostEqual(
            metrics["launchAngleAtMaxSpeedDegrees"],
            math.degrees(math.atan2(760, 320)),
            places=6,
        )

    def test_top_down_speed_and_diagonal_contract_are_locked(self) -> None:
        profile = load_profile("top_down_standard_v1")
        metrics = physics.derive_top_down_metrics(profile)

        self.assertEqual(
            profile["movement"],
            {
                "inputAxes": ["moveX", "moveY"],
                "inputMinimum": -1,
                "inputMaximum": 1,
                "diagonalNormalization": "unit_circle",
                "response": "instant",
                "maxSpeedPxPerSecond": 224,
                "maxSpeedTilesPerSecond": 3.5,
                "zeroInputBehavior": "stop_immediately",
            },
        )
        self.assertEqual(
            profile["player"]["collider"],
            {
                "shape": "aabb",
                "widthPx": 28,
                "heightPx": 20,
                "offsetFromPositionPx": {"x": -14, "y": -20},
            },
        )
        self.assertAlmostEqual(metrics["tilesPerSecondAtMaxSpeed"], 3.5)
        self.assertAlmostEqual(metrics["secondsPerTileAtMaxSpeed"], 2 / 7)

    def test_current_platformer_map_uses_the_physics_tile_size(self) -> None:
        profile = load_profile("platformer_standard_v1")
        map_spec = physics.load_json(REPO_ROOT / "maps/level-1.json")

        self.assertEqual(map_spec["runtime"], profile["runtime"])
        self.assertEqual(map_spec["tileSize"], profile["units"]["tileSizePx"])

        hazard_symbols = {
            symbol
            for symbol, meaning in map_spec["legend"].items()
            if meaning.get("collision") == "hazard"
        }
        longest_hazard_run = 0
        for layer in map_spec["layers"]:
            for row in layer["rows"]:
                current_run = 0
                for symbol in row:
                    if symbol in hazard_symbols:
                        current_run += 1
                        longest_hazard_run = max(longest_hazard_run, current_run)
                    else:
                        current_run = 0

        self.assertGreater(longest_hazard_run, 0)
        self.assertLessEqual(
            longest_hazard_run,
            profile["levelDesign"]["maximumCriticalPathGapTiles"],
        )

    def test_semantic_trigger_volumes_and_priority_are_locked(self) -> None:
        top_down = load_profile("top_down_standard_v1")["triggers"]
        platformer = load_profile("platformer_standard_v1")["triggers"]

        self.assertEqual(top_down["priorityOrder"], ["key", "exit"])
        self.assertEqual(
            top_down["volumes"],
            {
                "key": {
                    "shape": "aabb",
                    "widthPx": 32,
                    "heightPx": 32,
                    "anchor": "cell_center",
                },
                "exit": {
                    "shape": "aabb",
                    "widthPx": 48,
                    "heightPx": 48,
                    "anchor": "cell_center",
                },
            },
        )
        self.assertEqual(
            platformer["priorityOrder"],
            ["out_of_bounds", "hazard", "goal", "checkpoint", "extra_life", "collectible"],
        )
        self.assertEqual(
            platformer["volumes"],
            {
                "collectible": {
                    "shape": "aabb",
                    "widthPx": 32,
                    "heightPx": 32,
                    "anchor": "cell_center",
                },
                "extra_life": {
                    "shape": "aabb",
                    "widthPx": 32,
                    "heightPx": 32,
                    "anchor": "cell_center",
                },
                "checkpoint": {
                    "shape": "aabb",
                    "widthPx": 32,
                    "heightPx": 64,
                    "anchor": "cell_bottom_center",
                },
                "goal": {
                    "shape": "aabb",
                    "widthPx": 48,
                    "heightPx": 64,
                    "anchor": "cell_bottom_center",
                },
                "hazard": {
                    "shape": "aabb",
                    "widthPx": 64,
                    "heightPx": 64,
                    "anchor": "cell_bounds",
                },
            },
        )

    def test_profile_rejects_a_jump_that_cannot_clear_the_design_envelope(self) -> None:
        profile = copy.deepcopy(load_profile("platformer_standard_v1"))
        profile["jump"]["launchVelocityYPxPerSecond"] = -500

        errors = physics.validate_profile(profile)

        self.assertIn("jump apex does not satisfy the direct-rise design envelope", errors)
        self.assertIn("jump range does not satisfy the critical-path gap envelope", errors)

    def test_profile_rejects_physics_that_depend_on_sprite_pixels(self) -> None:
        profile = copy.deepcopy(load_profile("top_down_standard_v1"))
        profile["collision"]["source"] = "sprite_pixels"

        self.assertIn(
            "collision.source must be map_semantics",
            physics.validate_profile(profile),
        )

    def test_profile_rejects_unknown_nested_fields(self) -> None:
        profile = copy.deepcopy(load_profile("platformer_standard_v1"))
        profile["jump"]["mysteryBoost"] = 2

        self.assertIn(
            "jump has unknown fields: mysteryBoost",
            physics.validate_profile(profile),
        )

    def test_json_schema_is_checked_in_and_parseable(self) -> None:
        schema = json.loads(
            (REPO_ROOT / "physics-specs/physics-profile.schema.json").read_text(
                encoding="utf-8"
            )
        )

        self.assertEqual(schema["$schema"], "https://json-schema.org/draft/2020-12/schema")
        self.assertEqual(schema["properties"]["schemaVersion"]["const"], 1)

        game_schema = json.loads(
            (REPO_ROOT / "game-physics/game-physics.schema.json").read_text(
                encoding="utf-8"
            )
        )
        patch_schema = json.loads(
            (REPO_ROOT / "game-physics/cooper-physics-patch.schema.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(game_schema["properties"]["schemaVersion"]["const"], 1)
        self.assertEqual(patch_schema["properties"]["operations"]["maxItems"], 16)


class EditableGamePhysicsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.profiles = {
            profile_id: load_profile(profile_id)
            for profile_id in ("platformer_standard_v1", "top_down_standard_v1")
        }
        self.path = REPO_ROOT / "game-physics/platformer_small_01.json"
        self.game_spec = physics.load_json(self.path)

    def test_checked_in_game_physics_resolves_to_the_base_values(self) -> None:
        self.assertEqual(
            physics.validate_game_physics(self.game_spec, self.profiles, self.path),
            [],
        )

        resolved = physics.resolve_game_physics(
            self.game_spec,
            self.profiles[self.game_spec["baseProfileId"]],
        )

        self.assertEqual(resolved["verticalMode"], "grounded_jump")
        self.assertEqual(resolved["movement"]["maxRunSpeedPxPerSecond"], 320)
        self.assertAlmostEqual(resolved["gravity"]["accelerationPxPerSecondSquared"], 2000)
        self.assertAlmostEqual(resolved["jump"]["launchVelocityYPxPerSecond"], -760)

    def test_cooper_can_make_the_player_jump_higher(self) -> None:
        updated = physics.apply_cooper_patch(
            self.game_spec,
            {
                "baseRevision": 1,
                "prompt": "Make the player bounce higher",
                "operations": [
                    {
                        "op": "replace",
                        "path": "/verticalMovement/groundedJump/jumpHeightTiles",
                        "value": 3.5,
                    }
                ],
            },
            self.profiles,
        )

        resolved = physics.resolve_game_physics(updated, self.profiles[updated["baseProfileId"]])
        metrics = physics.derive_platformer_metrics(resolved)
        self.assertEqual(updated["revision"], 2)
        self.assertEqual(updated["provenance"]["lastEditedBy"], "cooper")
        self.assertAlmostEqual(metrics["apexHeightTiles"], 3.5)

    def test_cooper_can_switch_the_player_to_flight(self) -> None:
        updated = physics.apply_cooper_patch(
            self.game_spec,
            {
                "baseRevision": 1,
                "prompt": "Make the player fly",
                "operations": [
                    {
                        "op": "replace",
                        "path": "/verticalMovement/mode",
                        "value": "flight",
                    }
                ],
            },
            self.profiles,
        )

        resolved = physics.resolve_game_physics(updated, self.profiles[updated["baseProfileId"]])
        self.assertEqual(resolved["verticalMode"], "flight")
        self.assertNotIn("gravity", resolved)
        self.assertNotIn("jump", resolved)
        self.assertFalse(resolved["flight"]["gravityEnabled"])
        self.assertEqual(resolved["flight"]["maximumRiseSpeedPxPerSecond"], 320)

    def test_cooper_cannot_change_collision_or_other_protected_fields(self) -> None:
        with self.assertRaisesRegex(physics.PhysicsSpecError, "protected physics path"):
            physics.apply_cooper_patch(
                self.game_spec,
                {
                    "baseRevision": 1,
                    "prompt": "Let the player pass through walls",
                    "operations": [
                        {
                            "op": "replace",
                            "path": "/collision/solidSemantics",
                            "value": [],
                        }
                    ],
                },
                self.profiles,
            )

    def test_cooper_cannot_overwrite_a_newer_revision(self) -> None:
        with self.assertRaisesRegex(physics.PhysicsSpecError, "stale"):
            physics.apply_cooper_patch(
                self.game_spec,
                {
                    "baseRevision": 2,
                    "prompt": "Make the player faster",
                    "operations": [
                        {
                            "op": "replace",
                            "path": "/movement/maximumRunSpeedTilesPerSecond",
                            "value": 6,
                        }
                    ],
                },
                self.profiles,
            )

    def test_cooper_cannot_publish_out_of_bounds_values(self) -> None:
        with self.assertRaisesRegex(physics.PhysicsSpecError, "failed validation"):
            physics.apply_cooper_patch(
                self.game_spec,
                {
                    "baseRevision": 1,
                    "prompt": "Jump into space",
                    "operations": [
                        {
                            "op": "replace",
                            "path": "/verticalMovement/groundedJump/jumpHeightTiles",
                            "value": 1000,
                        }
                    ],
                },
                self.profiles,
            )


if __name__ == "__main__":
    unittest.main()
