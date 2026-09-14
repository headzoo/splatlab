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
- Maze floor, obstacle, and key: static `64 x 64` RGBA cells. Maze walls are
  `4 x 4` connected-wall sheets with `64 x 64` frames in NESW bitmask order
  (`N=1`, `E=2`, `S=4`, `W=8`). Maze doors are `2 x 2` sheets with `64 x 96`
  frames ordered closed, opening 1, opening 2, open at 6 FPS, play once.

## Character Sprites

Generate all characters as role-neutral runtime assets. A body can be used as a
player, enemy, or NPC by map data.

| Asset ID | Recreation direction |
| --- | --- |
| `neutral_human_01` | Neutral fallback human adventurer, simple practical outfit, friendly readable face, no fixed skin or hair color baked into gameplay. Include skin and hair masks. |
| `neutral_girl_01` | Neutral girl adventurer with practical teal-green tunic, dark leggings, brown boots, and a short low ponytail. Preserve her identity across themes and include skin and hair masks. |
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
| `dragon_girl_01` | Dragon-world girl knight derived from `neutral_girl_01`, with practical silver-blue armor, berry-purple tunic, restrained gold trim, and no weapon. Include skin and hair masks. |
| `dragon_dragon_01` | Dragon-world dragon, heroic small dragon with horns, wings, tail, and clear foot/tail movement in all directions. |
| `dragon_ghost_01` | Dragon-world ghost with ember or castle-fantasy accents, still visibly a ghost body. |
| `dragon_cooper_01` | Cooper in blue-and-gold dragon-rider/lab treatment, with goggles, white feathers, red comb, lab assistant identity. |
| `haunted_human_01` | Haunted-theme human, playful spooky costume or explorer outfit, subdued purples/greens, not frightening. Include skin and hair masks. |
| `haunted_girl_01` | Haunted-world girl adventurer derived from `neutral_girl_01`, with a deep-purple explorer outfit, short close-held ragged cape, and cyan moonstone clasp; living, friendly, and non-gory. Include skin and hair masks. |
| `haunted_zombie_01` | Haunted zombie, cartoon-safe undead, ragged clothes, no gore, readable shuffling locomotion. |
| `haunted_ghost_01` | Haunted ghost with classic sheet-like silhouette, eerie glow, expressive face, wisp locomotion. |
| `haunted_dragon_01` | Haunted dragon with spooky accents, muted colors, horns/wings/tail, kid-safe rather than horror. |
| `haunted_robot_01` | Haunted robot with patched metal, tiny spooky charm details, green/purple glow accents, mechanical gait. |
| `haunted_cooper_01` | Cooper in playful haunted/zombie-world styling without making him undead: goggles, lab coat, white feathers, mild spooky scuffs. |
| `space_human_01` | Space human astronaut, compact helmet/suit, bright science-fiction colors. Include skin and hair masks; helmet must not hide all expression. |
| `space_girl_01` | Space girl astronaut derived from `neutral_girl_01`, with a compact white/navy suit, cyan lights, violet accents, and an open helmet that preserves her face and ponytail. Include skin and hair masks. |
| `space_robot_01` | Space robot with sleek small body, antenna or visor, blue/cyan energy details, clear mechanical stride. |
| `space_ghost_01` | Space ghost with helmet/jetpack or comet-like cues, spectral body, readable drift cycle. |
| `space_cooper_01` | Cooper in compact astronaut lab suit, still white chicken with red comb, goggles, lab-coat identity, and scruffy charm. |
| `ice_world_human_01` | Ice World human derived from `neutral_human_01`, wearing a thick icy-blue hooded winter coat with pale fur trim, insulated snow pants, mittens, and winter boots. Preserve the friendly face and brown hair across all four directions and include skin and hair masks. Generate with the built-in image editor, restore any baked checker alpha conservatively, then process `sprite-specs/ice_world_human_01.json`; keep the passing candidate staged until Sprite Viewer approval. |
| `ice_world_girl_01` | Ice World girl derived from `neutral_girl_01`, wearing a thick icy-blue hooded winter coat with pale fur trim, insulated navy snow pants, mittens, and winter boots while preserving her friendly face, brown hair, and low ponytail in all four directions. Include skin and hair masks, process `sprite-specs/ice_world_girl_01.json`, and keep the passing candidate staged until Sprite Viewer approval. |
| `ice_world_cooper_01` | Cooper in an unmistakable icy-blue winter parka with pale fur trim while retaining his white feathers, red comb, orange beak and feet, oversized goggles, and friendly identity. Recreate the full `5 x 4` locomotion source and process `sprite-specs/ice_world_cooper_01.json`; keep the passing candidate staged until Sprite Viewer approval. |
| `ice_world_robot_01` | Ice World robot derived from `neutral_robot_01`, with the same compact friendly silhouette rebuilt from faceted translucent glacier ice, frosted white edges, deep cyan shadows, crystalline highlights, and a cold blue face display. Process `sprite-specs/ice_world_robot_01.json` and review every direction before promotion. |
| `ice_world_ghost_01` | Ice World ghost derived from `neutral_ghost_01`, retaining the friendly face and tapered floating tail while using faceted pale-cyan ice planes, frosty highlights, deep-blue internal shadows, and small icicle edges. Process `sprite-specs/ice_world_ghost_01.json` and keep the candidate staged until Sprite Viewer approval. |

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
| `ice_world_boss_01` | Glacier Brute, a large humanoid ice boss with a broad crystalline body and sharp shoulder, back, and forearm crystals. Recreate the `5 x 2` source from `sprites/ice_world_boss_01-source.png`, preserving left/right idle plus four walk phases, then process `sprite-specs/ice_world_boss_01.json`; keep the candidate and its defeated event sheet staged until Sprite Viewer approval. |
| `ice_world_boss_01_defeated` | Glacier Brute's `8 x 2` non-looping defeat sequence, progressively cracking and collapsing into harmless ice chunks and frost. It is the required `defeated` event sheet owned by the `ice_world_boss_01` recipe. |

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
| `space_platformer_hud_lives_01` | Single `64 x 64` lives portrait, space/Cooper-friendly, centered, no text baked in; reused as the shared extra-life pickup on every Platformer map. |
| `space_platformer_hud_coins_01` | Single `64 x 64` HUD coin counter icon, matches the space coin, centered, no numbers baked in. |

