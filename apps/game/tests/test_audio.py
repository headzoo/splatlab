from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "tools"))

import audio  # noqa: E402


class AudioPackTests(unittest.TestCase):
    def test_space_starter_pack_has_music_and_required_semantic_cues(self) -> None:
        pack = audio.load_audio_spec(REPO_ROOT / "audio-specs/space_basic_v1.json")

        self.assertEqual(pack["id"], "space_basic_v1")
        self.assertGreaterEqual(pack["music"]["gameplay"]["durationSec"], 8)
        self.assertEqual(pack["music"]["boss"]["durationSec"], 16)
        self.assertEqual(pack["music"]["boss"]["assetId"], "shared_boss_menace_loop_01")
        self.assertEqual(set(pack["effects"]), audio.REQUIRED_EFFECTS)
        self.assertTrue(all(item["durationSec"] <= 3 for item in pack["effects"].values()))

    def test_emberkeep_pack_has_music_and_required_semantic_cues(self) -> None:
        pack = audio.load_audio_spec(REPO_ROOT / "audio-specs/dragons_emberkeep_v1.json")

        self.assertEqual(pack["id"], "dragons_emberkeep_v1")
        self.assertEqual(pack["themeTags"], ["dragons"])
        self.assertGreaterEqual(pack["music"]["gameplay"]["durationSec"], 8)
        self.assertEqual(pack["music"]["boss"]["durationSec"], 16)
        self.assertEqual(set(pack["effects"]), audio.REQUIRED_EFFECTS)
        self.assertTrue(all(item["durationSec"] <= 3 for item in pack["effects"].values()))

    def test_audio_engine_exposes_unlock_music_cues_and_bounded_configuration(self) -> None:
        source = (REPO_ROOT / "runtime/audio-engine.js").read_text(encoding="utf-8")

        self.assertIn("async unlock()", source)
        self.assertIn('startMusic(cue = "gameplay")', source)
        self.assertIn("this.spec.music?.[cue]", source)
        self.assertIn("play(cue)", source)
        self.assertIn("active.size >= entry.maxVoices", source)
        self.assertIn("Math.max(0, Math.min(1, options.musicLevel))", source)
        self.assertIn("Math.max(0, Math.min(1, options.effectsLevel))", source)

    def test_game_spec_examples_keep_audio_out_of_map_data(self) -> None:
        for map_path in (
            REPO_ROOT / "maps/level-1.json",
            REPO_ROOT / "maps/platformer_emberkeep_01.json",
        ):
            map_spec = json.loads(map_path.read_text(encoding="utf-8"))
            self.assertNotIn("audio", map_spec)
            self.assertNotIn("soundPackId", map_spec.get("presentation", {}))


if __name__ == "__main__":
    unittest.main()
