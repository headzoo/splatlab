# Splat Lab! Game and Asset Plan

## Product strategy

Splat Lab! is a composable game-building platform. The product needs to
demonstrate that a child can create a playable game quickly by choosing a game
type, world theme, characters, and a few rule options, while the implementation
stays inside trusted engines and structured content.

The strongest long-term scope is **a small set of reusable runtimes with
interchangeable rulesets**, rather than many unrelated engines. The first two
runtime families should be:

```text
top_down_v1   -> maze, treasure, tag, arena, and adventure-style games
platformer_v1 -> side-scrolling running, jumping, collectibles, and goals
```

Each runtime has its own movement, collision, camera, map interpretation, and
networking details, but they should share the same builder, asset registry,
`GameSpec`, `MapSpec`, room/session boundary, and theme-selection model.

Developer map tooling opens and atomically saves validated `MapSpec` JSON files
inside the project `maps/` directory. Browser-local autosave is draft recovery,
not a replacement for writing the project map file.

The top-down runtime remains the broadest reusable engine. It allows many game
types to share:

- Four-direction player movement
- Top-down rendering and camera behavior
- Tile and shape collision
- Player spawn points
- Collectibles and pickups
- Health, score, and timers
- Simple enemy behaviors
- Projectiles
- Multiplayer rooms and state synchronization
- The same sprites, tiles, effects, and animations

In the product UI these rulesets can be presented as different **game types**.
During HackYard, Maze should use `top_down_v1` and the narrow Platformer demo
should use `platformer_v1`.

The platformer runtime should stay deliberately narrow at first: horizontal
movement, gravity, grounded jumping, static collision, collectibles, hazards,
checkpoints, and goals. It should not absorb top-down rules, and top-down code
should not be distorted to simulate side-scrolling physics.

The HackYard plan is documented separately in [`HACKYARD.md`](./HACKYARD.md).
That document controls the two-day delivery scope when it differs from this
larger product plan.

## Recommended MVP game types

### 1. Treasure Rush

**Player promise:** Collect the most treasure before time runs out.

**Core rules:**

1. Players spawn at defined locations.
2. Collectibles are distributed around the map.
3. Touching a collectible awards points and removes it.
4. A removed collectible may respawn after a configured delay.
5. The player with the highest score when the timer ends wins.
6. Ties are allowed for the MVP.

**Required entities:**

- Players
- Collectibles
- Solid obstacles
- Spawn points
- Optional speed pickups

**Networked state:**

- Player position and facing direction
- Collectible availability
- Authoritative collectible claims
- Player scores
- Match timer
- Match result

**Useful configuration:**

```json
{
  "durationSec": 90,
  "collectibleCount": 20,
  "collectibleValue": 1,
  "respawnDelaySec": 5,
  "winCondition": "highest_score"
}
```

Treasure Rush should be implemented first. It is simple, naturally multiplayer, visually easy to understand, and exercises most of the reusable runtime.

### 2. Maze Escape

**Player promise:** Find the key and reach the exit before everyone else, or work together to escape.

**Core rules:**

1. Players spawn inside a maze.
2. Walls block movement.
3. One or more keys are placed in the maze.
4. A key unlocks a matching door or the final exit.
5. In race mode, the first player to reach the unlocked exit wins.
6. In cooperative mode, the game is won when every player escapes.
7. An optional timer can cause the players to lose when it reaches zero.
8. A character may jump over one hazard cell when the cell immediately beyond
   it is free walkable ground; blocked landings and diagonal jumps are invalid.

**Required entities:**

- Players
- Wall tiles
- Keys
- Doors
- Exit zone
- Optional hazards or enemies

**Networked state:**

- Player position and facing direction
- Key ownership or collected state
- Door state
- Exit state
- Finish order
- Match timer and result

**Useful configuration:**

```json
{
  "mode": "race",
  "keyCount": 1,
  "doorCount": 1,
  "durationSec": 120,
  "winCondition": "first_to_exit"
}
```

### 3. Tag Chase

**Player promise:** Chase your friends or escape from the player who is It.

**Core rules:**

1. One player begins as `it`.
2. When that player touches another player, the tagged player becomes `it`.
3. A short cooldown prevents an immediate tag-back.
4. The game records how long each player spends as `it`.
5. The player with the least time as `it` when the timer ends wins.

**Required entities:**

- Players
- Solid obstacles
- Spawn points
- Optional speed or shield pickups
- A visible marker for the player who is `it`

**Networked state:**

- Player position and facing direction
- Authoritative tag events
- Current `it` player
- Tag cooldown
- Time-as-`it` totals
- Match timer and result

**Useful configuration:**

```json
{
  "durationSec": 90,
  "tagCooldownMs": 1500,
  "speedPickupCount": 2,
  "winCondition": "least_time_as_it"
}
```

### 4. Survival Arena