### Haunted Graveyard

| Asset ID | Recreation direction |
| --- | --- |
| `haunted_graveyard_platformer_ground_01` | Single solid graveyard ground tile, dark soil/grass, spooky but readable top edge. |
| `haunted_graveyard_platformer_platform_01` | Single haunted platform tile, stone or old wood with moss, solid collision. |
| `haunted_graveyard_platformer_obstacle_01` | Single obstacle tile, graveyard prop such as stump/stone/fence, solid collision. |
| `haunted_graveyard_platformer_hazard_01` | Eight-frame `4 x 2` hazard hand animation: hidden, emerge, rise, high, swipe, descend, lower, reset. |
| `haunted_graveyard_platformer_spring_01` | One-tile Graveyard platform spring made from weathered purple-brown timber, iron corner plates, moss, and a heavy black-iron coil with spectral teal highlights. Its `compressed` event sheet uses the shared four-frame expanded, compressing, compressed, and rebounding sequence at 12 FPS. Recreate by retheming the Ice World spring source while preserving its exact geometry, process `sprite-specs/haunted_graveyard_platformer_spring_01.json`, and promote both sheets together only through Sprite Viewer approval. |
| `haunted_tombstone_01` | Single `64 x 96` tombstone obstacle, bottom anchored, clear silhouette. |
| `haunted_crypt_door_01` | Four-frame `2 x 2` `64 x 96` crypt door: closed, opening, opening, open. |
| `haunted_magic_portal_01` | Eight-frame `4 x 2` `128 x 128` magic portal, dark central opening, swirling spooky glow, looped. |
| `haunted_spirit_orb_01` | Four-frame `2 x 2` `48 x 48` glowing spirit orb, pulsing bright core. |
| `haunted_flying_cooper_bat_01` | Four-frame `2 x 2` flying Cooper bat form, playful costume, centered, looped. |
| `haunted_graveyard_flaming_pumpkin_01` | Four-frame `2 x 2` flaming jack-o-lantern projectile, Pumpkin Warden orange/brown palette, attached flickering flame, centered in a `64 x 64` frame. Generate the source with the Pumpkin Warden and Emberkeep fireball masters as identity/layout references, then process `sprite-specs/haunted_graveyard_flaming_pumpkin_01.json`; keep the passing result in `sprite-build/` until Sprite Viewer approval. |

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
| `dragons_emberkeep_flying_fireball_01` | Four-frame `2 x 2` non-colliding Dragon World fly-by fireball, with a stable white-hot core and left-facing flame tail phases that rise, level, fall, and return upward. Recreate from the existing fly-by sheets as the layout contract and `dragons_emberkeep_fireball_01` as the visual reference, process `sprite-specs/dragons_emberkeep_flying_fireball_01.json`, and keep the result in `sprite-build/` until Sprite Viewer approval. Its camera-triggered arc is authored in MapSpec and is not baked into the art. |

### Ice World

| Asset ID | Recreation direction |
| --- | --- |
| `ice_world_platformer_ground_01` | Single full-cell glacial ground tile with a snowy top edge, chunky blue ice and rock facets, and clean repeatable left/right edges. Recreate from `sprites/ice_world_platformer_ground_01-source.png`, then process its matching recipe. |
| `ice_world_platformer_platform_01` | Single full-cell floating ice platform tile with a snowy upper ledge and deeper blue lower facets. Recreate from `sprites/ice_world_platformer_platform_01-source.png`, then process its matching recipe. |
| `ice_world_platformer_obstacle_01` | Single square translucent ice-block obstacle with a dark-blue outline, crossed internal braces/cracks, and solid collision. Recreate from `sprites/ice_world_platformer_obstacle_01-source.png`, then process its matching recipe. |
| `ice_world_platformer_hazard_01` | Four-frame `2 x 2` animated crystal-spike hazard with low, rising, high, and receding silhouettes plus restrained frost particles. Recreate from `sprites/ice_world_platformer_hazard_01-source.png`, then process its matching recipe at 8 FPS. |
| `ice_world_platformer_coin_01` | Four-frame `2 x 2` spinning frozen medallion with a snowflake emblem, faceted pale-cyan ice, frosty white highlights, and deep arctic-blue edges. Recreate the front, three-quarter, edge, and opposite-three-quarter views from `sprites/ice_world_platformer_coin_01-source.png`, then process `sprite-specs/ice_world_platformer_coin_01.json`; the complete package remains staged until Sprite Viewer approval. |
| `ice_world_platformer_coin_01_collected` | Four-frame `2 x 2` play-once frost burst owned by the Ice World coin recipe: impact flash, expanding ice-shard/snowflake ring, dissipating particles, then a sparse final sparkle at 12 FPS. Recreate from `sprites/ice_world_platformer_coin_01_collected-source.png`; approval of the coin promotes both sheets together. |
| `ice_world_platformer_spring_01` | One-tile Ice World platform spring made from square frosted wooden top and bottom pieces with a large steel coil between them. The default sheet is the fully expanded state; its `compressed` event sheet is a four-frame expanded, compressing, compressed, and rebounding sequence at 12 FPS. Recreate both sources with the built-in image generator, process `sprite-specs/ice_world_platformer_spring_01.json`, and promote both sheets together only through Sprite Viewer approval. |
| `ice_world_crystal_projectile_01` | Four-frame `2 x 2` sharp ice-crystal projectile with the same crystal centered at successive end-over-end rotations. Recreate from `sprites/ice_world_crystal_projectile_01-source.png`, then process its matching 10 FPS recipe; the map's `lobbed_projectile` path supplies the arc. |

