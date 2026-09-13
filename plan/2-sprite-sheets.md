# Sprite Sheet Production Plan

## Purpose

This document defines every sprite sheet required to support the four MVP game types and five launch themes described in `GAME.md`:

- Treasure Rush
- Maze Escape
- Tag Chase
- Survival Arena
- Pirates
- Ninjas
- Dragons
- Space
- Haunted

Every sheet must follow the technical rules in `plan/1-lock-down-contracts.md`. Game rules, behaviors, collision, names, scores, health bars, and multiplayer markers remain runtime data. They must not be baked into themed artwork.

## Production sets

Assets should be generated and approved in the following order. Do not proceed to a later set until the current set slices and renders correctly in the runtime.

### Set 1: canonical validation set

Generate now:

1. `neutral_human_01.png` — canonical player character
2. `neutral_zombie_01.png` — canonical enemy character

These are neutral fallback characters with no world-theme costume. Together they prove that player and enemy art can share the same character contract. They are also valid final fallback assets when an exact body-and-theme combination is unavailable.

### Set 2: remaining neutral body fallbacks

Generate after Set 1 passes validation:

1. `neutral_ghost_01.png`
2. `neutral_dragon_01.png`
3. `neutral_robot_01.png`

Set 1 and Set 2 together provide one fallback for every supported creature body: human, ghost, zombie, dragon, and robot.

### Set 3: Priority 0 showcase characters

Generate the combinations needed for the hackathon demonstration:

1. `pirate_human_01.png`
2. `pirate_ghost_01.png`
3. `ninja_human_01.png`
4. `ninja_zombie_01.png`
5. `dragon_dragon_01.png`
6. `dragon_human_01.png` — knight or wizard treatment
7. `space_robot_01.png`
8. `space_human_01.png` — astronaut or alien treatment

This set demonstrates that world theme and creature body are independent dimensions.

### Cooper mascot set

After Set 3 is approved, produce Cooper as a playable mascot without expanding
the general theme/body matrix:

1. `neutral_cooper_01.png` — canonical Cooper in his rumpled lab coat
2. `dragon_cooper_01.png` — blue-and-gold dragon-rider lab treatment
3. `haunted_cooper_01.png` — playful, non-gory zombie-world treatment
4. `pirate_cooper_01.png` — navy pirate coat and red sash
5. `space_cooper_01.png` — compact astronaut lab suit

All five sheets use `body: chicken`, retain Cooper's goggles, white feathers,
red comb and wattle, orange beak and feet, lab-coat identity, and the canonical
20-frame gait. `haunted_cooper_01` uses the existing Haunted theme identifier
for the requested zombie world; Cooper remains living and recognizable rather
than becoming a generic zombie. Cooper does not use human skin-tone or
hair-color masks.

### Girl character set

The reusable girl character keeps one identity and locomotion cycle across the
requested neutral and campaign-theme treatments:

1. `neutral_girl_01.png` — practical neutral adventurer with a short low ponytail
2. `dragon_girl_01.png` — unarmed young knight in silver-blue armor and berry-purple tunic
3. `space_girl_01.png` — compact astronaut suit with an open helmet
4. `haunted_girl_01.png` — living haunted-world explorer with a short close-held cape

All four recipes declare `body: "human"` and include independent skin-tone and
hair-color masks. The three themed sheets use `neutral_girl_01` as their parent
identity and preserve its exact 20-frame gait.

### Set 4: complete theme and body matrix

The complete reusable character library contains one sheet for each theme/body combination:

#### Pirates

- `pirate_human_01.png`
- `pirate_ghost_01.png`
- `pirate_zombie_01.png`
- `pirate_dragon_01.png`
- `pirate_robot_01.png`

#### Ninjas

- `ninja_human_01.png`
- `ninja_ghost_01.png`
- `ninja_zombie_01.png`
- `ninja_dragon_01.png`
- `ninja_robot_01.png`

#### Dragons

- `dragon_human_01.png`
- `dragon_ghost_01.png`
- `dragon_zombie_01.png`
- `dragon_dragon_01.png`
- `dragon_robot_01.png`

#### Space

- `space_human_01.png`
- `space_ghost_01.png`
- `space_zombie_01.png`
- `space_dragon_01.png`
- `space_robot_01.png`

#### Haunted

- `haunted_human_01.png`
- `haunted_ghost_01.png`
- `haunted_zombie_01.png`
- `haunted_dragon_01.png`
- `haunted_robot_01.png`

Set 4 includes the Set 3 characters; do not generate duplicates. Completing the entire matrix is optional for the hackathon and should not delay the runtime or network play.

## Character sheet contract

Each character is a separate transparent PNG containing a `5 × 4` frame grid.

```text
             Column 0   Column 1   Column 2   Column 3   Column 4
Row 0 Down   Idle       Walk 1     Walk 2     Walk 3     Walk 4
Row 1 Left   Idle       Walk 1     Walk 2     Walk 3     Walk 4
Row 2 Right  Idle       Walk 1     Walk 2     Walk 3     Walk 4
Row 3 Up     Idle       Walk 1     Walk 2     Walk 3     Walk 4
```