**Player promise:** Survive a swarm of enemies with your friends.

**Core rules:**

1. Players spawn with a configured amount of health.
2. Enemies spawn in one or more waves.
3. Enemies use a small set of trusted behaviors such as chasing or shooting.
4. Enemy contact or projectiles reduce player health.
5. Players may use a predefined weapon.
6. The players win by surviving the timer or clearing the configured waves.
7. The players lose if every player is defeated.

**Required entities:**

- Players
- Enemies
- Health pickups
- Projectiles
- Solid obstacles
- Enemy spawn points
- Optional weapon pickups

**Networked state:**

- Player position, facing direction, health, and alive state
- Server-owned enemy positions and state
- Projectile creation and impacts
- Pickup availability
- Wave and timer state
- Match result

**Useful configuration:**

```json
{
  "playerHealth": 3,
  "durationSec": 90,
  "enemyBehavior": "chaser",
  "enemyCount": 8,
  "weapon": "straight_projectile",
  "winCondition": "survive_timer"
}
```

Survival Arena has the greatest implementation and networking risk. It should only enter the hackathon demo after Treasure Rush and either Maze Escape or Tag Chase work reliably.

## Game types to postpone

### Full platformer

A full platformer should wait until the narrow `platformer_v1` runtime proves
itself. The later version can add one-way platforms, moving platforms, slopes,
side-view sprite sheets, enemies, combat, richer checkpoints, and authoritative
multiplayer reconciliation.

### Endless runner

Requires scrolling-world generation, speed progression, side-view animation, obstacle sequencing, and special multiplayer design to keep players in a shared race.

### Top-down adventure or RPG

Requires dialogue, quests, inventory, persistent world state, NPC behavior, and substantially more content. The top-down MVP runtime can eventually become the foundation for this engine.

### Tower defense, racing, and puzzle engines

These introduce different placement, pathfinding, vehicle, or puzzle semantics. They should become separate trusted engines later rather than being forced into the MVP runtime.

## Composition model

Game mechanics and visual identity must be modeled separately. A complete game should be assembled from independent dimensions:

```text
runtime
  + ruleset
  + physics spec revision
  + world theme
  + creature cast
  + character asset revision
  + entity roles
  + behaviors
  + map
  + match settings
```

For example:

```text
top_down_v1
  + maze_escape
  + pirates
  + ghosts
  + enemy
  + chaser
  + maze_small_01
  + four-player race
```

This produces a pirate-themed maze containing ghost enemies. None of those choices requires a new engine or a special `PirateGhost` code type.

The physics spec is game-owned data, separate from both the runtime and the
visual theme. It exposes bounded, semantic settings such as speed, jump height,
and supported movement mode while inheriting collision and simulation safety
from the trusted runtime. This lets a builder agent revise game feel without
generating executable code or tying physics to a character asset.

Another combination could use the same engine and rules:

```text
top_down_v1
  + maze_escape
  + ninjas
  + zombies
  + enemy
  + chaser
  + maze_small_01
  + four-player race
```

The result is a ninja-themed maze containing zombies. Only asset selection changes.

## Keep theme, creature, role, and behavior separate

These concepts should never be collapsed into a single entity type.

- **Theme** describes the world and visual treatment: pirates, ninjas, dragons, space, haunted.
- **Creature or body** describes what the character is: human, ghost, zombie, dragon, robot.
- **Character asset revision** identifies either a curated sprite or an approved user-created derivative without changing its body or gameplay contract.
- **Role** describes how the entity is used: player, enemy, NPC, boss.
- **Behavior** describes what it does: player-controlled, wanderer, chaser, shooter.
- **Ruleset** decides what those actions mean for winning and losing.

Use structured values such as:

```json
{
  "theme": "pirates",
  "body": "ghost",
  "role": "enemy",
  "behavior": "chaser"
}
```

“Pirate ghost” is display copy assembled from these values, not a runtime class or database category.

## Launch themes

Five themes provide enough variety for a strong demo while keeping asset production bounded.

### 1. Pirates

- **Worlds:** island, ship deck, seaside fort
- **Floors and walls:** sand, wood planks, stone, water edges
- **Collectibles:** gold coins, treasure maps, gems, keys
- **Obstacles:** barrels, crates, cannons, rocks
- **Goal treatment:** treasure chest, gangplank, fort gate
- **Character cues:** bandanas, tricorn hats, hooks, striped clothing
- **Projectile treatment:** cannonball

### 2. Ninjas

- **Worlds:** dojo, moonlit village, bamboo garden
- **Floors and walls:** tatami, wood, stone paths, garden edges
- **Collectibles:** scrolls, throwing stars, charms, keys
- **Obstacles:** crates, lanterns, training dummies, bamboo
- **Goal treatment:** temple door, glowing gate
- **Character cues:** masks, headbands, scarves, wrapped clothing
- **Projectile treatment:** throwing star