## Maze Terrain And Escape Objects

These four coordinated packs are the initial Maze Map Editor themes. Generate
each source as bright chunky pixel art matching the approved platformer theme,
then process the matching recipe. Floors are quiet, seamless top-down surfaces;
walls use the 16-frame connected-wall contract; obstacles must read as distinct
solid grey blocks; keys are oversized readable pickups; doors are the only
animated maze-specific assets.

| Asset ID | Recreation direction |
| --- | --- |
| `neutral_green_hills_maze_floor_01` | Seamless top-down lush short grass in varied fresh greens, with quiet irregular pixel clusters, tiny white, pale-yellow, and light-blue flowers, and only sparse warm-earth flecks. Grass must clearly dominate; avoid large plants, rocks, paths, focal objects, or obvious edge seams. |
| `neutral_green_hills_maze_wall_01` | Sixteen grass-capped warm fieldstone wall masks, row-major NESW order. Preserve the Graveyard wall atlas silhouette and normalize each source cell independently so every connector reaches its tile edge without hand-positioned offsets. |
| `neutral_green_hills_maze_obstacle_01` | Static squat grey fieldstone block with moss and one small pale flower. |
| `neutral_green_hills_maze_key_01` | Static brass trefoil key with a small green leaf accent. |
| `neutral_green_hills_maze_door_01` | Four-frame rounded fieldstone garden arch with a warm timber door and vines. |
| `space_maze_floor_01` | Seamless near-black navy deck with broad low-contrast seams and sparse muted rivets; no bright rails, bevels, pipes, or dense machinery. |
| `space_maze_wall_01` | Sixteen raised silver-white bulkhead masks with cyan edge lights and deep navy shadow, intentionally much brighter than the floor. Preserve the Graveyard wall atlas silhouette. |
| `space_maze_obstacle_01` | Static matte-grey lunar cargo block with bolts and a cyan status light. |
| `space_maze_key_01` | Static gold-and-blue circuit access key with a cyan core. |
| `space_maze_door_01` | Four-frame blue-steel airlock whose panel slides upward into the arch. |
| `haunted_graveyard_maze_floor_01` | Seamless top-down moonlit grave soil with small flat stones, moss, and cyan flecks. |
| `haunted_graveyard_maze_wall_01` | Sixteen cracked violet-grey cemetery wall masks with moss and cyan rune flecks. |
| `haunted_graveyard_maze_obstacle_01` | Static charcoal-grey broken cemetery pedestal with lichen, vine, and rune scratch. |
| `haunted_graveyard_maze_key_01` | Static tarnished silver-purple trefoil key with a cyan rune gem. |
| `haunted_graveyard_maze_door_01` | Four-frame gothic cemetery arch with an iron-banded purple door and ghost-light. |
| `dragons_emberkeep_maze_floor_01` | Seamless low-contrast charcoal-brown flagstone with sparse dim ember flecks; no bright lava network or raised boulders. |
| `dragons_emberkeep_maze_wall_01` | Sixteen raised warm-grey basalt fortress masks with a continuous orange-red molten outline and deep shadow, intentionally much brighter than the floor. Preserve the Graveyard wall atlas silhouette. |
| `dragons_emberkeep_maze_obstacle_01` | Static cool-grey forged-stone block with iron bands, scale carving, and one ember crack. |
| `dragons_emberkeep_maze_key_01` | Static dark-iron dragon-wing key with molten edges and a red ember gem. |
| `dragons_emberkeep_maze_door_01` | Four-frame black-basalt fortress arch with an iron door and orange dragon crest. |
| `shared_hole_hazard_01` | Static transparent top-down oval pit with a near-black center and narrow neutral charcoal rim. It contains no floor texture and can be selected in every maze theme; jump behavior comes from the runtime, not the image. |

The high-resolution generated masters live at
`sprites/<asset-id>-source.png`; passing candidates stay in `sprite-build/`
until the Sprite Viewer records approval. Door or wall source cleanup may use a
flat `#FF00FF` chroma background only as a generation intermediate; the stored
source and candidate must have genuine alpha transparency. A full-frame floor
source may retain one invisible transparent source pixel so the fail-closed
normalizer can verify alpha without changing the opaque runtime tile.