Final runtime dimensions:

- Frame: `64 × 64` pixels
- Sheet: `320 × 256` pixels
- Anchor: `(32, 56)` in every frame
- Animation speed: 8 frames per second
- Background: fully transparent
- Export: lossless RGBA PNG

The walking columns have fixed locomotion meaning in every direction:

```text
Column 1  Contact A: first foot forward, opposite foot back
Column 2  Passing A: opposite foot passes the planted foot
Column 3  Contact B: opposite foot forward, first foot back
Column 4  Passing B: first foot passes the planted foot
```

For left and right rows, the forward/back separation of the two feet must be
obvious in silhouette and must reverse between Contact A and Contact B. For the
up row, both feet must still alternate visibly from behind. Arm swing and body
bob support the gait but do not count as leg animation by themselves. Bodies
without feet must show an equally clear four-phase locomotion cycle through
their tail, wisp, hover shape, or other body-appropriate feature.

The generated source may be larger, but it must preserve the exact grid and be normalized to the runtime dimensions before acceptance.

Do not normalize an AI-generated source sheet by resizing the entire canvas and assuming its visual spacing forms an exact grid. Image generators may distribute poses with balanced outer margins rather than mathematical cell boundaries. Extract each pose from its detected opaque bounds, then place it into a real `64 × 64` cell around the shared body pivot and foot baseline before assembling the final sheet.

Standard character sheets are role-neutral. The same `pirate_ghost_01.png` may
be selected for a player, enemy, or NPC presentation. A large boss instead uses
the dedicated contract below so its scale and grand defeat remain validated.

### Platformer boss sheet contract

A Platformer boss recipe declares `kind: "boss"`, `runtime:
"platformer_v1"`, `roles: ["boss"]`, and `collisionProfile:
"boss_large_v1"`. Its locomotion sheet is a `5 × 2` grid of `128 × 128`
frames, for a final `640 × 256` RGBA PNG:

```text
             Idle   Walk 1   Walk 2   Walk 3   Walk 4
Left
Right
```

The anchor is `(64, 120)` and the default animation rate is eight frames per
second. Each frame can be constructed from a `2 × 2` arrangement of canonical
`64 × 64` art modules, but it is exported and validated as one frame.

Every boss must also declare a non-looping `defeated` event sheet. That event is
an `8 × 2` grid of `128 × 128` frames (`1024 × 256` total), anchored at
`(64, 120)`, with eight left-facing frames followed by eight right-facing
frames. Its exact frame labels are `defeated_left_1` through
`defeated_left_8`, then `defeated_right_1` through `defeated_right_8`. The
event plays once at ten frames per second, and the level waits for all eight
direction-appropriate frames to finish before completing.

### Human appearance companion masks

Every human character sheet has one same-size companion mask at
`sprite-masks/<asset-id>-skin-mask.png`. The mask is not a second animation and
does not alter frame geometry. Its transparent pixels mean "leave the base art
unchanged"; opaque grayscale values `0`, `85`, `170`, and `255` select the
shadow, midtone, light, and highlight entries from a runtime tone ramp.

The shared `skin_tones_v1` palette provides six stable user-selectable ramps.
Renderers recolor and cache the complete sheet once for each
`asset ID + skin tone ID` combination, then slice and animate that cached sheet
normally. Do not apply a flat blend mode or full-sprite color overlay.

Every human sheet also has an independent
`sprite-masks/<asset-id>-hair-mask.png` using the same four indexed shades. The
shared `hair_colors_v1` palette changes hair without changing skin, clothing,
headwear, or outlines. Skin and hair masks must not overlap. Renderers cache by
`asset ID + skin tone ID + hair color ID`.

Current and future human sheets covered by this rule include:

- `neutral_human_01`
- `neutral_girl_01`
- `pirate_human_01`
- `ninja_human_01`
- `dragon_human_01`
- `space_human_01`
- `dragon_girl_01`
- `space_girl_01`
- `haunted_girl_01`
- Every later Set 4 human combination

Do not generate or approve another human character until both companion masks
can be previewed with multiple light and dark skin ramps and multiple hair
colors in the Sprite Viewer screen of `game_editor`.

## Set 5: per-theme gameplay atlases

Each theme needs one `8 × 5` atlas named `<theme>_gameplay_atlas_01.png`.

Final runtime dimensions:

- Frame: `64 × 64` pixels
- Atlas: `512 × 320` pixels
- Background: fully transparent
- Export: lossless RGBA PNG

Use this exact slot layout:

```text
Row 0: floor_a, floor_b, wall_00, wall_01, wall_02, wall_03, wall_04, wall_05
Row 1: wall_06, wall_07, wall_08, wall_09, wall_10, wall_11, wall_12, wall_13
Row 2: wall_14, wall_15, door_closed, door_open, exit, hazard, solid_0, solid_1
Row 3: solid_2, decor_0, decor_1, decor_2, decor_3, collectible, key, health
Row 4: speed, shield, weapon, projectile, impact_0, impact_1, impact_2, unused
```

Required atlases:

1. `pirates_gameplay_atlas_01.png`
2. `ninjas_gameplay_atlas_01.png`
3. `dragons_gameplay_atlas_01.png`
4. `space_gameplay_atlas_01.png`
5. `haunted_gameplay_atlas_01.png`

### Pirate atlas treatment

- Floors: sand and ship planks
- Walls: stone fort or heavy ship structure
- Doors and exits: fort gate and gangplank
- Solids: barrel, crate, cannon
- Decorations: rope coil, anchor, flag, treasure pile
- Gameplay items: coin, treasure key, fruit, wind bottle, shield charm, blaster pickup, cannonball

### Ninja atlas treatment

- Floors: tatami and stone path
- Walls: dojo wood or garden boundary
- Doors and exits: sliding door and glowing temple gate
- Solids: crate, lantern, training dummy
- Decorations: bamboo, banner, stone lantern, flower pot
- Gameplay items: scroll, key charm, rice ball, speed charm, shield seal, weapon pickup, throwing star

### Dragon atlas treatment

- Floors: castle stone and volcanic ground
- Walls: dungeon stone or cave rock
- Doors and exits: castle gate and cave opening
- Solids: rock, brazier, pillar
- Decorations: dragon egg, banner, bones, treasure pile
- Gameplay items: gem, ornate key, potion, wing boost, magic shield, wand pickup, fireball

### Space atlas treatment

- Floors: station panel and alien ground
- Walls: station bulkhead or energy boundary
- Doors and exits: airlock and teleporter
- Solids: cargo crate, console, machinery
- Decorations: antenna, warning beacon, alien plant, cable coil
- Gameplay items: energy cell, access card, health capsule, jet boost, force field, blaster pickup, energy bolt

### Haunted atlas treatment

- Floors: graveyard dirt and mansion boards
- Walls: crypt stone or mansion wall
- Doors and exits: crypt door and magic portal

### Maze editor starter packs

The initial Maze Map Editor uses focused recipe-backed role assets rather than
requiring a complete gameplay atlas. It supports exactly four presentation
themes from the start: Green Hills (`neutral_green_hills`), Space (`space`),
Graveyard (`haunted_graveyard`), and Dragon World (`dragons_emberkeep`). Each
pack contains:

- `<theme>_maze_floor_01`: one static `64 x 64` top-down walkable tile.
- `<theme>_maze_wall_01`: a `4 x 4` sheet of `64 x 64` connected-wall frames in
  row-major NESW bitmask order (`N=1`, `E=2`, `S=4`, `W=8`).
- `<theme>_maze_obstacle_01`: one static `64 x 64` solid grey block themed with
  restrained world accents.
- `<theme>_maze_key_01`: one static `64 x 64` key pickup.
- `<theme>_maze_door_01`: a `2 x 2` sheet of `64 x 96` frames ordered closed,
  opening 1, opening 2, open; 6 FPS, play once, bottom-center anchor `(32, 88)`.

Only the door animates. MapSpec stores the selected pack as the semantic
`presentation.mazeThemeId`; it does not store colors or temporary sprite paths.

All four maze themes may additionally use `shared_hole_hazard_01`: one static
`64 x 64` transparent, neutral black-and-charcoal top-down pit. The sprite
contains no baked floor material so the selected theme remains visible around
it. Jumping over the hole is runtime behavior and is never inferred from its
pixels.
- Solids: tombstone, furniture, dead tree
- Decorations: candle, pumpkin, cobweb, bones
- Gameplay items: spirit orb, skeleton key, candy heart, spectral speed, ward shield, wand pickup, ghost bolt

## Set 6: shared effects sheet

Create `shared_effects_01.png` as an `8 × 4` transparent atlas.

```text
Row 0: pickup_0, pickup_1, pickup_2, pickup_3, damage_0, damage_1, damage_2, damage_3
Row 1: spawn_0, spawn_1, spawn_2, spawn_3, impact_0, impact_1, impact_2, impact_3
Row 2: victory_0, victory_1, victory_2, victory_3, victory_4, victory_5, victory_6, victory_7
Row 3: dust_0, dust_1, dust_2, dust_3, shield_0, shield_1, shield_2, shield_3
```

Final runtime dimensions:

- Frame: `64 × 64` pixels
- Sheet: `512 × 256` pixels
- Background: fully transparent

The shared effects must be visually neutral enough to work with every theme.

The Platformer Map Editor currently stages the `victory_*` sequence as the
standalone `shared_victory_burst_01` candidate: an eight-frame `4 × 2` sheet of
`64 × 64` frames. This narrow slice makes the semantic level-complete effect
configurable without producing the unrelated Set 6 effects early. It remains
compatible with the future atlas and must stay in `sprite-build/` until it is
approved through the Sprite Viewer.

The editor also stages `shared_game_over_01` as a four-frame `2 × 2` sheet of
`64 × 64` composable sprites: `GAME`, `OVER`, and mirrored impact-and-ember
accents. The runtime displays all four frames together when the player loses
the last life. This shared presentation effect remains gameplay-neutral and
must stay in `sprite-build/` until approved through the Sprite Viewer.

## Set 7: shared multiplayer overlays