### 3. Dragons

- **Worlds:** castle, volcanic cave, mountain ruins
- **Floors and walls:** stone, lava edges, dungeon blocks
- **Collectibles:** gems, dragon eggs, coins, keys
- **Obstacles:** rocks, braziers, pillars, treasure piles
- **Goal treatment:** castle gate, cave opening
- **Character cues:** horns, scales, wings, knight armor, wizard clothing
- **Projectile treatment:** fireball

### 4. Space

- **Worlds:** space station, alien planet, moon base
- **Floors and walls:** metal panels, alien ground, energy barriers
- **Collectibles:** energy cells, crystals, access cards, stars
- **Obstacles:** cargo crates, consoles, rocks, machinery
- **Goal treatment:** airlock, teleporter
- **Character cues:** helmets, antennae, jetpacks, robot parts
- **Projectile treatment:** energy bolt

### 5. Haunted

- **Worlds:** graveyard, mansion, haunted forest
- **Floors and walls:** dirt, mansion boards, stone, fog edges
- **Collectibles:** candles, candy, spirit orbs, keys
- **Obstacles:** tombstones, furniture, dead trees, pumpkins
- **Goal treatment:** crypt door, mansion entrance, magic portal
- **Character cues:** ragged cloth, eerie glow, chains, bones
- **Projectile treatment:** spirit orb

## Theme pack contract

Every theme should attempt to fill the same asset slots:

```json
{
  "id": "pirates",
  "kind": "theme_pack",
  "runtime": "top_down_v1",
  "tilesetIds": ["pirate_island_tiles_v1"],
  "mapIds": ["island_open_01", "ship_maze_01"],
  "collectibleSkins": {
    "common": "gold_coin",
    "key": "treasure_key",
    "health": "red_fruit",
    "boost": "wind_bottle"
  },
  "obstacleSkins": ["barrel", "crate", "cannon"],
  "goalSkins": {
    "exit": "gangplank",
    "door": "fort_gate"
  },
  "projectileSkin": "cannonball",
  "soundPackId": "pirates_basic_v1"
}
```

If every theme fills the same slots, switching themes becomes deterministic and does not alter game rules.

## Asset categories and contracts

### Character sprites

Every MVP character should use the same render contract:

- Top-down or three-quarter top-down perspective
- 64 × 64 runtime art frame size
- Transparent background
- Consistent transparent padding
- The character’s feet anchored to the same pixel coordinate
- Similar character scale and collision footprint
- Direction order: down, left, right, up
- One idle frame per direction
- Four walk frames per direction
- No baked player-color marker, name, UI, or background
- No baked shadow unless every sprite uses the exact same shadow contract

Attack and defeat poses are optional play-once event sheets. A character without
those sheets still participates in combat mechanically and uses the runtime's
safe no-animation fallback. Held weapons are separate assets and do not change
the character's frame geometry, anchor, or collider.

Player colors, name plates, selection rings, health bars, and the `it` marker should be runtime overlays. Do not bake them into character art.

Human skin tone and hair color are runtime appearance data. Each human sheet
ships with separate, non-overlapping, same-size four-shade companion masks. The
renderer maps only those indexed areas through the selected `skinToneId` and
`hairColorId`, caches the combined sheet, and then uses the ordinary frame
slicing path. This preserves face, hand, and hair shading without tinting
clothing, outlines, headwear, or accessories. Human characters must not default
to a permanently light-skinned asset and must not be removed from the library
as a workaround.

Example asset metadata:

```json
{
  "id": "ghost_pirate_01",
  "kind": "character",
  "runtime": "top_down_v1",
  "view": "top_down_4dir",
  "body": "ghost",
  "themeTags": ["pirates", "haunted"],
  "roles": ["player", "enemy"],
  "animations": {
    "idle": {
      "directions": 4,
      "framesPerDirection": 1
    },
    "walk": {
      "directions": 4,
      "framesPerDirection": 4,
      "fps": 8
    }
  },
  "frame": {
    "width": 64,
    "height": 64,
    "anchorX": 32,
    "anchorY": 56
  },
  "collisionProfile": "character_small_v1",
  "assetId": "sprite_sheet_ghost_pirate_01"
}
```

For a human player, appearance remains separate from body, theme, role, and
behavior:

```json
{
  "body": "human",
  "assetId": "pirate_human_01",
  "appearance": {
    "skinToneId": "skin_04",
    "hairColorId": "hair_03"
  }
}
```

### Creature bodies

The initial cast should use a small set of visually distinct bodies:

- Human
- Ghost
- Zombie
- Dragon
- Robot

Not every body needs every theme immediately. The registry should support exact matches and graceful fallbacks.

Recommended asset resolution order:

1. Exact body and theme match, such as `ghost + pirates`
2. Body match with a neutral treatment, such as `ghost + neutral`
3. Theme match with the default human body, such as `human + pirates`
4. Known-safe neutral character

This prevents an unusual AI request from breaking the game when an exact sprite has not been created.

### Collectibles and pickups

Mechanics should use semantic slots. Themes provide the visual skin.

- `collectible_common`: increases score
- `extra_life`: increases remaining lives by one, fades from the world, and plays one shared firework burst
- `key`: unlocks a door or exit
- `health`: restores health
- `speed_boost`: temporarily increases movement speed
- `shield`: temporarily prevents damage
- `weapon`: equips a supported weapon

Every pickup should use a small fixed bounding box. An optional four-frame sparkle or bob animation can be reused across themes, but static art is acceptable for the hackathon.

### Obstacles and hazards

- `solid`: blocks movement
- `breakable`: blocks movement until destroyed
- `damage`: reduces health on contact
- `slow`: reduces movement speed while overlapping
- `door`: solid until unlocked

Art does not determine the behavior. A barrel and a tombstone can both use the `solid` obstacle component.

### Enemies

Enemies use character art plus a trusted behavior:

- `wanderer`: moves randomly within a bounded area
- `chaser`: moves toward the nearest valid player
- `shooter`: remains at range and fires a straight projectile
- `patroller`: moves left and right between two nearby bounds in a platformer

For the hackathon, behavior parameters should be few and bounded:

```json
{
  "behavior": "chaser",
  "speed": 70,
  "detectionRadius": 240,
  "contactDamage": 1,
  "target": "nearest_player"
}
```

Behavior trees, pathfinding-heavy enemies, arbitrary AI-authored rules, and
multi-phase boss logic should wait. A bounded Platformer boss is a single
`enemy_spawn` with `role: "boss"`, one existing trusted behavior, and an integer
`hitsToDefeat` from 2 through 99. Its left/right artwork follows its current
movement direction, including when a patrol, chase, or terrain collision makes
it turn around; bosses never use up/down facings. A strike from behind turns a
boss toward the attacker and flips its movement direction before its authored
patrol or chase resumes. Each weapon hit applies the weapon's bounded knockback
away from the attacker through normal terrain collision. A surviving boss pauses its authored
movement and blinks its existing sprite for 500 milliseconds; no damage sprite
is required and the visual effect never changes collision. Boss movement stays
on its authored straight horizontal path and never uses cosmetic bobbing.

The planned campaign contains Green Hills, Space, and Haunted world groups plus
a Dragon/Emberkeep level. Each world group's final level and the Dragon level
contain at most one boss. A boss level may omit the normal goal, and a goal
cannot complete the level while its boss remains alive. The level completes
only after the boss reaches zero hits and its full, non-looping `defeated`
event animation finishes.

Boss art remains aligned to the 64-pixel world grid but uses one `128 × 128`
frame: four `64 × 64` art modules assembled into one image and one gameplay
entity. Its recipe uses `collisionProfile: "boss_large_v1"`; stitching must
never create four independently moving or damageable map objects.

The first Platformer map uses one `patroller`. Contact from above defeats that
enemy; side or bottom contact defeats the player and returns them to the latest
checkpoint. Each enemy spawn selects a character asset independently from the
complete character catalog, so a Space map can use any available body or theme
without creating a Space-specific enemy class.

Each Platformer enemy spawn declares its starting direction plus separate
whole-tile distances to the left and right of its placed cell. Reaching either
bound reverses its direction. The character choice and these distances remain
explicit per-enemy map data so a child can change one enemy without affecting
the others.

Actor speed is also explicit per placed map actor. Platformer player and enemy
spawns use `speedPxPerSecond`; top-down Maze player and enemy spawns use
`speed`. The editors apply one hero speed to every player spawn in the map and
keep each enemy speed independently editable. Platformer hero speed is bounded
to `64–640` pixels per second and enemy speed to `16–160`; Maze hero speed is
bounded to `64–480` and enemy speed to `20–240`. Runtimes retain the legacy
defaults of `320`, `48`, `224`, and `70` respectively when opening older maps
that do not yet declare the field.

### MotionSpec: travel, visual motion, and lifecycle

Character art, behavior, and motion remain independent. `behavior` continues to
describe an enemy's intent, while an optional versioned `motion` block describes
how a placed actor or object travels and how it is drawn. The same bounded
`MotionSpec` shape may be used by a `MapSpec` object or a character entry in a
future `GameSpec`; it never contains executable expressions or arbitrary
keyframes.

Motion has three separate parts:

- `travel` changes authoritative world position and therefore moves collision.
- `visual` offsets only the rendered sprite; collision and anchors do not move.
- `lifecycle` declares when a fly-by begins, repeats, and ends.