## Shared Effects And Weapons

| Asset ID | Recreation direction |
| --- | --- |
| `shared_victory_burst_01` | Eight-frame `4 x 2` neutral victory burst, bright celebratory stars/confetti/energy, theme-neutral; also plays once at an extra-life pickup when it is collected. |
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
- `neutral_girl_01`
- `pirate_human_01`
- `ninja_human_01`
- `dragon_human_01`
- `dragon_girl_01`
- `haunted_human_01`
- `haunted_girl_01`
- `space_human_01`
- `space_girl_01`

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
| `ice_world_01` | Base color `#bcecff`. `background_ice_world_mountains_far_01`: snowy mountains and distant crystalline palace, parallax `0.10`, center anchored. `background_ice_world_glaciers_mid_01`: glacial cliffs, frozen waterfalls, frosted firs, and cold mist, parallax `0.34`, bottom anchored. `background_ice_world_crystals_near_01`: snowbanks, frosted branches, icicles, and turquoise crystals, parallax `0.66`, bottom anchored. Recreate all three as `2172 x 724` RGBA repeat-x layers with genuine transparency and `mirrorAlternate` support. |

## Audio Packs

Every WAV is 16-bit PCM, `22050 Hz`, and mono. Music is deliberately mono: a
stereo image doubles the download for a loop that plays behind a game, and no
mix depends on panning. Prefer regenerating with the deterministic scripts,
then validate:

```bash
python3 tools/generate_audio.py            # space_basic_v1
python3 tools/generate_emberkeep_audio.py  # dragons_emberkeep_v1
python3 tools/generate_theme_audio.py      # the three theme packs below
python3 tools/generate_boss_music.py       # shared boss loop, written to all five
python3 tools/audio.py validate
```

There are five packs, one per campaign theme. The site player never stores a
pack name in map data; it derives the pack from the theme ID the map already
carries (`presentation.backgroundId` or `presentation.mazeThemeId`) in
`apps/website/src/game/sound-packs.ts`, matching on theme prefix so a new
`ice_world_02` or `haunted_graveyard_maze_03` inherits its theme's audio.

| Pack | Theme prefix | Gameplay loop |
| --- | --- | --- |
| `space_basic_v1` | `space` | `68.571s`, 32 bars at `112` BPM, E minor |
| `dragons_emberkeep_v1` | `dragons_emberkeep` | `73.143s`, 32 bars at `105` BPM, A minor |
| `neutral_green_hills_v1` | `neutral_green_hills` | `60.952s`, 32 bars at `126` BPM, G major |
| `haunted_graveyard_v1` | `haunted_graveyard` | `60.000s`, 24 bars at `96` BPM, D minor |
| `ice_world_v1` | `ice_world` | `57.600s`, 24 bars at `100` BPM, A major |

Each music cue declares its `tempo` in the pack JSON, and `tools/audio.py`
rejects a loop whose frame count is not exactly `bars x 4 x 60 x 22050 / bpm`.
A fractional frame at the loop point reopens the seam, so only tempos that
divide the sample rate evenly are usable. `104` BPM over 32 bars does not
qualify; `105` does.

Validation is fail-closed on the loop join itself. A music loop is rejected when
it carries more than `5 ms` of near-silence at either edge, when its last and
first frames differ by more than `0.05` full scale, or when the `25 ms` at
either edge falls below `15%` of the file's average level. Satisfy those by
letting sustained voices run past the buffer end and wrap to the front rather
than fading every voice to zero before the last frame. Audition a join with:

```bash
python3 tools/audio.py loopcheck audio/<pack>/gameplay_loop.wav --write-join /tmp/join.wav
```

If recreating with AI audio instead of the scripts, preserve the cue names,
durations, tempo, mono channel count, loopability, and relative gains from the
pack JSON, and confirm `loopcheck` still passes.

All five gameplay loops share one arrangement engine
(`render_phrased_loop` in `tools/generate_audio.py`). Each is built from
eight-bar phrases with six simultaneous voices — lead, sine counter-lead an
octave down, bass, a detuned sustained chord pad, a syncopated arpeggio, and
hats over a kick — and each phrase closes with a pickup over its final half
bar. Recreate a pack by keeping that shape and changing only key, tempo, phrase
form, and timbre.

### `space_basic_v1`

Generate an upbeat compact sci-fi pack:

- `gameplay_loop.wav`: exactly `68.571s` (`1512000` frames, 32 bars at `112`
  BPM) in E minor. Four phrases played as A A' B A''; the B phrase moves to
  Am D C G and thins the percussion so the return lifts. Bright soft-square
  lead over a triangle bass.
- `boss_loop.wav`: exactly `16s` (`352800` frames, 8 bars at `120` BPM),
  theme-neutral menace loop with a low minor drone against its tritone, an
  urgent ostinato, and heavy pulse percussion. Bars four and eight add a
  descending run that spills past the bar line, so on the last bar it resolves
  onto the root inside bar one. The same file ships in all five packs.
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

- `gameplay_loop.wav`: exactly `73.143s` (`1612800` frames, 32 bars at `105`
  BPM) in A minor, using the same A A' B A'' form as the Space loop but with a
  warm triangle lead, a soft-square forge bass, and a darker B phrase on
  Dm Bb F E for Phrygian colour. The tempo is `105` rather than `104` so 32
  bars land on a whole number of frames.
