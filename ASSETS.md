# Asset Recreation Migration

This file is the recreation plan for the checked-in game asset catalog. Use it
when the art or audio files need to be regenerated with AI and then normalized
back into the Splat Lab runtime formats.

Do not expand this list from older plans. Recreate only the asset IDs named in
this file, then validate them through the same locked pipeline before promotion.

## Global Sprite Rules

Use bright, chunky pixel art with a consistent dark outline, transparent RGBA
backgrounds, readable silhouettes, and no baked UI, health bars, name plates,
player colors, or shadows.

For character sheets, generate a high-resolution master with one pose per cell,
then normalize each pose into a true runtime cell. Do not resize the whole
generated canvas and assume the AI grid is exact.

Run each matching recipe through:

```bash
python3 tools/sprites.py process sprite-specs/<asset-id>.json
```

Review the contact sheet and preview under `sprite-reports/<asset-id>/`. Promote
through the Sprite Viewer approval flow, or use the explicit `--replace` path
only when intentionally recreating the full catalog.

## Shared Sheet Contracts

- Standard character: `320 x 256` RGBA, `5 x 4` cells, `64 x 64` per frame,
  bottom-center anchor `(32, 56)`, rows `down`, `left`, `right`, `up`, columns
  `idle`, `walk_1`, `walk_2`, `walk_3`, `walk_4`, 8 FPS looping. Walk frames
  must read as Contact A, Passing A, Contact B, Passing B.
- Platformer boss: `640 x 256` RGBA, `5 x 2` cells, `128 x 128` per frame,
  bottom-center anchor `(64, 120)`, rows `left`, `right`, columns `idle` plus
  four walk frames, 8 FPS looping.
- Boss defeated event: `1024 x 256` RGBA, `8 x 2` cells, `128 x 128` per frame,
  eight left frames followed by eight right frames, 10 FPS, play once.
- Small character combat event: `256 x 128` RGBA, `4 x 2` cells, `64 x 64` per
  frame, four left frames followed by four right frames, play once.
- Platformer tiles: usually single `64 x 64` RGBA cells, unless the entry says
  otherwise.

## Character Sprites

Generate all characters as role-neutral runtime assets. A body can be used as a
player, enemy, or NPC by map data.

| Asset ID | Recreation direction |
| --- | --- |
| `neutral_human_01` | Neutral fallback human adventurer, simple practical outfit, friendly readable face, no fixed skin or hair color baked into gameplay. Include skin and hair masks. |
| `neutral_zombie_01` | Neutral fallback zombie, kid-safe, greenish undead cues, ragged clothes, shambling gait, no gore. |
| `neutral_ghost_01` | Neutral fallback ghost, rounded white translucent body, soft wisp tail locomotion, expressive face. |
| `neutral_dragon_01` | Neutral fallback small dragon, compact wings and horns, readable four-direction stride despite larger creature styling. |
| `neutral_robot_01` | Neutral fallback robot, simple toy-like metal body, antenna or panel details, mechanical four-phase walk. |
| `neutral_cooper_01` | Cooper in his default rumpled lab coat: white chicken, red comb and wattle, orange beak and feet, oversized goggles, small bandage, mild lab scuffs. |
| `pirate_human_01` | Pirate-themed human in a bandana or tricorn-inspired outfit, sash, boots, bright readable pirate colors. Include skin and hair masks. |
| `pirate_ghost_01` | Pirate ghost with spectral body plus pirate costume cues such as bandana, sash, or tiny hat; keep the ghost body obvious. |
| `pirate_cooper_01` | Cooper with pirate coat and red sash while retaining goggles, white feathers, lab-coat identity cues, and scruffy test-subject charm. |
| `ninja_human_01` | Ninja-themed human in wrapped clothing, mask/headband, compact stealth silhouette. Include skin mask; hair can be hidden by the hood. |
| `ninja_zombie_01` | Ninja zombie with wrapped clothing and undead stance, kid-safe, no gore, clear four-direction shamble. |
| `dragon_human_01` | Dragon-world human, knight or wizard treatment, warm fantasy colors, armor or robe cues. Include skin and hair masks. |
| `dragon_dragon_01` | Dragon-world dragon, heroic small dragon with horns, wings, tail, and clear foot/tail movement in all directions. |
| `dragon_ghost_01` | Dragon-world ghost with ember or castle-fantasy accents, still visibly a ghost body. |
| `dragon_cooper_01` | Cooper in blue-and-gold dragon-rider/lab treatment, with goggles, white feathers, red comb, lab assistant identity. |
| `haunted_human_01` | Haunted-theme human, playful spooky costume or explorer outfit, subdued purples/greens, not frightening. Include skin and hair masks. |
| `haunted_zombie_01` | Haunted zombie, cartoon-safe undead, ragged clothes, no gore, readable shuffling locomotion. |
| `haunted_ghost_01` | Haunted ghost with classic sheet-like silhouette, eerie glow, expressive face, wisp locomotion. |
| `haunted_dragon_01` | Haunted dragon with spooky accents, muted colors, horns/wings/tail, kid-safe rather than horror. |
| `haunted_robot_01` | Haunted robot with patched metal, tiny spooky charm details, green/purple glow accents, mechanical gait. |
| `haunted_cooper_01` | Cooper in playful haunted/zombie-world styling without making him undead: goggles, lab coat, white feathers, mild spooky scuffs. |
| `space_human_01` | Space human astronaut, compact helmet/suit, bright science-fiction colors. Include skin and hair masks; helmet must not hide all expression. |
| `space_robot_01` | Space robot with sleek small body, antenna or visor, blue/cyan energy details, clear mechanical stride. |
| `space_ghost_01` | Space ghost with helmet/jetpack or comet-like cues, spectral body, readable drift cycle. |
| `space_cooper_01` | Cooper in compact astronaut lab suit, still white chicken with red comb, goggles, lab-coat identity, and scruffy charm. |