The initial vocabulary is intentionally small. `travel.type` is `controlled`,
`stationary`, `behavior`, `ramming`, `circle`, or `viewport_arc`; `visual.type`
is `none`, `bob`, or `peck`. Controlled travel is valid only for player spawns and uses
player input at the spawn's authored speed. Behavior and ramming travel are
valid only for enemy characters and delegate to
the enemy's bounded `patroller` or `chaser` behavior. Ramming pauses for a
bounded authored `chargeDelayMs` when the character is ahead of the enemy and
inside its patrol or chase range, then moves forward by the bounded authored
`distanceTiles` before resuming the base behavior. It rearms after the character
leaves the enemy's forward-facing trigger. A viewport arc can be used by any
placed map object, including a character-backed enemy, collectible, checkpoint,
or goal.

Circular travel is available to every Platformer enemy. The enemy's placed cell
is the bottom point of an odd square travel grid, so a `9`-tile grid travels
around the center of the `9 x 9` area without jumping when play begins. The
enemy's authoritative position and collider follow the circle. Each placement
declares clockwise or counterclockwise spin and a bounded cycle duration; the
circle is not clipped or redirected by terrain.

```json
{
  "motion": {
    "version": 1,
    "travel": {
      "type": "circle",
      "gridSizeTiles": 9,
      "direction": "clockwise",
      "durationMs": 8000
    },
    "visual": { "type": "none" }
  }
}
```

Circular grids are odd integers from `3` through `25` tiles and cycle durations
are integers from `1000` through `60000` milliseconds. The full grid should fit
inside the authored map.

Platformer maps also expose a dedicated `flying_object` placement. It is a
non-colliding presentation object with a required stable `assetId`; the map
editor's **Flying object** tool is available on every map and its Sprite
dropdown lists every `platformer_v1` recipe whose `kind` and `visualSlot` are
both `flying_object`. The placement uses the same bounded Motion controls as
other objects and defaults to a right-to-left `viewport_arc`. Maps opt in by
placing the object, so adding the editor tool does not add fly-bys to every
level.

A normally patrolling ghost can add cosmetic bobbing without changing combat:

```json
{
  "behavior": "patroller",
  "motion": {
    "version": 1,
    "travel": { "type": "behavior" },
    "visual": {
      "type": "bob",
      "heightTiles": 0.12,
      "periodMs": 1600
    }
  }
}
```

A hero or enemy can instead use `peck` for chicken-like body movement: two
quick direction-aware lunges followed by a short recoil and pause. Pecking is a
cosmetic body offset, so it never moves the collider or changes the authored
map position.

```json
{
  "speedPxPerSecond": 320,
  "motion": {
    "version": 1,
    "travel": { "type": "controlled" },
    "visual": {
      "type": "peck",
      "distanceTiles": 0.18,
      "periodMs": 900
    }
  }
}
```

A bird, bat, or other `flying_object` uses the placed object's `x` and `y` as
its camera trigger.
When the camera reaches that marker, the runtime snapshots the current viewport,
resolves the offscreen entry and exit into world coordinates, and moves the real
world transform—and its collider when collision is enabled—over one deterministic
quadratic arc. The path does not remain attached to the camera after activation.

```json
{
  "id": "flying_1",
  "type": "flying_object",
  "x": 14,
  "y": 2,
  "assetId": "neutral_green_hills_flying_cooper_01",
  "motion": {
    "version": 1,
    "lifecycle": {
      "trigger": "camera_reaches_spawn",
      "repeat": "once"
    },
    "travel": {
      "type": "viewport_arc",
      "entryEdge": "right",
      "exitEdge": "left",
      "entryRow": 6,
      "exitRow": 6,
      "archDirection": "up",
      "archHeightTiles": 4,
      "durationMs": 5000,
      "offscreenPaddingTiles": 1
    },
    "visual": { "type": "none" }
  }
}
```

The initial flying-sprite contract is a four-frame 2-by-2 sheet with 64-by-64
frames, center anchor `(32, 32)`, and row-major labels `fly_left_1` through
`fly_left_4`. Recipes declare `nativeDirection: "left"`; right-to-left paths
draw the source frames directly, while a future left-to-right path mirrors them
at runtime. Authors therefore do not need duplicate right-facing artwork for a
fly-by sprite. Frame animation is independent from the MotionSpec path.

The trusted bounds are: bob height `0.05–1` tile, bob period `250–10000` ms,
peck distance `0.05–0.5` tile, peck period `250–5000` ms,
viewport rows inside the configured camera, arc height `0.5–12` tiles, duration
`500–30000` ms, offscreen padding `0–4` tiles, repeat interval `500–60000` ms,
and repeat count `2–20`. `entryEdge` and `exitEdge` must be opposite. The server
owns collision-bearing travel in network play; clients may derive cosmetic bob
or peck motion from fixed simulation time and the stable entity ID.

### Tilesets