- `boss_loop.wav`: the same `16s` reusable menacing boss loop exposed through
  this pack's semantic `boss` music cue.
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

### `neutral_green_hills_v1`, `haunted_graveyard_v1`, and `ice_world_v1`

These three come from `tools/generate_theme_audio.py`, which takes one pack
definition per theme and shares the `themed_effects` builder, so all three carry
the same twelve effect cues at the same durations and differ only in timbre and
pitch. Pass a pack ID to regenerate just one:

```bash
python3 tools/generate_theme_audio.py ice_world_v1
```

Effect durations are identical across the three: `jump` `0.240s`, `land`
`0.180s`, `collectible` `0.280s`, `enemy_defeat` `0.440s`, `player_damage`
`0.280s`, `player_death` `0.860s`, `respawn` `0.650s`, `weapon_swing` `0.230s`,
`weapon_hit` `0.270s`, `fire` `0.420s`, `checkpoint` `0.720s`, `goal` `1.450s`.
Each pack's `boss_loop.wav` is the shared `16s` menace loop.

- `neutral_green_hills_v1`: the first map, so the friendliest pack. Gameplay
  loop is exactly `60.952s` (`1344000` frames, 32 bars at `126` BPM) in G major
  over G D Em C, with a bouncy soft-square lead and a B phrase that drops to
  the relative minor (C Am D G) so the return feels like a return. Effects are
  bright sine chimes with slightly reduced noise.