## Character Event Sheets

| Asset ID | Recreation direction |
| --- | --- |
| `space_cooper_01_attack` | Four left slash frames and four right slash frames for Cooper using a short sword, energetic but readable, 12 FPS play once. |
| `space_cooper_01_defeated` | Four left and four right cartoon defeat frames for Cooper, harmless knocked-out/poof reaction, 10 FPS play once. |
| `space_human_01_attack` | Four left slash frames and four right slash frames for the space human, matching `short_sword_v1` attachment timing, 12 FPS play once. |
| `space_human_01_defeated` | Four left and four right cartoon defeat frames for the space human, non-gory, 10 FPS play once. |
| `space_robot_01_defeated` | Four left and four right robot defeat frames, sparks or parts wobble, no debris outside frame, 10 FPS play once. |
| `space_ghost_01_defeated` | Four left and four right ghost dispersal frames, spectral fade/poof, 10 FPS play once. |

## Boss Sprites

| Asset ID | Recreation direction |
| --- | --- |
| `neutral_green_hills_boss_01` | Large green-hills boar boss, cartoon chunky body, left/right idle and four walk frames, grounded weight. |
| `neutral_green_hills_boss_01_defeated` | Boar boss defeated sequence, eight left and eight right frames, cartoon collapse or dazed poof, no gore. |
| `space_boss_01` | Large space robot boss, chunky readable machinery, left/right idle and walk cycle, bright sci-fi accents. |
| `space_boss_01_defeated` | Space robot boss defeated sequence, eight left and eight right frames with sparks, smoke, and harmless shutdown. |
| `haunted_boss_01` | Large haunted pumpkin golem boss, carved pumpkin/stone/roots, playful spooky styling, left/right walk. |
| `haunted_boss_01_defeated` | Pumpkin golem defeated sequence, eight left and eight right frames, crumbles or bursts into harmless spooky light. |
| `dragons_emberkeep_boss_01` | Large Emberkeep dragon boss, volcanic castle palette, wings/horns/tail, left/right idle and walk cycle. |
| `dragons_emberkeep_boss_01_defeated` | Emberkeep dragon boss defeated sequence, eight left and eight right frames with smoke/embers and cartoon daze. |

## Platformer Terrain And Objects

### Neutral Green Hills

| Asset ID | Recreation direction |
| --- | --- |
| `neutral_green_hills_platformer_ground_01` | Single solid grass-and-dirt ground tile, bright storybook green top, earthy side face, tiles cleanly. |
| `neutral_green_hills_platformer_platform_01` | Single floating grassy platform tile, readable top ledge and underside, solid collision. |
| `neutral_green_hills_platformer_obstacle_01` | Single solid obstacle tile, storybook rock/log/earth mound treatment. |
| `neutral_green_hills_platformer_hazard_01` | Four-frame animated waterfall or water hazard, `2 x 2`, flowing blue frames, hazard collision. |
| `neutral_green_hills_flying_cooper_01` | Four-frame `2 x 2` flying Cooper object, side-view flapping/gliding motion, centered anchor. |

