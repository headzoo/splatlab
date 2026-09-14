# Audio packs

Audio packs map semantic runtime cues to approved files. Run:

```bash
python3 tools/audio.py validate
```

There is one pack per campaign theme, each with seamless `gameplay` and `boss`
music loops plus the twelve required effect cues: `space_basic_v1`,
`dragons_emberkeep_v1`, `neutral_green_hills_v1`, `haunted_graveyard_v1`, and
`ice_world_v1`. Every file is mono 16-bit PCM at `22050 Hz`, and every pack
ships the same shared `boss_loop.wav`.

Maps never name a pack. The site player derives it from the theme ID the map
already carries (`presentation.backgroundId` or `presentation.mazeThemeId`) via
`resolveSoundPackId` in `apps/website/src/game/sound-packs.ts`, which matches on
theme prefix so new theme variants inherit their theme's audio.

`runtime/audio-engine.js` preloads a pack after an intentional user interaction,
starts or stops music, caps simultaneous effect voices, and accepts bounded
music/effects settings. Gameplay code should call `play("collectible")` or
another semantic cue; it should never depend on a sound finishing.

Every music cue declares a `tempo` of `{ bpm, bars }`, and validation is
fail-closed on the loop join: the frame count must be exactly
`bars x 4 x 60 x sampleRate / bpm`, near-silence at either edge must stay under
`5 ms`, the last and first frames must not differ by more than `0.05` full
scale, and the `25 ms` at either edge must hold at least `15%` of the file's
average level. Inspect one file with
`python3 tools/audio.py loopcheck <wav> [--write-join <wav>]`.

Music loops repeat through a looping `AudioBufferSourceNode` rather than an
`HTMLAudioElement`, which is sample accurate, and cue changes equal-power
crossfade. The site players in `apps/website/src/game` share that behaviour
through `music-player.ts` and must stay in step with this engine.

Regenerate the checked-in WAV files deterministically with:

```bash
python3 tools/generate_audio.py            # space_basic_v1
python3 tools/generate_emberkeep_audio.py  # dragons_emberkeep_v1
python3 tools/generate_theme_audio.py      # green hills, graveyard, ice world
python3 tools/generate_boss_music.py       # shared boss loop for all five
```