Create `shared_multiplayer_overlays_01.png` as an `8 × 2` transparent atlas.

```text
Row 0: player_ring_1, player_ring_2, player_ring_3, player_ring_4, it_marker, target_marker, exit_arrow, key_marker
Row 1: health_full, health_empty, disconnected, reconnecting, winner_crown, team_marker, speaking_unused, unused
```

Final runtime dimensions:

- Frame: `64 × 64` pixels
- Sheet: `512 × 128` pixels
- Background: fully transparent

Player rings, names, health, and tag state are runtime overlays. They must never be included in character sheets.

## Coverage by game type

### Treasure Rush

Uses:

- Any character sheet
- Theme gameplay atlas: floors, walls, solids, decorations, collectible, speed, and shield
- Shared pickup and victory effects
- Shared multiplayer overlays

### Maze Escape

Uses:

- Any character sheet
- Theme gameplay atlas: floors, walls, door, exit, hazard, solids, decorations, key, health, and speed
- Shared pickup, damage, and victory effects
- Shared multiplayer overlays

### Tag Chase

Uses:

- Any character sheet
- Theme gameplay atlas: floors, walls, solids, decorations, speed, and shield
- Shared spawn and dust effects
- Shared player rings and `it` marker

### Survival Arena

Uses:

- Any character sheet for players and enemies
- Theme gameplay atlas: floors, walls, solids, decorations, health, shield, weapon, projectile, and projectile impact
- Shared damage, spawn, impact, dust, and shield effects
- Shared multiplayer overlays

No game type requires a game-specific character sheet. This is what allows pirate ghosts, ninja zombies, space dragons, and other combinations to work in every game.

## Naming and metadata

Use lowercase snake-case filenames and stable IDs without file extensions:

```text
File: pirate_ghost_01.png
ID:   pirate_ghost_01
```

Every generated sheet must eventually receive a matching manifest under the asset registry. Character manifests record theme, body, frame geometry, directions, animations, anchor, and collision profile. Atlas manifests record the exact meaning of every numbered slot.

## Acceptance checklist

A sprite sheet is accepted only when:

- It has the required pixel dimensions.
- It uses RGBA PNG with a transparent background.
- Every frame stays inside its cell.
- All character feet share anchor `(32, 56)`.
- The four direction rows are unambiguous.
- Every grounded direction shows a complete alternating four-phase gait.
- Contact A and Contact B reverse which foot is forward; side rows do not reuse
  one leg-forward silhouette across all four walk frames.
- Walk frames show the same character and costume.
- Character proportions and palette do not drift between frames.
- Human assets include a valid four-shade skin mask, and changing tone affects
  exposed skin only in every frame.
- No labels, grid lines, shadows, UI, or scenery are baked into the sheet.
- The sheet slices correctly in the runtime.
- The asset metadata passes schema validation.
- A human has visually reviewed and approved the animation in the `game_editor` Sprite Viewer.

## Current generation scope

Sets 1 through 3 have been corrected and approved through the `game_editor` Sprite Viewer at
the canonical `64 × 64` character geometry. The five-sheet Cooper mascot set
has also passed the pipeline and been approved in the viewer:

- `sprites/neutral_cooper_01-source.png` -> `sprite-build/neutral_cooper_01.png`
- `sprites/dragon_cooper_01-source.png` -> `sprite-build/dragon_cooper_01.png`
- `sprites/haunted_cooper_01-source.png` -> `sprite-build/haunted_cooper_01.png`
- `sprites/pirate_cooper_01-source.png` -> `sprite-build/pirate_cooper_01.png`
- `sprites/space_cooper_01-source.png` -> `sprite-build/space_cooper_01.png`

The current production scope is the Space skin for the Platformer Map Editor's
seven semantic block types plus two HUD icons:

- `sprites/space_platformer_ground_01-source.png` -> `sprite-build/space_platformer_ground_01.png`
- `sprites/space_platformer_platform_01-source.png` -> `sprite-build/space_platformer_platform_01.png`
- `sprites/space_platformer_obstacle_01-source.png` -> `sprite-build/space_platformer_obstacle_01.png`
- `sprites/space_platformer_hazard_01-source.png` -> `sprite-build/space_platformer_hazard_01.png`
- `sprites/space_platformer_coin_01-source.png` -> `sprite-build/space_platformer_coin_01.png`
- `sprites/space_platformer_coin_01_collected-source.png` -> `sprite-build/space_platformer_coin_01_collected.png`
- `sprites/space_platformer_checkpoint_01-source.png` -> `sprite-build/space_platformer_checkpoint_01.png`
- `sprites/space_platformer_checkpoint_01_activated-source.png` -> `sprite-build/space_platformer_checkpoint_01_activated.png`
- `sprites/space_platformer_goal_01-source.png` -> `sprite-build/space_platformer_goal_01.png`
- `sprites/space_platformer_goal_01_level_complete-source.png` -> `sprite-build/space_platformer_goal_01_level_complete.png`
- `sprites/space_platformer_hud_lives_01-source.png` -> `sprite-build/space_platformer_hud_lives_01.png`
- `sprites/space_platformer_hud_coins_01-source.png` -> `sprite-build/space_platformer_hud_coins_01.png`