All MVP maps need a common top-down tile contract. A theme tileset should include:

- Base floor tile
- Alternate floor tile
- Solid wall center
- Wall edges in four directions
- Inner and outer corners
- Doorway or gate
- Hazard tile where appropriate
- Decorative non-colliding props

Use one tile size throughout the MVP: 64 × 64 runtime pixels. Collision should come from map data, not inferred from image pixels.

### Platformer backgrounds and parallax

Platformer background art should be modeled as presentation data layered behind
the gameplay map. It should not be baked into the tile collision layer and it
should not require one giant image per level.

The preferred approach is a Super Nintendo-style parallax stack made from
repeatable horizontal strips:

```json
{
  "background": {
    "theme": "backyard_day",
    "color": "#86c7e8",
    "layers": [
      {
        "id": "sky",
        "type": "solid",
        "color": "#86c7e8",
        "parallax": 0.05
      },
      {
        "id": "clouds",
        "type": "repeat_x",
        "assetId": "background_backyard_clouds_v1",
        "parallax": 0.18
      },
      {
        "id": "fence",
        "type": "repeat_x",
        "assetId": "background_backyard_fence_v1",
        "parallax": 0.45
      },
      {
        "id": "grass_far",
        "type": "repeat_x",
        "assetId": "background_backyard_grass_far_v1",
        "parallax": 0.7
      }
    ]
  }
}
```

Large single-piece backgrounds should be reserved for special set pieces, not
normal maps. They increase image size, make levels harder to edit, and tie the
art export to a specific map length. Repeatable layers keep the map flexible,
allow one background pack to serve many levels, and produce the desired
side-scrolling depth when each layer moves at a different fraction of camera
movement.

Background layers are visual only. Collision, coins, hazards, checkpoints,
goals, and spawn points remain in `MapSpec`. Later, map authors can place
non-colliding decorative objects such as trees, sheds, signs, rocks, or vines
in the map data, but those objects still do not determine physics.

### Effects and UI overlays

Reusable effects can work across every theme:

- Pickup sparkle
- Damage flash
- Projectile impact
- Spawn effect
- Victory burst
- Player-color ring
- Player name plate
- Health bar
- Current-target or `it` marker

Theme-specific colors or textures may skin these effects later, but their animation and gameplay role should stay generic.

### Music and sound effects

Audio is composable presentation data. Gameplay emits semantic cues, and a
sound pack maps those cues to approved audio assets. Physics, scoring, damage,
and collision must never depend on an audio file finishing or playing
successfully.

The first reusable pack is `space_basic_v1`. It contains seamless named
`gameplay` and `boss` music loops plus these initial effect slots:

- `jump`
- `land`
- `collectible`
- `enemy_defeat`
- `player_damage`
- `player_death`
- `respawn`
- `checkpoint`
- `goal`

Every sound pack declares stable asset IDs, file paths, loop behavior, and
bounded default gains. The browser runtime owns decoding, preloading, voice
limits, and clean music-loop transitions. A missing effect is silent and does
not interrupt play; a missing music track falls back to no music.

An `enemy_spawn` may store a semantic `viewMusicCue`. While that living enemy
intersects the active camera viewport, the runtime switches to the matching
named loop from the selected sound pack. Leaving the viewport or defeating the
enemy restores the prior music state. Boss placement defaults to the `boss`
cue; no filenames, volume, or playback state enter the map.

Kid-facing configuration should begin with a small safe surface: choose an
approved music track or sound pack, turn music and effects on or off, and set
their relative levels. Per-cue substitution can be added later from the same
approved registry. Personal listening preferences such as master mute and
master volume stay local to the player and do not change the shared `GameSpec`.
The game must expose visible mute controls and must not use sound as the only
signal for a gameplay event.

Browsers may require a click, tap, or key press before audio begins. The runtime
should unlock audio from the first intentional play interaction, then start the
music loop and allow semantic effect cues. The map editor may preview audio,
but map data stores no waveforms, filenames, or playback state.

## Full MVP asset inventory

### Shared technical assets

- One known-good neutral player sprite sheet
- One known-good neutral enemy sprite sheet
- An immutable source asset registry with parent/revision lineage
- A staging area for AI-edited sprite candidates and validation reports
- Player color rings for four players
- Name plate UI
- Health bar UI
- `it` marker
- Pickup sparkle
- Damage flash
- Spawn effect
- Projectile impact
- Simple shadow, if used consistently

### Per-theme assets

For each of the five launch themes:

- One complete 64 × 64 tileset
- At least one small map using that tileset
- Four collectible or pickup skins
- Three obstacle skins
- One door skin
- One exit or goal skin
- One projectile skin
- One background or map-edge treatment
- Optional basic sound pack

### Character demo matrix

Generate these first because they demonstrate the exact composability promised in the pitch:

**Priority 0:**

