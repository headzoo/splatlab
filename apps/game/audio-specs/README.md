# Audio packs

Audio packs map semantic runtime cues to approved files. Run:

```bash
python3 tools/audio.py validate
```

The first pack is `space_basic_v1`: original seamless `gameplay` and `boss`
music loops plus the initial jump, land, collectible, enemy, player,
checkpoint, and goal cues.
`runtime/audio-engine.js` preloads a pack after an intentional user interaction,
starts or stops music, caps simultaneous effect voices, and accepts bounded
music/effects settings. Gameplay code should call `play("collectible")` or
another semantic cue; it should never depend on a sound finishing.

Regenerate the checked-in starter WAV files deterministically with:

```bash
python3 tools/generate_audio.py
python3 tools/generate_boss_music.py
```
