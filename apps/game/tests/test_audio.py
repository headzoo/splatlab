from __future__ import annotations

import json
import math
import struct
import sys
import tempfile
import unittest
import wave
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "tools"))

import audio  # noqa: E402


def write_test_loop(
    path: Path,
    *,
    trailing_silence_ms: float = 0.0,
    seconds: float = 16.0,
    sample_rate: int = 22_050,
    frequency: float = 220.0,
) -> None:
    """Write a continuous tone, optionally faded to digital silence at the end."""
    frames = int(sample_rate * seconds)
    silent = int(sample_rate * trailing_silence_ms / 1000)
    pcm = bytearray()
    for index in range(frames):
        value = 0.0 if index >= frames - silent else 0.5 * math.sin(
            2 * math.pi * frequency * index / sample_rate
        )
        pcm += struct.pack("<h", int(value * 32767))
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        output.writeframes(pcm)


PACK_IDS = (
    "space_basic_v1",
    "dragons_emberkeep_v1",
    "neutral_green_hills_v1",
    "haunted_graveyard_v1",
    "ice_world_v1",
)


class AudioPackTests(unittest.TestCase):
    def test_every_campaign_theme_has_its_own_sound_pack(self) -> None:
        specs = sorted(path.stem for path in (REPO_ROOT / "audio-specs").glob("*.json"))
        self.assertEqual(specs, sorted(PACK_IDS))

        for pack_id in PACK_IDS:
            pack = audio.load_audio_spec(REPO_ROOT / f"audio-specs/{pack_id}.json")
            self.assertEqual(pack["id"], pack_id)
            self.assertEqual(set(pack["music"]), {"gameplay", "boss"})
            self.assertEqual(set(pack["effects"]), audio.REQUIRED_EFFECTS)
            # Every pack shares one boss loop so the cue sounds the same everywhere.
            self.assertEqual(pack["music"]["boss"]["assetId"], "shared_boss_menace_loop_01")
            self.assertEqual(pack["music"]["boss"]["frameCount"], 352_800)

    def test_gameplay_loops_are_long_enough_to_not_feel_repetitive(self) -> None:
        for pack_id in PACK_IDS:
            pack = audio.load_audio_spec(REPO_ROOT / f"audio-specs/{pack_id}.json")
            gameplay = pack["music"]["gameplay"]
            self.assertGreaterEqual(gameplay["durationSec"], 50, pack_id)
            self.assertGreaterEqual(gameplay["tempo"]["bars"], 24, pack_id)

    def test_space_starter_pack_has_music_and_required_semantic_cues(self) -> None:
        pack = audio.load_audio_spec(REPO_ROOT / "audio-specs/space_basic_v1.json")

        self.assertEqual(pack["id"], "space_basic_v1")
        self.assertEqual(pack["music"]["gameplay"]["durationSec"], 68.571)
        self.assertEqual(pack["music"]["gameplay"]["frameCount"], 1_512_000)
        self.assertEqual(pack["music"]["gameplay"]["tempo"], {"bpm": 112, "bars": 32, "beatsPerBar": 4})
        self.assertEqual(pack["music"]["boss"]["durationSec"], 16)
        self.assertEqual(pack["music"]["boss"]["assetId"], "shared_boss_menace_loop_01")
        self.assertEqual(set(pack["effects"]), audio.REQUIRED_EFFECTS)
        self.assertTrue(all(item["durationSec"] <= 3 for item in pack["effects"].values()))

    def test_emberkeep_pack_has_music_and_required_semantic_cues(self) -> None:
        pack = audio.load_audio_spec(REPO_ROOT / "audio-specs/dragons_emberkeep_v1.json")

        self.assertEqual(pack["id"], "dragons_emberkeep_v1")
        self.assertEqual(pack["themeTags"], ["dragons"])
        self.assertEqual(pack["music"]["gameplay"]["durationSec"], 73.143)
        self.assertEqual(pack["music"]["gameplay"]["frameCount"], 1_612_800)
        self.assertEqual(pack["music"]["gameplay"]["tempo"], {"bpm": 105, "bars": 32, "beatsPerBar": 4})
        self.assertEqual(pack["music"]["boss"]["durationSec"], 16)
        self.assertEqual(set(pack["effects"]), audio.REQUIRED_EFFECTS)
        self.assertTrue(all(item["durationSec"] <= 3 for item in pack["effects"].values()))

    def test_every_pack_asset_is_mono(self) -> None:
        """Music is mono on purpose: a stereo image doubles the download for a
        loop that plays behind a game, and none of the mixes rely on panning."""
        for spec in PACK_IDS:
            pack = audio.load_audio_spec(REPO_ROOT / f"audio-specs/{spec}.json")
            for section in ("music", "effects"):
                for cue, item in pack[section].items():
                    self.assertEqual(item["channels"], 1, f"{spec}.{section}.{cue} should be mono")

    def test_checked_in_music_loops_join_back_to_their_own_start(self) -> None:
        for spec in PACK_IDS:
            pack = audio.load_audio_spec(REPO_ROOT / f"audio-specs/{spec}.json")
            for cue, item in pack["music"].items():
                report = audio.loop_seam_report(REPO_ROOT / item["path"], f"{spec}.music.{cue}")
                self.assertLessEqual(report["seamStep"], audio.MAX_SEAM_STEP)
                self.assertLessEqual(
                    report["trailingSilenceSec"], audio.MAX_EDGE_SILENCE_SECONDS
                )
                self.assertLessEqual(report["leadingSilenceSec"], audio.MAX_EDGE_SILENCE_SECONDS)
                self.assertGreaterEqual(report["tailEnergyRatio"], audio.MIN_SEAM_ENERGY_RATIO)
                self.assertGreaterEqual(report["headEnergyRatio"], audio.MIN_SEAM_ENERGY_RATIO)

    def test_loop_seam_check_rejects_a_loop_that_fades_to_silence(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            continuous = Path(directory) / "continuous.wav"
            faded = Path(directory) / "faded.wav"
            write_test_loop(continuous)
            write_test_loop(faded, trailing_silence_ms=45)

            audio._check_loop_seam(continuous, "music.gameplay")
            with self.assertRaises(audio.AudioSpecError) as raised:
                audio._check_loop_seam(faded, "music.gameplay")
            self.assertIn("trailing silence", str(raised.exception))

    def test_tempo_must_land_on_a_whole_number_of_frames(self) -> None:
        self.assertEqual(
            audio._check_tempo({"bpm": 120, "bars": 8}, "music.boss", 22_050, 352_800),
            {"bpm": 120, "bars": 8, "beatsPerBar": 4},
        )
        with self.assertRaises(audio.AudioSpecError):
            # 104 BPM over 32 bars is 1,628,307.69 frames at 22050 Hz.
            audio._check_tempo({"bpm": 104, "bars": 32}, "music.gameplay", 22_050, 1_628_308)
        with self.assertRaises(audio.AudioSpecError):
            audio._check_tempo(None, "music.gameplay", 22_050, 352_800)

    def test_audio_engine_exposes_unlock_music_cues_and_bounded_configuration(self) -> None:
        source = (REPO_ROOT / "runtime/audio-engine.js").read_text(encoding="utf-8")

        self.assertIn("async unlock()", source)
        self.assertIn('startMusic(cue = "gameplay")', source)
        self.assertIn("this.spec.music?.[cue]", source)
        self.assertIn("play(cue)", source)
        self.assertIn("active.size >= entry.maxVoices", source)
        self.assertIn("Math.max(0, Math.min(1, options.musicLevel))", source)
        self.assertIn("Math.max(0, Math.min(1, options.effectsLevel))", source)

    def test_audio_engine_loops_music_and_crossfades_between_cues(self) -> None:
        source = (REPO_ROOT / "runtime/audio-engine.js").read_text(encoding="utf-8")

        # The site player in apps/website must stay in step with this engine.
        self.assertIn("source.loop = entry.loop === true", source)
        self.assertIn("setValueCurveAtTime", source)
        self.assertIn("rampMusic(gain, peak, fadeIn)", source)
        self.assertIn("releaseMusicVoice(cue)", source)
        self.assertNotIn("this.stopMusic();\n    const source", source)

    def test_game_spec_examples_keep_audio_out_of_map_data(self) -> None:
        """Maps name a visual theme and nothing else. The site player derives the
        sound pack from that theme ID, so no map ever names an audio file."""
        for map_path in sorted((REPO_ROOT / "maps").glob("*.json")):
            map_spec = json.loads(map_path.read_text(encoding="utf-8"))
            presentation = map_spec.get("presentation", {})
            self.assertNotIn("audio", map_spec, map_path.name)
            self.assertNotIn("soundPackId", presentation, map_path.name)
            self.assertTrue(
                presentation.get("backgroundId") or presentation.get("mazeThemeId"),
                f"{map_path.name} needs a theme ID for the runtime to pick a sound pack",
            )


if __name__ == "__main__":
    unittest.main()
