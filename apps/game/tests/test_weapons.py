from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "tools"))

import weapons  # noqa: E402


class WeaponSpecTests(unittest.TestCase):
    def test_short_sword_has_bounded_mechanics_and_only_visible_supported_wielders(self) -> None:
        spec = weapons.load_weapon_spec(
            REPO_ROOT / "weapon-specs/short_sword_v1.json",
            REPO_ROOT,
        )

        self.assertEqual(spec["id"], "short_sword_v1")
        self.assertEqual(spec["kind"], "melee_weapon")
        self.assertEqual(spec["runtime"], "platformer_v1")
        self.assertEqual(spec["mechanics"]["damage"], 1)
        self.assertLess(spec["mechanics"]["activeStartMs"], spec["mechanics"]["activeEndMs"])
        self.assertLessEqual(
            spec["mechanics"]["activeEndMs"],
            spec["mechanics"]["attackDurationMs"],
        )
        self.assertEqual(
            set(spec["visual"]["characters"]),
            {"space_cooper_01", "space_human_01"},
        )
        for character in spec["visual"]["characters"].values():
            self.assertEqual(set(character["directions"]), {"left", "right"})
            self.assertTrue(all(len(frames) == 4 for frames in character["directions"].values()))

    def test_weapon_damage_outside_contract_is_rejected(self) -> None:
        source = json.loads(
            (REPO_ROOT / "weapon-specs/short_sword_v1.json").read_text(encoding="utf-8")
        )
        source["mechanics"]["damage"] = 0
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "short_sword_v1.json"
            path.write_text(json.dumps(source), encoding="utf-8")
            with self.assertRaisesRegex(weapons.WeaponSpecError, "mechanics.damage"):
                weapons.load_weapon_spec(path, REPO_ROOT)


if __name__ == "__main__":
    unittest.main()