Ground, platform, and obstacle use one static `64 × 64` frame. Coin, hazard,
and checkpoint use four-frame `2 × 2` sheets of `64 × 64` frames: the coin rotates at 4 FPS,
the hazard's flames cycle at 8 FPS, and the checkpoint flag waves at 4 FPS. The
goal uses a four-frame `2 × 2` sheet of bottom-anchored `64 × 96` frames and
waves at 4 FPS, so it remains visibly larger without changing the MapSpec cell.
The coin recipe also declares a `collected` event sheet: a four-frame `2 × 2`
poof at 12 FPS that plays once. The checkpoint declares an `activated` event
sheet, and the goal declares a `level_complete` event sheet; both are four-frame
`2 × 2` animations at 10 FPS that play once and hold their final state. Event
keys map runtime state transitions to alternate art; collision detection,
collectible removal, checkpoint selection, and level completion remain gameplay
data.
The seven map sprites are side-view `platformer_v1` assets; their recipe metadata supplies the
visual slot while collision and behavior remain in the map data. All seven remain
staged in `sprite-build/` until the user approves them through the `game_editor`
Sprite Viewer. Do not begin another theme's platformer set before that review.

The two HUD assets are static `64 × 64` icon frames. The lives icon is Cooper's
Space-suit portrait and the coins icon is a compact front-facing treatment of
the approved Space coin. Counter numbers are runtime text and must never be
baked into either sprite. Their MapSpec entries store only fixed screen-space
layout inside `presentation.hud`; remaining lives and collected-coin state are
owned by gameplay. Both HUD icons remain staged until approved in the Sprite
Viewer.

### Platformer spring object set

Platform springs use a shared semantic `platform_spring` object and theme-specific
art packages:

- `sprites/ice_world_platformer_spring_01-source.png` -> `sprite-build/ice_world_platformer_spring_01.png`
- `sprites/haunted_graveyard_platformer_spring_01-source.png` -> `sprite-build/haunted_graveyard_platformer_spring_01.png`

Each default sheet is one expanded `64 × 64` frame with bottom-center anchor
`(32, 64)`. Each parent recipe also owns a `compressed` event sheet with four
`64 × 64` frames in a `2 × 2` layout: expanded, compressing, compressed, and
rebounding at 12 FPS, play once. The artwork never defines launch behavior;
MapSpec supplies bounded launch speed, and runtime physics preserves incoming
horizontal velocity so landing direction determines rebound direction. Both
packages remain staged until their default and event sheets are approved
atomically in the external Sprite Viewer.

### Platformer fly-by object set

Platformer fly-bys use a dedicated role-neutral `flying_object` sprite kind so
their compact side-view animation is not forced into the 20-frame walking
character contract:

- `sprites/neutral_green_hills_flying_cooper_01-source.png` -> `sprite-build/neutral_green_hills_flying_cooper_01.png`
- `sprites/haunted_flying_cooper_bat_01-source.png` -> `sprite-build/haunted_flying_cooper_bat_01.png`
- `sprites/dragons_emberkeep_flying_fireball_01-source.png` -> `sprite-build/dragons_emberkeep_flying_fireball_01.png`

Each recipe uses `runtime: "platformer_v1"`, `visualSlot: "flying_object"`, a
four-frame `2 × 2` sheet of `64 × 64` frames, center anchor `(32, 32)`, an
8 FPS loop, `nativeDirection: "left"`, and row-major frame labels
`fly_left_1` through `fly_left_4`. The frames are upstroke, level, downstroke,
and returning upstroke. Green Hills uses flying Cooper in his scientist coat;
Haunted uses the same Cooper identity in a playful bat-wing costume. Runtime
MotionSpec chooses the path and mirrors these left-facing frames only for a
future rightward route. Dragon World uses a separate large fireball with a
stable white-hot core and four rising/level/falling/returning flame-tail phases;
it is non-colliding presentation art, not the damaging combat projectile.
All three sheets pass the pipeline. Flying Cooper has been approved through the
Sprite Viewer; Bat-Costume Cooper and the Dragon World flying fireball remain
staged in `sprite-build/` until the user approves them through the same gate.

### Space combat event set

The first melee weapon is `short_sword_v1`. Its mechanics live under
`weapon-specs/`; its transparent weapon sprite remains separate from character
art. `space_cooper_01` and `space_human_01` each declare a four-frame left and
right `attack` event sheet that contains body motion only. The runtime layers
the sword from bounded per-frame attachment data.

`space_cooper_01`, `space_human_01`, `space_ghost_01`, and `space_robot_01`
each declare a four-frame left and right `defeated` event sheet. These sheets are
role-neutral: an enemy plays the same character artwork before removal that a
player plays before checkpoint respawn. Other characters retain the same combat
mechanics but use a no-animation fallback until compatible event sheets exist.

All seven new sheets and the sword sprite are recipe-backed staged candidates.
They must pass `tools/sprites.py process` and remain in `sprite-build/` until the
user approves each complete parent package in the Sprite Viewer.