### Space

| Asset ID | Recreation direction |
| --- | --- |
| `space_platformer_ground_01` | Single solid moon-base ground tile, metal panel or lunar base floor, clear top surface. |
| `space_platformer_platform_01` | Single floating space platform, metal or glowing edge, solid collision. |
| `space_platformer_obstacle_01` | Single cargo crate or machinery block, space station styling, solid collision. |
| `space_platformer_hazard_01` | Four-frame `2 x 2` animated flame or energy hazard: low, rise, high, recede. |
| `space_platformer_coin_01` | Four-frame `2 x 2` spinning energy coin/cell, front, three-quarter, edge, three-quarter. |
| `space_platformer_coin_01_collected` | Four-frame `2 x 2` collected poof/spark burst, 12 FPS, play once. |
| `space_platformer_checkpoint_01` | Four-frame `2 x 2` checkpoint flag/beacon, wave up/center/down/center, bottom anchored. |
| `space_platformer_checkpoint_01_activated` | Four-frame activation flash for the checkpoint, ending in activated state. |
| `space_platformer_goal_01` | Four-frame `2 x 2` `64 x 96` goal beacon/flag, waving, bottom anchored. |
| `space_platformer_goal_01_level_complete` | Four-frame level-complete version of the goal, celebratory glow, play once. |
| `space_platformer_hud_lives_01` | Single `64 x 64` HUD lives icon, space/Cooper-friendly, centered, no text baked in. |
| `space_platformer_hud_coins_01` | Single `64 x 64` HUD coin counter icon, matches the space coin, centered, no numbers baked in. |

### Haunted Graveyard

| Asset ID | Recreation direction |
| --- | --- |
| `haunted_graveyard_platformer_ground_01` | Single solid graveyard ground tile, dark soil/grass, spooky but readable top edge. |
| `haunted_graveyard_platformer_platform_01` | Single haunted platform tile, stone or old wood with moss, solid collision. |
| `haunted_graveyard_platformer_obstacle_01` | Single obstacle tile, graveyard prop such as stump/stone/fence, solid collision. |
| `haunted_graveyard_platformer_hazard_01` | Eight-frame `4 x 2` hazard hand animation: hidden, emerge, rise, high, swipe, descend, lower, reset. |
| `haunted_tombstone_01` | Single `64 x 96` tombstone obstacle, bottom anchored, clear silhouette. |
| `haunted_crypt_door_01` | Four-frame `2 x 2` `64 x 96` crypt door: closed, opening, opening, open. |
| `haunted_magic_portal_01` | Eight-frame `4 x 2` `128 x 128` magic portal, dark central opening, swirling spooky glow, looped. |
| `haunted_spirit_orb_01` | Four-frame `2 x 2` `48 x 48` glowing spirit orb, pulsing bright core. |
| `haunted_flying_cooper_bat_01` | Four-frame `2 x 2` flying Cooper bat form, playful costume, centered, looped. |

### Dragons Emberkeep

| Asset ID | Recreation direction |
| --- | --- |
| `dragons_emberkeep_platformer_ground_01` | Single solid volcanic castle ground tile, stone/lava-earth mix, clear top surface. |
| `dragons_emberkeep_platformer_platform_01` | Single emberlit stone platform tile, floating ledge, solid collision. |
| `dragons_emberkeep_platformer_obstacle_01` | Single solid Emberkeep obstacle, rock/brazier/pillar feel, volcanic colors. |
| `dragons_emberkeep_platformer_hazard_01` | Four-frame `2 x 2` lava hazard: low, rise, high, recede, glowing orange. |
| `dragons_emberkeep_platformer_coin_01` | Four-frame `2 x 2` spinning dragon coin/gem, warm gold/ember palette. |
| `dragons_emberkeep_platformer_coin_01_collected` | Four-frame collected ember poof, 12 FPS, play once. |
| `dragons_emberkeep_platformer_checkpoint_01` | Four-frame checkpoint banner/beacon with Emberkeep styling, bottom anchored. |
| `dragons_emberkeep_platformer_checkpoint_01_activated` | Four-frame activated checkpoint glow/banner sequence, play once. |
| `dragons_emberkeep_platformer_goal_01` | Four-frame `2 x 2` `64 x 96` goal banner/gate marker, volcanic castle styling. |
| `dragons_emberkeep_platformer_goal_01_level_complete` | Four-frame celebratory goal-complete event, ember glow, play once. |
| `dragons_emberkeep_fireball_01` | Four-frame `2 x 2` small fireball projectile, flickering flame core, centered. |