- Pirate human
- Pirate ghost
- Ninja human
- Ninja zombie
- Dragon
- Knight or wizard
- Robot
- Alien

**Priority 1 fallbacks:**

- Neutral human
- Neutral ghost
- Neutral zombie
- Neutral dragon
- Neutral robot

**Priority 2:**

- Remaining theme and body combinations

For a two-day build, complete sprite sheets are safer than runtime-layered costumes. Layering a pirate hat or ninja mask over multiple bodies sounds reusable, but it creates alignment and animation problems for every frame. Layered characters can become a later optimization after the sprite contract is proven.

## Asset generation workflow

Do not mass-generate sprites until one canonical sprite sheet works inside the real runtime.

### Step 1: Create a canonical reference sheet

Generate or draw one neutral character with the exact required:

- Perspective
- Frame dimensions
- Direction order
- Frame order
- Scale
- Anchor point
- Transparent padding
- Animation count

### Step 2: Test it in the runtime

Verify:

- The sheet slices correctly
- Direction mappings are correct
- Feet do not slide between frames
- The sprite does not jump when direction changes
- Collision feels aligned with the visible character
- Scaling does not blur unexpectedly
- Transparency is clean

### Step 3: Lock the art specification

Record the canonical sheet, prompt, negative constraints, layout diagram, and export process. Every later generation should use that sheet as a visual and structural reference.

### Step 4: Generate the Priority 0 matrix

Generate the characters that prove world theme and creature cast are independent. Test each sheet automatically for dimensions, frame count, and transparency, then visually inspect its animation.

### Step 5: Generate theme packs

Prioritize the exact themes intended for the hackathon demo. A complete Pirate pack and complete Ninja pack are more valuable than five incomplete packs.

## AI-assisted sprite editor

Children should be able to personalize an existing character with guided choices and a natural-language request while keeping it compatible with every `top_down_v1` game. The editor creates a new derivative asset; it never edits or overwrites the selected original.

### Immutable editing workflow

1. The child selects an approved character asset.
2. The app clones its complete asset package: high-resolution source master, sprite recipe, metadata, and contract version.
3. The clone receives a new asset ID and records the original as its parent.
4. Guided controls and a short prompt describe an allowed visual change.
5. The AI edits the cloned high-resolution source sheet using the original as its structural reference.
6. The deterministic sprite pipeline reconstructs the runtime sheet and validates its geometry, transparency, frames, pivots, filenames, and stable animation landmarks.
7. The app shows the candidate in the Sprite Viewer screen of `game_editor`, using its JSON recipe for playback and frame labels. A failed candidate is never offered for review or play.
8. Pressing **Approve sprite** validates again, promotes the suffix-free runtime PNG, and records an immutable approval receipt. **Request changes** starts a local agent immediately, attaches the exact candidate and a cloned high-resolution source, streams safe progress indicators, and returns a validated replacement candidate without altering the approved asset.

The live revision UI may show high-level states such as **Thinking**, **Inspecting**, **Editing**, and **Validating**, but it must not reveal the model's private reasoning. The request records the frame and animation sequence visible when the prompt was submitted so references such as “this walking frame” remain grounded.

The AI output is untrusted input. Prompt instructions reinforce the contract, but automated validation is the enforcement boundary. The app must never publish an image merely because the model was told to preserve the layout.

### Allowed and blocked changes

Safe edits include:

- Costume and theme treatment
- Palette and material changes
- Hair, facial details, and expressions
- Small hats, masks, armor, or accessories that remain inside the content envelope
- Converting a neutral body into a pirate, ninja, dragon-world, space, or haunted variation

Reject or route through a future advanced workflow any request that changes:

- The `64 × 64` character frame size or `5 × 4` sheet layout
- Direction or animation frame order
- The three-quarter top-down camera perspective
- The `(32, 56)` gameplay anchor
- Body scale, collision profile, or recognizable body category
- Frame count, transparent background, or required padding
- The identity or costume between animation frames
- Names, UI, scenery, shadows, weapons, or effects baked into character art

Kid-facing prompts and generated images must also pass the product's content-safety checks. Guided choices should be the default; free text should be short, narrowly scoped to visual customization, and moderated before generation.

### Asset lineage

Each derivative should store enough information to reproduce, audit, and safely roll it back:

```json
{
  "assetId": "user_pirate_ghost_7f3a_revision_2",
  "parentAssetId": "neutral_ghost_01",
  "previousRevisionId": "user_pirate_ghost_7f3a_revision_1",
  "revision": 2,
  "contractVersion": "top_down_v1",
  "body": "ghost",
  "themeTags": ["pirates"],
  "sourceImage": "immutable/source/location.png",
  "runtimeImage": "immutable/runtime/location.png",
  "recipeSnapshot": "immutable/recipe/location.json",
  "editPrompt": "Give the ghost a cheerful pirate coat and hat",
  "creatorId": "user-id",
  "validationStatus": "passed",
  "moderationStatus": "passed"
}
```