### Platformer campaign boss set

The campaign uses one large boss package for each of its five boss themes:

- `sprites/neutral_green_hills_boss_01-source.png` -> `sprite-build/neutral_green_hills_boss_01.png`
- `sprites/neutral_green_hills_boss_01_defeated-source.png` -> `sprite-build/neutral_green_hills_boss_01_defeated.png`
- `sprites/space_boss_01-source.png` -> `sprite-build/space_boss_01.png`
- `sprites/space_boss_01_defeated-source.png` -> `sprite-build/space_boss_01_defeated.png`
- `sprites/haunted_boss_01-source.png` -> `sprite-build/haunted_boss_01.png`
- `sprites/haunted_boss_01_defeated-source.png` -> `sprite-build/haunted_boss_01_defeated.png`
- `sprites/dragons_emberkeep_boss_01-source.png` -> `sprite-build/dragons_emberkeep_boss_01.png`
- `sprites/dragons_emberkeep_boss_01_defeated-source.png` -> `sprite-build/dragons_emberkeep_boss_01_defeated.png`
- `sprites/ice_world_boss_01-source.png` -> `sprite-build/ice_world_boss_01.png`
- `sprites/ice_world_boss_01_defeated-source.png` -> `sprite-build/ice_world_boss_01_defeated.png`
- `sprites/ice_world_crystal_projectile_01-source.png` -> `sprite-build/ice_world_crystal_projectile_01.png`

Green Hills uses the Mossback Boar, Space uses the Orbital Sentinel, and
Haunted uses the Pumpkin Warden. Dragon/Emberkeep uses Cindermaw, a grounded
elder dragon with basalt armor and ember-lit cracks. Ice World uses the Glacier
Brute, a broad humanoid ice boss whose separate four-frame crystal projectile
rotates end over end while following the map-authored lobbed-projectile arc.
All five locomotion and `defeated` sheets pass the automated pipeline and have
clean reviewed contact sheets. The current parent packages are approved through
the external `game_editor` Sprite Viewer (`../../../game_editor` from this app);
future replacements remain staged until the user approves their animation
playback there. Health bars, hit counts, facing
behavior, attack range, and movement stay in game and map data rather than in
these images.

### Set 2 generation record

The Set 2 masters were generated with the built-in image generator using
`sprites/neutral_human_01-source.png` as a style and layout reference. The
original shared prompt required bright chunky pixel art, three-quarter top-down
perspective, a dark outline, genuine transparency, exactly 20 poses in a
5-column by 4-row grid, rows ordered down/left/right/up, idle then four
locomotion frames, consistent visual scale and bottom pivot, and no costume,
role cue, weapon, prop, label, grid, scenery, floor, shadow, glow field, UI, or
watermark. That wording was insufficient because it did not define the four
gait phases. Future prompts must explicitly require Contact A, Passing A,
Contact B, and Passing B in every direction.

Subject-specific prompt clauses were:

- Ghost: a friendly pale-cyan and cool-white ghost with a rounded expressive head, small spectral arms, compact attached wisp tail, and a hovering locomotion cycle.
- Dragon: a friendly compact green baby dragon on two short legs, with a cream belly, tiny folded wings, small horns, a short close-held tail, and visible feet.
- Robot: a friendly compact blue-gray robot with a rounded square head, cyan face lights, short articulated arms, sturdy two-part legs, and no insignia.

The first ghost and robot generations returned an opaque checkerboard even though genuine transparency was requested. Before normalization, a targeted built-in background-extraction edit removed only the checkerboard while preserving all 20 poses, their pixels, layout, spacing, scale, and framing. Alpha inspection then confirmed RGBA transparency for all three source masters. This is evidence that source alpha must be verified rather than trusted from the visual preview.

### Set 3 generation record

Set 3 was produced with the built-in image generator in identity-preserving edit mode. Each themed master used its approved neutral body master as the edit target and structural reference. The prompts changed only costume, palette, or panel treatment while locking the exact 20 poses, `5 × 4` direction grid, body category, proportions, visual scale, spacing, baseline, pixel-art style, and three-quarter top-down perspective.

The selected treatments are:

- Pirate human: navy coat, cream shirt, red sash, brown boots, and a soft tricorn hat.
- Pirate ghost: compact navy-and-gold coat, red sash, and a tricorn hat adapted to the spectral body.
- Ninja human: deep-indigo wrap outfit and open friendly hood.
- Ninja zombie: weathered deep-purple wrap outfit and open hood, with no gore or frightening details.
- Dragon-world dragon: ruby-red scales, golden-cream belly and horns, and dark-red wing membranes.
- Dragon-world human: unarmed young knight with silver-blue armor over a royal-blue tunic.
- Space robot: white and deep-navy shell panels with cyan lights and violet accents.
- Space human: white-and-blue astronaut suit with an open helmet that preserves the face and hair.

Seven of the eight first-pass Set 3 edits rendered a visible checkerboard instead of genuine transparency; the dragon did not. Each affected image received a targeted background-extraction edit before being saved as its source master. The pipeline then independently verified that all eight final masters contain real alpha transparency. This repeated failure confirms that alpha inspection and fail-closed normalization are mandatory for every future AI edit.