## Shared Effects And Weapons

| Asset ID | Recreation direction |
| --- | --- |
| `shared_victory_burst_01` | Eight-frame `4 x 2` neutral victory burst, bright celebratory stars/confetti/energy, theme-neutral. |
| `shared_game_over_01` | Four-frame `2 x 2` game-over impact card pieces: `GAME`, `OVER`, left impact, right impact; neutral theme. |
| `short_sword_v1` | Single `64 x 64` short sword sprite, neutral/space compatible, grip at `(32, 49)`, clean silhouette for rotation around character hands. |

## Human Appearance Masks And Palettes

For every human character, recreate same-size `320 x 256` RGBA masks:

- `<asset-id>-skin-mask.png`: transparent outside skin. Opaque grayscale indexes
  `0`, `85`, `170`, and `255` represent shadow, midtone, light, and highlight.
- `<asset-id>-hair-mask.png`: transparent outside hair. Use the same four index
  values and never overlap the skin mask.

Mask-bearing assets:

- `neutral_human_01`
- `pirate_human_01`
- `ninja_human_01`
- `dragon_human_01`
- `haunted_human_01`
- `space_human_01`

Recreate `sprite-palettes/skin_tones_v1.json` with six four-color ramps and
default `skin_04`. Recreate `sprite-palettes/hair_colors_v1.json` with eight
four-color ramps and default `hair_03`: black, dark brown, brown, auburn, red,
blond, platinum, and gray.

Validate masks by processing the matching sprite recipes and inspecting the
skin-tone and hair-color previews.

## Background Packs

Generate each background layer as a wide transparent or partially transparent
repeat-x PNG at `2172 x 724` RGBA. Layers must tile horizontally, support
`mirrorAlternate`, and preserve the listed parallax composition.

| Background ID | Layers to recreate |
| --- | --- |
| `neutral_green_hills_01` | Base color `#4dbcf2`. `background_neutral_green_hills_castle_far_01`: distant castle and blue-green mountain forests, parallax `0.10`, center anchored. `background_neutral_green_hills_waterfalls_mid_01`: waterfalls and mid-distance valley, parallax `0.34`, bottom anchored. `background_neutral_green_hills_foliage_near_01`: lush foreground foliage, parallax `0.66`, bottom anchored. |
| `space_orbital_outpost_01` | Base color `#07091d`. `background_space_stars_far_01`: bright starry sky, parallax `0.12`, center anchored. `background_space_moon_mid_01`: moon-base horizon, parallax `0.38`, bottom anchored. `background_space_station_near_01`: station structures and outpost foreground, parallax `0.68`, bottom anchored. |
| `haunted_graveyard_01` | Base color `#17143f`. `background_haunted_graveyard_01`: single repeat-x moonlit graveyard layer with crooked castle shapes, bare trees, iron fences, old stones, subdued pumpkin-orange accents, parallax `0.24`, bottom anchored. |
| `dragons_emberkeep_01` | Base color `#241225`. `background_dragons_ash_far_01`: drifting ash and distant volcanic atmosphere, parallax `0.10`, center anchored. `background_dragons_volcano_mid_01`: lava peaks and ember sky, parallax `0.34`, bottom anchored. `background_dragons_ruins_near_01`: ruined battlements/stronghold silhouettes, parallax `0.66`, bottom anchored. |

## Audio Packs

All current WAV files are mono, 16-bit PCM, `22050 Hz`. Prefer regenerating with
the deterministic scripts, then validate:

```bash
python3 tools/generate_audio.py
python3 tools/generate_emberkeep_audio.py
python3 tools/audio.py validate
```

If recreating with AI audio instead of the scripts, preserve the cue names,
durations, loopability, and relative gains from the pack JSON.