Storage keys must be revisioned or content-addressed so publishing a derivative cannot overwrite an earlier binary. The curated asset library remains read-only to users.

### Runtime and network play

The editor publishes an asset before a match references it. `GameSpec` stores the accepted derivative's asset ID exactly as it would a curated asset ID. Network clients download that immutable revision; the game synchronizes the asset ID, not image-editing operations or raw prompts. A room should fall back to the derivative's parent asset if the custom revision is unavailable or rejected.

### Hackathon boundary

The minimum convincing editor supports one operation: clone an existing character, request one costume or palette change, validate the complete sheet, preview it, and use the accepted derivative in a game. Pixel-level drawing tools, mask painting, changing the artwork inside individual frames, collaborative editing, asset marketplaces, and merging multiple derivative branches should wait until after the hackathon. Placement-only frame corrections are supported in the Sprite Viewer as recorded recipe offsets: a reviewer can drag or nudge one frame, intentionally crop it at a frame edge when needed, replay the animation, and rebuild a validated staged candidate without invoking AI or modifying the approved asset.

## Minimal `GameSpec`

```json
{
  "schemaVersion": 1,
  "runtime": {
    "id": "top_down",
    "version": "1.0.0"
  },
  "physics": {
    "specId": "ship_maze_01",
    "revision": 1
  },
  "ruleset": {
    "id": "maze_escape",
    "mode": "race",
    "config": {
      "keyCount": 1,
      "durationSec": 120,
      "winCondition": "first_to_exit"
    }
  },
  "world": {
    "theme": "pirates",
    "mapId": "ship_maze_01"
  },
  "audio": {
    "soundPackId": "pirates_basic_v1",
    "musicEnabled": true,
    "effectsEnabled": true,
    "musicLevel": 0.6,
    "effectsLevel": 0.8
  },
  "cast": {
    "players": {
      "body": "ghost",
      "assetPool": ["ghost_pirate_01"]
    },
    "enemies": {
      "body": "zombie",
      "assetPool": ["zombie_pirate_01"],
      "behavior": "chaser"
    }
  },
  "match": {
    "minPlayers": 1,
    "maxPlayers": 4,
    "roomVisibility": "invite_only",
    "lateJoin": true
  },
  "content": {
    "enemyCount": 2
  }
}
```

The runtime should validate this spec, resolve asset IDs, create entities from trusted components, and start the game. The conversation used to produce the spec is not required to play it.

## Two-day implementation boundary

### Hours 0–6

- Render a map
- Move one top-down character
- Add collision
- Load an asset from the registry by ID

Do not build the full builder before the runtime works.

### Hours 6–14

- Implement Treasure Rush in solo mode
- Load and validate a deterministic `GameSpec`
- Apply theme and character swaps without restarting the app

### Hours 14–24

- Add invite-only room codes
- Support two to four players
- Synchronize movement
- Make collectible claims and scores authoritative
- Handle disconnect and basic rejoin behavior

### Hours 24–32

- Build data-driven choice buttons
- Let buttons mutate `GameSpec` locally without an AI call
- Add live theme, character, collectible, and map changes

### Hours 32–40

- Let AI translate one natural-language request into a constrained `GameSpec`
  or game-physics patch
- Validate the patch against supported capabilities and asset availability
- Reject or gracefully substitute unsupported combinations
- Add the minimum sprite-editor path: clone one character, request one constrained visual edit, run the sprite pipeline, and preview the candidate

### Hours 40–48

- Add Maze Escape or Tag Chase from shared components
- Polish the single demo path
- Improve feedback, loading, room joining, and error recovery
- Allow an accepted custom sprite revision to be selected by asset ID in the demo game
- Add Survival Arena only if the rest is stable

The content model can define all four game types, but the hackathon demo should guarantee Treasure Rush plus one additional game type. A polished networked transformation from pirate ghosts to ninja zombies is more convincing than four fragile modes.

## Immediate recommendation

Before the two-day coding window begins:

1. Lock the top-down sprite and tileset contracts.
2. Produce and validate one canonical character sprite sheet.
3. Generate the Priority 0 character matrix.
4. Validate configurable skin-tone and hair-color masks for every human
   character before generating additional human variants.
5. Complete Pirate and Ninja theme packs first.
6. Prepare at least one open arena map and one maze map per demo theme.
7. Store every asset in a registry with semantic metadata.
8. Make curated assets immutable and preserve source, recipe, parent, and revision metadata for every AI-edited derivative.
9. Avoid generating art outside the Maze and narrow Platformer demo path until
   the hackathon MVP is working.

This provides enough content to demonstrate many combinations while keeping the runtime, asset pipeline, and networking model small enough to build in two days.