- `haunted_graveyard_v1`: exactly `60.000s` (`1323000` frames, 24 bars at `96`
  BPM) in D minor over Dm Bb F A, played as three phrases (A A' B). Hollow
  triangle lead, sine sub-bass, a softer kick, and a wider pad. The B phrase
  slides a semitone up into Eb and back, which is where the unease comes from.
  Effects lean on extra filtered noise and are pitched lower than the other
  packs.
- `ice_world_v1`: exactly `57.600s` (`1270080` frames, 24 bars at `100` BPM) in
  A major over A F#m D E, three phrases, with an F#m turn in the B phrase. A
  bell-like sine lead with a triangle counter-voice and a brighter arpeggio;
  sparse and airy rather than driving. Effects are the highest-pitched and
  least noisy of the five packs.

## Brand And Reference Images

These files are visual assets for the game package. Recreate them as bitmap
brand/reference art, not as runtime sprite sheets.

| Asset | Recreation direction |
| --- | --- |
| `favicon.png` and `logo.png` | `1254 x 1254` Splat Lab icon mark. Use a clean, playful lab/game identity with strong readability at small sizes. `logo.png` should preserve transparency. |
| `logo-text.png` | `1448 x 472` transparent wordmark treatment for Splat Lab. Keep chunky, playful, kid-friendly letterforms. |
| `brand/logo.png` | Same square transparent Splat Lab mark as the app logo. |
| `brand/cooper.png` | `1536 x 1024` full-color Cooper reference image: white chicken, goggles, rumpled lab coat, red comb/wattle, orange beak/feet, mild scuffs and bandage. |
| `brand/cooper-avatar-round.png` | `1254 x 1254` round Cooper avatar generated with the built-in image generator from `apps/website/public/brand/homepage/cooper-hero-fixed.png`, `apps/game/sprites/neutral_cooper_01.png`, and `brand/cooper.png`. Preserve the centered bust portrait, large goggles, red comb, orange beak, lab coat, cheek bandage, circular blue lab badge, and no text. If the generator bakes a checkerboard outside the badge, apply a circular alpha mask and verify genuine RGBA transparent corners. |
| `brand/cooper-profile-banner.png` | `1200 x 480` profile banner generated with the built-in image generator from `brand/cooper.png`, the Neutral Green Hills background layers, and the Neutral Green Hills platformer ground tile. Preserve the left-side cannon, Cooper flying in a playful arc through the center, the right-side safety net, vivid Green Hills map scenery, and no text/logos/signs. Resize the selected wide source to exactly `1200 x 480` and verify it remains below `10 MB`. |
| `brand/cooper-green-hills-cannon-comic.png` | `1254 x 1254` four-panel comic generated with the built-in image generator from `brand/cooper-profile-banner.png`, `brand/cooper-avatar-round.png`, Neutral Green Hills background layers, and the Neutral Green Hills platformer ground tile. Preserve the 2-by-2 panel layout, Green Hills backdrop, cannon/net setup, Cooper launch sequence, final net-catching-the-cannon gag, and exact post-rendered dialogue. Keep lettering deterministic by generating the art without text, then adding readable speech bubbles afterward. |
| `brand/app-1.png` | `1448 x 1086` product reference mockup showing the intended kid-friendly game-builder visual direction. |
| `brand/mock-1.png` | `1024 x 1536` vertical product/art reference mockup for Splat Lab tone and layout. |
| `brand/mock-2.png` | `1226 x 1283` product/art reference mockup for Splat Lab tone and layout. |
| `apps/website/public/brand/homepage/hero-background-clean.png` | `1585 x 992` homepage background plate derived from `hero-background.png` with the built-in image editor. Use the annotated homepage screenshot only to identify the outlined scenery; remove the high floating island, right-side floating platforms, coins, slime, ladder, crates, and right foreground terrain, then reconstruct those openings with matching blue sky, soft clouds, distant mountains, waterfalls, forested cliffs, and foliage. Preserve the castle, left terrain, camera, lighting, palette, and polished 3D-cartoon style; exclude text, UI, outlines, new platforms, characters, and watermarks. |
| `apps/website/public/brand/homepage/hero-parallax-far.png` | `1585 x 992` genuine-alpha full-canvas layer containing only the high floating grass-and-earth island in its original composition. Recreate from `hero-background.png` with the built-in image editor, preserving the island while making every other pixel transparent. If the editor bakes a checkerboard, restore alpha with `python3 apps/game/tools/restore_checker_alpha.py <generated> <output> --minimum-channel 135 --maximum-spread 32 --minimum-component-area 500`, normalize to `1585 x 992`, and verify `opaque=false`. |
| `apps/website/public/brand/homepage/hero-parallax-mid.png` | `1585 x 992` genuine-alpha full-canvas layer containing only the narrow platform below the castle and the small lower island in their original positions. Derive it from the original extracted layer by clearing the two isolated coin components while preserving every grass and rock pixel; exclude coins and every other scene element. |
| `apps/website/public/brand/homepage/hero-parallax-coin.png` | `512 x 512` transparent standalone homepage parallax coin generated with the built-in image generator. Use `hero-parallax-far.png` as the authoritative style reference and `hero-parallax-mid.png` only for the scene's gold palette and three-quarter perspective. Prompt for exactly one thick round gold coin with a beveled rim, orange-gold center, and embossed four-point sparkle; require genuine alpha and exclude currency symbols, platforms, grass, dirt, characters, scenery, text, borders, checkerboards, and watermarks. Trim the generated subject, resize it to fit within `512 x 512`, center it on a transparent canvas, and verify `opaque=false`. The homepage reuses this one asset across dedicated mid- and foreground coin tracks. |
| `apps/website/public/brand/homepage/hero-parallax-builder-materialize.png` | `640 x 512` transparent mid-depth material-preview platform generated with the built-in image generator using the two finished foreground platforms as references. Prompt for one three-block platform whose left half is neutral gray polygonal greybox geometry and whose right half is finished lime grass and warm orange earth, separated by a luminous cyan scan boundary with a few assembling square pixels. Exclude text, characters, coins, cursors, panels, scenery, checkerboards, and watermarks. Preserve the generated transparency, crop away isolated edge artifacts while retaining the scan pixels, trim, fit within `600 x 450`, center on a transparent `640 x 512` canvas, and verify `opaque=false`. |
| `apps/website/public/brand/homepage/hero-parallax-builder-selected.png` | `640 x 640` transparent foreground editor-state composition generated with the built-in image generator using the finished foreground platforms as references. Prompt for a selected two-block grass-and-earth platform with a thin cyan selection box, four chunky corner handles, a translucent cyan ghost block descending into an empty snap position, dotted alignment guides, and a small red-orange/blue two-axis move gizmo without letters. Exclude text, characters, coins, panels, scenery, and watermarks. If a gray checker is baked in, run `python3 apps/game/tools/restore_checker_alpha.py <generated> <output> --minimum-channel 0 --maximum-spread 32 --minimum-component-area 100`, trim, fit within `600 x 600`, center on a transparent `640 x 640` canvas, and verify `opaque=false`. |
| `apps/website/public/brand/homepage/hero-parallax-builder-boar.png` | `768 x 512` transparent foreground builder-state cutout generated with the built-in image generator using a single approved frame from `apps/game/sprites/neutral_green_hills_boss_01-source.png` as the Mossback Boar identity reference. Preserve the brown boar's pink snout, ivory tusks, black hooves, expressive eye, leafy green mantle, and white flowers; render the front half completely, transition at mid-torso through a cyan scan seam, and render the rear anatomy and foliage as translucent cyan triangulated CGI construction geometry with glowing nodes. Exclude platforms, coins, scenery, text, UI, checkerboards, black backgrounds, and watermarks. Trim, fit within `720 x 470`, center on a transparent `768 x 512` canvas, and verify `opaque=false`. |
| `apps/website/public/brand/homepage/hero-parallax-builder-coin.png` | `512 x 512` transparent foreground builder-state coin generated with the built-in image generator using `hero-parallax-coin.png` for the glossy gold shape and sparkle emblem. Render the left/front half as finished gold and the right/rear half as translucent cyan triangulated CGI construction geometry with glowing nodes, joined by a narrow luminous scan seam; keep one continuous circular silhouette and exclude currency symbols, extra coins, platforms, characters, scenery, text, UI, checkerboards, black backgrounds, and watermarks. Trim, fit within `470 x 470`, center on a transparent `512 x 512` canvas, and verify `opaque=false`. |
| `apps/website/public/brand/homepage/hero-parallax-front-step.png` | `1585 x 992` genuine-alpha full-canvas foreground layer containing a generated stepped floating island at `329 x 283 +1200+300`: a two-block-wide warm-orange earth base, smaller back-right grass block, and one rounded gray stone. Recreate with the built-in image generator using `hero-parallax-far.png` only as a style reference; match its saturated kid-friendly 3D-cartoon rendering, rounded bevels, lime grass, warm highlights, cool shadows, and three-quarter front perspective. Exclude every other object and scenery. Restore checker alpha with the documented `hero-parallax-far.png` command, crop to the subject, resize, place on the full canvas, and verify `opaque=false`. |
| `apps/website/public/brand/homepage/hero-parallax-front-flowers.png` | `1585 x 992` genuine-alpha full-canvas foreground layer containing a generated `420 x 180 +1070+650` three-block floating platform with lime grass and a few tiny yellow/orange wildflowers. Recreate with the built-in image generator using `hero-parallax-far.png` only as a style reference; match its saturated kid-friendly 3D-cartoon rendering, rounded bevels, warm highlights, cool shadows, and three-quarter front perspective. Exclude characters, coins, ladders, crates, signs, text, and scenery. Restore checker alpha with the documented `hero-parallax-far.png` command, crop to the subject, resize, place on the full canvas, and verify `opaque=false`. |
| `apps/website/public/brand/homepage/cooper-hero-fixed.png` | `1032 x 1190` transparent homepage Cooper derived from `cooper-hero.png`. Preserve every original pixel except the unintended transparent interiors inside the black-outlined white crown feathers beside the red comb; fill those holes with matching warm white/cream feather color while keeping the exterior transparent. |
| `apps/website/public/brand/site-header-logo.png` | `2067 x 634` transparent horizontal site-header lockup generated with the built-in image generator in compositing mode. Use the navbar logo crop from `brand/mock-parents.png` as the authoritative character and composition reference, `apps/game/logo-text.png` as the exact wordmark reference, and the previous lockup only as a wide-format guide. Prompt for one unified image with a newly drawn friendly Cooper at the far left (white feathers, red comb, large goggles, cheerful orange beak, one raised wing) and the complete yellow/red `Splat Lab!` wordmark immediately to his right; exclude the frantic hero pose, navbar UI, scenery, extra text, and backgrounds. If transparency is not emitted directly, regenerate onto uniform `#00ff00`, remove that chroma background, trim, and verify genuine RGBA alpha before use. |
| `apps/website/public/brand/about/cooper-hero.png` | `1399 x 1124` transparent about-page hero cutout. Recreate from the upper hero Cooper in `brand/mock-about.png` with the built-in image editor: preserve his exact spread-wing pose, expression, goggles, patched lab coat, pens, and `Cooper` badge; remove every surrounding page element onto genuine transparent alpha, with no halo or shadow. |
| `apps/website/public/brand/features/chat.png` | `651 x 772` live UI capture of the `/build` Cooper chat panel. Recreate by opening a populated builder on a signed-in Lab, then screenshot the left `Build with Cooper` panel. Must show Cooper's header, a finished setup choice (hero and game name), idea chips, and the message box. This is a product screenshot, not generated illustration. |
| `apps/website/public/brand/features/builder.png` | `937 x 880` live UI capture of the `/build` game preview. Recreate from the same builder session by screenshotting the right preview panel. Must show the live map, Play/Share chrome, paint tools, and Terrain/Objects palettes. This is a product screenshot, not generated illustration. |
| `apps/website/public/brand/features/player.png` | `1180 x 789` live UI capture of `/play/{gameId}` for a public platformer. Recreate by opening the shareable player, clicking Play so the game is running, then screenshotting the game shell with Pause visible and the Green Hills canvas in motion (no start overlay). This is a product screenshot, not generated illustration. |
| `apps/website/public/brand/features/screenshot-menu.png` | `1180 x 789` live UI capture of the in-game Screenshot action. Recreate from `/play/{gameId}` by right-clicking the canvas and screenshotting the player with the Screenshot menu open. This is a product screenshot, not generated illustration. |
| `apps/website/public/brand/features/media-library.png` | `1280 x 494` live UI capture of Lab `My Media`. Recreate after saving at least one canvas screenshot, then screenshot the Snapshots / My Media section with a thumbnail, game title, and saved date. This is a product screenshot, not generated illustration. |
| `apps/website/public/brand/features/lab.png` | `1280 x 544` live UI capture of Lab `My Games`. Recreate from `/lab` by screenshotting the Projects / My Games cards, including Create a Game and at least one saved project. This is a product screenshot, not generated illustration. |
| `apps/website/public/brand/parents/parents-content-background-source.png` | `1254 x 1254` generated master for the Parents information-section scenery. Recreate with the built-in image generator using `brand/mock-parents.png` only as a visual-style reference: cheerful blue sky, soft clouds, distant blue-green mountains, layered forest cliffs, waterfalls, vivid foliage, tiny flowers, and warm stone in polished kid-friendly 3D-cartoon game art. Exclude text, logos, UI, cards, borders, people, chickens, characters, creatures, signs, coins, buildings, castles, and watermarks. |
| `apps/website/public/brand/parents/parents-content-background.png` | `1254 x 1254` repeatable Parents-page background derived from the generated master. Wrap the master by half its width and height, repair only the new center wrap lines while preserving the outer border, then composite the original wrapped outer 250-pixel band back over the repaired center with a linear inward feather. Verify a `2 x 2` repeat has no hard horizontal or vertical seam before use. |
| `apps/website/public/brand/parents/parents-hero-background-source.png` | `1585 x 992` generated Parents hero scenery master. Recreate with the built-in image generator using the previous homepage hero only for wide composition and negative-space guidance and `parents-content-background.png` as the authoritative visual reference. Draw open blue sky and dimensional clouds above matching blue-green mountains, crisp grass-topped warm-orange and slate cliffs, bright waterfalls, saturated foliage, vines, and tiny flowers. Keep the center readable and exclude text, logos, UI, cards, people, chickens, characters, creatures, slime, signs, clipboards, coins, castles, buildings, flags, ladders, crates, and watermarks. |
| `apps/website/public/brand/parents/parents-hero-background.png` | Optimized runtime copy of the Parents hero scenery master. The page overlays the bottom 180 pixels with the matching repeatable content tile, positioned at that tile's bottom edge and faded in from transparent; the content section then starts at the tile's top edge with the same centered `1254 x 1254` scale so the two regions join continuously. |
| `apps/website/public/brand/parents/parents-hero-cooper-source.png` | `1337 x 1176` transparent generation master for the friendly Parents hero Cooper. Recreate from the upper hero character in `brand/mock-parents.png`: upright, friendly rounded expression, goggles, cheerful open beak, large left-wing thumbs-up, patched lab coat, pens, `Cooper` badge, and right wing holding a tan clipboard reading `BIG IDEAS / BRIGHTER / KIDS` with a smile. Require genuine transparent alpha and exclude the scratched, frantic, tongue-out homepage pose. |
| `apps/website/public/brand/parents/parents-hero-cooper.png` | Runtime copy of the friendly Parents hero Cooper cutout. Preserve the genuine alpha channel and the complete thumb, clipboard, comb, and lower coat; do not reconstruct the clipboard in HTML or CSS. |
| `apps/website/public/brand/parents/parents-footer-background-source.png` | `2172 x 724` generated master for the Parents footer. Recreate with the built-in image generator using the footer crop of `brand/mock-parents.png` only for composition and the Parents content/hero backgrounds for authoritative style. Draw an ultra-wide, shallow, saturated 3D-cartoon landscape with open pale-blue sky in the center, a sunny clearing and warm stone path, lush flower-covered cliffs at the edges, a distant pink-roofed castle on the right, and bright waterfalls. Exclude characters, chickens, text, signs, buttons, UI, coins, logos, and borders. |
| `apps/website/public/brand/parents/parents-footer-background.png` | Runtime copy of the Parents footer landscape master. Render it as a cover image focused near the lower-middle of the scene. Bridge the content/footer boundary with the repeatable Parents content tile: fade the tile's bottom edge into the end of the content section, then start the footer with the tile's top edge at the identical centered `1254 x 1254` scale and fade it into the footer art. This preserves the tile's verified wrap across the boundary while the footer scenery takes over below. |
| `apps/website/public/brand/parents/parents-footer-background-with-signs-source.png` | `2172 x 724` generated footer master derived from `parents-footer-background.png` with both mockup signs baked into the scenery. The left four-plank sign reads `PLAY / CREATE / LEARN / GROW` with a smile; the right three-plank sign reads `BIG IDEAS / BRIGHTER / TOMORROWS` with a smile. Keep both at the far edges and vertically centered so a shallow cover crop retains them while leaving the middle clear. |
| `apps/website/public/brand/parents/parents-footer-background-with-signs.png` | Runtime footer background with both wooden signs painted directly into the raster image. Use it with the same repeat-tile boundary bridge as the sign-free footer master; do not duplicate either sign as HTML or CSS. |
| `apps/website/public/brand/lab-names/01.png` | `512 x 512` transparent bust of a chicken scientist in a teal lab coat, round glasses, and yellow bow tie. Recreate with the built-in image generator using `apps/website/public/brand/homepage/cooper-hero-fixed.png` only as a 3D-cartoon style reference. This is not Cooper: smaller round glasses, teal coat, yellow bow tie, pocket pens. Prompt for a centered head-and-shoulders portrait on solid `#00ff00`, no text, checkerboard, scenery, or drop shadow. Chroma-key the green, trim, fit within `470 x 470`, center on a transparent `512 x 512` canvas, and verify `opaque=false`. |
| `apps/website/public/brand/lab-names/02.png` | `512 x 512` transparent bust of a zebra in a navy captain hat with a gold anchor and a red capelet. Same generation and chroma-key process as `01.png`. |
| `apps/website/public/brand/lab-names/03.png` | `512 x 512` transparent bust of a round cartoon robot with a spring antenna, visor eyes, and a white lab coat. Same process as `01.png`. Exclude all letters and name badges. |
| `apps/website/public/brand/lab-names/04.png` | `512 x 512` transparent frog wizard in a purple hat with a gold star and a purple robe with a moon clasp. Generate on solid `#ff00ff` instead of green so the lime frog body is not keyed away; otherwise use the same trim-and-center process as `01.png`. |
| `apps/website/public/brand/lab-names/05.png` | `512 x 512` transparent orange tabby cat pirate with a black tricorn, gold skull-and-crossbones, and a red-and-white scarf. Same process as `01.png`. |
| `apps/website/public/brand/lab-names/06.png` | `512 x 512` transparent cream bunny superhero with a red eye-mask, blue cape, and a star emblem with no letters. Same process as `01.png`. |
| `apps/website/public/brand/lab-names/07.png` | `512 x 512` transparent female brown owl professor with gold glasses, a mortarboard with a pink bow, gold earrings, and a burgundy sweater. Same process as `01.png`. |
| `apps/website/public/brand/lab-names/08.png` | `512 x 512` transparent orange-red dragon in science goggles and a white lab coat, with small wings and horns. Same process as `01.png`. |

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