### `space_basic_v1`

Generate an upbeat compact sci-fi pack:

- `gameplay_loop.wav`: about `17.143s`, seamless 8-bar loop, bright synth lead,
  simple bass, soft pulse percussion.
- `jump.wav`: about `0.240s`, rising synth sweep.
- `land.wav`: about `0.160s`, soft low thud with filtered noise.
- `collectible.wav`: about `0.240s`, two-note bright pickup chime.
- `enemy_defeat.wav`: about `0.400s`, descending synth zap with noise tail.
- `player_damage.wav`: about `0.260s`, short warning buzz.
- `player_death.wav`: about `0.820s`, longer descending cartoon synth fall.
- `respawn.wav`: about `0.620s`, ascending four-note reentry arpeggio.
- `weapon_swing.wav`: about `0.220s`, quick airy whoosh plus high sweep.
- `weapon_hit.wav`: about `0.250s`, crisp impact chirp and noise hit.
- `fire.wav`: about `0.400s`, sci-fi projectile burst with sweep and noise.
- `checkpoint.wav`: about `0.680s`, three-note success chime.
- `goal.wav`: about `1.340s`, celebratory ascending flourish.

### `dragons_emberkeep_v1`

Generate a compact minor-key forge-and-castle pack:

- `gameplay_loop.wav`: about `18.462s`, seamless 8-bar loop, warm triangle lead,
  minor fantasy melody, low forge-like pulse.
- `jump.wav`: about `0.250s`, earthy rising sweep with slight noise.
- `land.wav`: about `0.200s`, heavier stone thud.
- `collectible.wav`: about `0.320s`, three-note gem/ember chime.
- `enemy_defeat.wav`: about `0.480s`, descending fiery sweep and noise.
- `player_damage.wav`: about `0.300s`, short hot buzz.
- `player_death.wav`: about `0.900s`, longer falling fantasy tone.
- `respawn.wav`: about `0.680s`, four-note magical return.
- `weapon_swing.wav`: about `0.240s`, metal/air swing.
- `weapon_hit.wav`: about `0.300s`, chunky metal strike with noise.
- `fire.wav`: about `0.440s`, fiery burst with low-to-high flame sweep.
- `checkpoint.wav`: about `0.760s`, four-note checkpoint fanfare.
- `goal.wav`: about `1.550s`, six-note victory flourish.

## Brand And Reference Images

These files are visual assets for the game package. Recreate them as bitmap
brand/reference art, not as runtime sprite sheets.

| Asset | Recreation direction |
| --- | --- |
| `favicon.png` and `logo.png` | `1254 x 1254` Splat Lab icon mark. Use a clean, playful lab/game identity with strong readability at small sizes. `logo.png` should preserve transparency. |
| `logo-text.png` | `1448 x 472` transparent wordmark treatment for Splat Lab. Keep chunky, playful, kid-friendly letterforms. |
| `brand/logo.png` | Same square transparent Splat Lab mark as the app logo. |
| `brand/cooper.png` | `1536 x 1024` full-color Cooper reference image: white chicken, goggles, rumpled lab coat, red comb/wattle, orange beak/feet, mild scuffs and bandage. |
| `brand/app-1.png` | `1448 x 1086` product reference mockup showing the intended kid-friendly game-builder visual direction. |
| `brand/mock-1.png` | `1024 x 1536` vertical product/art reference mockup for Splat Lab tone and layout. |
| `brand/mock-2.png` | `1226 x 1283` product/art reference mockup for Splat Lab tone and layout. |

## Map Placement Notes

Current maps use these backgrounds directly: `neutral_green_hills_01`,
`space_orbital_outpost_01`, `haunted_graveyard_01`, and
`dragons_emberkeep_01`.

Current maps place these character/object assets directly: `neutral_ghost_01`,
`neutral_robot_01`, `neutral_zombie_01`, `neutral_green_hills_flying_cooper_01`,
`space_ghost_01`, `space_robot_01`, `haunted_tombstone_01`,
`haunted_spirit_orb_01`, `haunted_flying_cooper_bat_01`, `dragon_ghost_01`, and
`dragon_dragon_01`.

Other listed assets are still part of the selectable/runtime catalog and should
be recreated with the same priority as the mapped assets during a full asset
migration.