## Experimental non-player validation pack

Set 1 has been successfully imported and played back in Pixelorama. Before producing the full character matrix, the following haunted-theme assets will test non-character sprites with different frame dimensions and animation lengths.

### Haunted tombstone

- File: `sprites/haunted_tombstone_01.png`
- Type: static solid obstacle
- Frame size: `64 × 96`
- Layout: `1 × 1`
- Sheet size: `64 × 96`
- Anchor: bottom-center `(32, 88)`
- Animation: none
- Collision: separate `48 × 24` footprint at the base

The visible stone may occupy the upper portion of the frame, but collision only occurs around its base.

### Haunted spirit orb

- File: `sprites/haunted_spirit_orb_01.png`
- Type: collectible
- Frame size: `48 × 48`
- Layout: `2 × 2`
- Sheet size: `96 × 96`
- Anchor: center `(24, 24)`
- Animation order: left-to-right, then top-to-bottom
- Frames: four-frame glow and hover loop
- Playback: 8 FPS, looping
- Collision: separate `24 × 24` circular pickup area

### Haunted crypt door

- File: `sprites/haunted_crypt_door_01.png`
- Type: animated door
- Frame size: `64 × 96`
- Layout: `2 × 2`
- Sheet size: `128 × 192`
- Anchor: bottom-center `(32, 88)`
- Animation order: closed, opening 1, opening 2, open
- Playback: 6 FPS, play once and hold the final frame
- Collision: separate `64 × 24` footprint that is disabled when open

The door art must be self-contained and must not include the surrounding wall. This lets any map place it over the theme wall tiles.

### Haunted magic portal

- File: `sprites/haunted_magic_portal_01.png`
- Type: animated exit or goal
- Frame size: `128 × 128`
- Layout: `4 × 2`
- Sheet size: `512 × 256`
- Anchor: bottom-center `(64, 120)`
- Animation order: left-to-right across the first row, then the second row
- Frames: eight-frame swirling loop
- Playback: 10 FPS, looping
- Collision: separate `64 × 40` trigger area at the base

The portal is intentionally larger than one world tile. Its trigger, art bounds, and map placement remain separate.

### Experimental acceptance criteria

- Each final sheet uses the exact declared pixel dimensions and grid.
- Every frame has genuine alpha transparency.
- Animated subjects stay on one stable pivot with no visible playback jump.
- Normalize animated non-player frames around a stable structural envelope, not the outermost animated pixels. Door frames use the immobile stone frame, spirit orbs use a fixed core envelope, and portals use a fixed opening envelope. Flame tips, glow, sparks, and moving door panels may change inside that envelope without translating it.
- Glow and particles stay inside their frame boundaries.
- The source generation is preserved with a `-source.png` suffix.
- The runtime version is reconstructed from detected subject bounds; do not assume the generated source uses exact cell spacing.
- Static, looping, and play-once assets play correctly in the `game_editor` Sprite Viewer and can optionally be imported into Pixelorama for secondary inspection.

The alignment-corrected versions have been rebuilt at the larger contract sizes and promoted to their suffix-free runtime filenames. The former 32px `-v2` candidates are obsolete and must not be used.

## Automated normalization and validation

All future sprite production must use `tools/sprites.py` and a versioned JSON recipe under `sprite-specs/`. This makes the mechanical parts of sprite preparation deterministic while retaining human review for art direction and animation quality.

The pipeline is:

```text
generated -source.png
  -> detect the expected primary subjects
  -> assign subjects to declared rows and columns
  -> extract each frame from its detected region
  -> resize and align around the declared stable landmark
  -> assemble an exact runtime grid
  -> validate geometry and transparency
  -> create a contact sheet, animation preview, and JSON report
  -> human review and recorded approval in the game_editor Sprite Viewer
  -> explicit promotion to the suffix-free runtime filename
```

The generated canvas is never resized as one sheet. Subject detection uses alpha-connected components and fails if it cannot find an unambiguous primary subject for every declared cell. Nearby glow and particles are retained from the subject's assigned region, but they do not determine the stable pivot.

### Commands

Install the one image dependency if the environment does not already provide it:

```bash
python3 -m pip install -r requirements-sprites.txt
```

Process one sprite into staging:

```bash
python3 tools/sprites.py process sprite-specs/haunted_magic_portal_01.json
```

Process every recipe into staging:

```bash
python3 tools/sprites.py process-all
```

Validate the current suffix-free runtime files without changing them:

```bash
python3 tools/sprites.py validate
```

Normalization-only mode is available for debugging:

```bash
python3 tools/sprites.py normalize sprite-specs/haunted_magic_portal_01.json
```

By default, reconstructed PNGs are written to `sprite-build/`. Reports are written to `sprite-reports/<asset-id>/`. A report contains the detected source regions, placements, measured frame bounds, landmark locations, errors, warnings, and links to the generated previews.

Only after the staged sprite passes the automated checks and the user approves playback in the `game_editor` Sprite Viewer should it replace the runtime asset. The viewer invokes this promotion command; agents should not bypass its recorded approval flow:

```bash
python3 tools/sprites.py process sprite-specs/haunted_magic_portal_01.json --replace
```

`--replace` is intentionally explicit. A normal or batch run must not overwrite approved art.

The `game_editor` Sprite Viewer also owns the revision loop. **Request changes** starts the installed Codex CLI using the user's existing Codex login, supplies the precise candidate and an immutable cloned source image as visual inputs, includes the selected frame and sequence, and streams concise progress events such as **Thinking**, **Editing**, and **Validating**. The revision directory is the agent's only writable project workspace, and no separate API key is required. Raw reasoning is never displayed. The server—not the agent—runs the final deterministic pipeline. A failed or unchanged result stays unapproved; a passing replacement returns to `sprite-build/` for human review.

### Recipe contract

Each `sprite-specs/<asset-id>.json` recipe declares:

- The canonical asset ID, `<asset-id>-source.png` input, and `<asset-id>.png` runtime output.
- The expected source rows and columns.
- The exact runtime sheet rows, columns, and frame size.
- Row-major semantic `frameLabels` in playback order.
- Alpha thresholds and ambiguity limits for subject detection.
- The content box, gameplay anchor, alignment mode, and resize policy.
- Optional integer `alignment.frameOffsets`, with one `{ "x", "y" }` entry per
  frame, for reviewed pixel-space placement corrections applied after automatic
  alignment.
- Animation speed and looping behavior.
- Validation tolerances and preview scale.
- Optional `eventSheets`, keyed by lowercase snake-case runtime event names.
  Each event entry is a complete nested sheet contract with its own source,
  output, layout, frame labels, alignment, animation, validation, and preview.

The source and output filenames must match the asset ID. The source and output frame counts must match, and `frameLabels` must contain one label per frame.
Event sheet files use `<asset-id>_<event>-source.png` and
`<asset-id>_<event>.png`. Processing a parent recipe processes its default and
event sheets as one package. `--replace` promotes none of them unless every
sheet passes, and the Sprite Viewer approval receipt records every promoted
event sheet. Event keys select artwork only; they never define when the runtime
raises the event.

For `kind: "character"`, the tool additionally enforces the project-wide `top_down_v1` contract: `64 × 64` frames, a `5 × 4` grid, and anchor `(32, 56)`. A stale 32px character recipe fails before normalization or promotion.

### Alignment modes

- `bottom_center`: characters, tombstones, furniture, and other grounded objects. Every extracted subject shares the configured bottom-center anchor and one common scale when `contain_shared` is used.
- `fixed_envelope`: doors and rigid structures. Every frame is normalized into the same width and height before being placed on the bottom-center anchor.
- `center`: pickups whose opaque center is the stable visual pivot.
- `bright_core`: glowing collectibles such as spirit orbs. The bright inner core, not moving flame tips or satellites, is aligned to a fixed target.
- `dark_opening`: portals. The dark central opening, not the rotating rim or particles, is aligned to a fixed target.
- `manual`: reviewed per-frame placements for an exceptional asset whose stable pivot cannot be detected reliably. Manual placement is a recorded fallback, not permission to eyeball an unrepeatable export.

The Sprite Viewer may record sparse human corrections as a complete
`alignment.frameOffsets` list. These offsets are deterministic recipe data, not
browser-only transforms: the pipeline applies them after the selected alignment
mode and includes them in reports. Automatic alignment still rejects clipping,
but an explicit viewer-authored offset may intentionally crop artwork at a frame
edge; the offset must leave some visible artwork inside the frame.
Saving an offset always creates a staged candidate and never promotes the
runtime asset. For human sprites, the pipeline stages and validates newly
aligned skin and hair masks with the candidate, then promotes all three only
through **Approve sprite**.

Use `contain_shared` for characters so animation poses keep one scale, `contain_each` for a single static object, and `stretch_each` only when the recipe deliberately enforces a fixed structural envelope.

### Automated guarantees

The validator exits nonzero when it finds:

- A source master without a genuine alpha channel or fully transparent background pixels; a baked checkerboard is explicitly rejected.
- A missing, unreadable, non-PNG, or non-RGBA asset.
- A noncanonical filename or invalid asset ID.
- The wrong sheet dimensions or frame count.
- A fully opaque background, fully transparent sheet, or empty frame.
- An ambiguous or missing generated subject.
- A frame placement that would clip outside its cell.
- Baseline, rigid-envelope, bright-core, or dark-opening drift beyond its recipe tolerance.
- A project path that escapes the repository.

Automated checks cannot determine whether a sprite is attractive, whether a walk cycle reads naturally, whether directions are artistically correct, or whether animation deformations are intentional. The enlarged contact sheet, animated playback in the `game_editor` Sprite Viewer, and recorded human approval remain mandatory. Pixelorama is optional for deeper inspection or editing.

If connected-component detection is genuinely ambiguous, a reviewer may add exact `[left, top, right, bottom]` boxes as `sourceLayout.regions`. The pipeline still extracts, aligns, assembles, and validates those recorded regions deterministically. Never reduce an ambiguity threshold merely to force a passing run.
