# Splat Lab! HackYard Plan

## Purpose

This document defines what Splat Lab! should accomplish during the two-day
HackYard hackathon.

[`GAME.md`](./GAME.md) remains the long-term product
and content plan. It describes the larger game platform, its composable content
model, its intended game library, and its complete asset goals. This document is
the deliberately smaller HackYard delivery plan. When the two documents differ
about what to build during the hackathon, this document controls the hackathon
scope without changing the long-term direction.

## HackYard product promise

The demonstration should prove that a child can create a recognizable game by
choosing a game type, theme, and hero, then immediately play the result.

The strongest demonstration is not a large number of mechanics. It is the
visible transformation of the game as the child makes choices. For example:

```text
Platformer + Dragons + Wizard
```

should immediately produce a playable dragon-world platformer starring the
selected wizard. Changing the theme or hero should update the preview without
requiring a new engine or a page reload.

The HackYard build must support at least two playable game types:

1. **Maze** — the dependable multiplayer game.
2. **Platformer** — the polished audience-facing “wow” game.

Other game types remain visible in the builder so the larger product direction
is understandable, but unavailable types display a clear **Coming soon** badge.

## Main application screen

[`brand/app-1.png`](./brand/app-1.png) is the closest current reference for the
main builder screen. It is a visual product reference, not a literal inventory
of features that must all work during HackYard.

The screen should communicate three things at once:

- The child is building with Cooper through friendly, guided choices.
- The choices include game type, theme, and hero.
- Choosing a hero leads directly into a simple character appearance editor.
- The game preview updates immediately and can be played without leaving the
  builder.

The game-type choices shown in the reference should behave as follows:

- **Platformer:** available.
- **Maze:** available.
- **Top-down adventure:** visible with a **Coming soon** badge.
- **Endless runner:** visible with a **Coming soon** badge.

Unavailable cards should remain understandable and attractive, but must not
lead into incomplete flows. The builder may also show themes or characters that
fall back to an approved compatible asset when an exact combination is not
available.

### Character selection and editor transition

After the player chooses the type of character they want, the character choices
on the left side should scroll out and a character editor should scroll into the
same panel. This is an in-place continuation of the guided builder, not a route
change, dialog, or separate developer tool. The game preview on the right stays
visible throughout the transition.

The character editor should look and feel like a simplified, child-facing
version of the existing Sprite Viewer screen in `game_editor`:

- A large isolated preview of the selected character.
- Animated playback using the character's real approved sprite frames.
- Separate **Play** and **Pause** buttons. **Play** starts or resumes playback;
  **Pause** holds the currently displayed frame.
- Playback always runs the complete sheet in its declared frame order, matching
  the existing sprite viewer's **All frames** sequence. The child-facing editor
  does not expose direction, sequence, previous-frame, or next-frame controls.
- A clearly labeled **Skin tone** group of visual swatches.
- A clearly labeled **Hair color** group of visual swatches.
- A **Back** action that returns to character-type selection without losing the
  current choices.
- A clear action to keep the customized character and continue building.

Skin and hair changes update both the character-editor preview and the live game
preview immediately. They are appearance settings applied through the approved
companion masks; they do not create a new sprite sheet or alter collision,
animation geometry, theme, role, or gameplay behavior.

Changing skin tone, changing hair color, or resizing the panel must not restart
the animation or change its current play/pause state. Selecting a different
character may restart at that character's first frame, but it retains whether
the player had playback running or paused.

The HackYard editor should reuse the established sprite rendering, animation,
mask, palette, and caching behavior rather than implementing a second recoloring
system. It should not expose the Sprite Viewer's developer-facing rulers, guides,
pixel coordinates, recipe metadata, approval state, or revision controls.

Controls are capability-driven. **Skin tone** appears only for an asset with a
valid skin mask, and **Hair color** appears only for an asset with a valid hair
mask. If the selected character has a fixed appearance, the editor should say
so plainly instead of showing controls that have no effect. Changing character
type should preserve an appearance choice when it remains compatible and fall
back to that character's declared default when it does not.

The panel transition must also work without animation when reduced motion is
requested. Keyboard focus moves into the incoming editor, the **Back** action
returns focus to the previously selected character card, and every swatch has
an accessible name and visible selected state.

## Definition of success

At the end of the two days, the demo should allow someone to:

1. Open the main builder screen.
2. Choose Maze or Platformer.
3. Choose a supported theme and hero from approved assets.
4. See the left panel scroll into the character editor.
5. Change the selected character's supported skin tone and hair color and see
   both previews update immediately.
6. Play and pause the character's complete **All frames** animation.
7. Start and finish the Maze or any of five short, polished Platformer maps.
8. Encounter and defeat the Space ghost on the first Platformer map.
9. Encounter the new Dragon Ghost and Dragon Dragon 01 on the second
   Platformer map, including Dragon Dragon 01's mouth-height animated fireballs.
10. Encounter the neutral Ghost, Robot, and Zombie on the third Green Hills
    Platformer map.
11. Encounter the Haunted Spirit Orb and Neutral Ghost among the offset
    graveyard-hand hazards on the fourth Haunted Platformer map.
12. Build speed, coast, and reverse gradually across the fifth Ice World map's
    frozen terrain using its map-authored traction rule.
13. Face the Glacier Brute at the end of Ice World and dodge its sharp ice
    crystals as they arc toward the hero while spinning end over end.
14. Hear map-appropriate background music and clear feedback for jumps, coins, enemy defeat,
   player defeat, fireballs, checkpoints, and the goal, with visible mute controls.
15. Create or join an invite-only Maze room and play with another person.
16. Understand from the **Coming soon** cards that additional game types are
   part of the product direction.

The demo does not need to prove that every theme, character, and game type can
be combined perfectly. It needs to prove that the underlying composition model
works and that adding more content later is credible.

## Game type 1: Maze

Maze is the reliable game type and the guaranteed multiplayer experience.

### Player promise

Find the key, unlock the exit, and escape before the other players.

### HackYard rules

1. Players spawn at defined locations in a small maze.
2. Walls block four-direction movement.
3. One key appears at a fixed map location.
4. The first player to collect the key can unlock the exit.
5. The first player to reach the open exit wins.
6. The server decides key ownership, door state, and the winner.

### Required content

- One small handcrafted maze.
- Two to four player spawn points.
- Floor and wall tiles.
- One key.
- One closed/open exit or door.
- Approved top-down character sheets.
- Player identity rings or other simple multiplayer markers.

Enemies, hazards, multiple keys, cooperative rules, procedural generation, and
multiple maze levels are outside the guaranteed HackYard scope.

## Game type 2: Platformer

Platformer is the visual centerpiece. Its job is to make the builder feel
magical when a choice turns into a colorful playable game.

### Player promise

Run, jump, collect coins, avoid a simple hazard, and reach the goal.

### HackYard rules

1. The player moves left and right.
2. The player can make one conventional grounded jump.
3. Static platforms and ground tiles are solid.
4. Collecting coins increases the score.
5. Touching an extra-life pickup increases remaining lives by one and fades the
   pickup from the world.
6. Touching the goal finishes the level.
7. Falling out of the level or touching the supported hazard returns the player
   to the latest spawn point.
8. All five maps contain map-backed enemies using either patroller or chaser
   behavior.
9. Landing on top of the enemy or hitting it with the supported short sword
   defeats it; touching a live enemy from the side or below defeats the player
   and returns them to the latest spawn point after the defeat animation.
10. The enemy's character, behavior, starting direction, and behavior-specific
   left/right distances are configurable per enemy. Character choices are not
   restricted to the map theme; patrol and chaser view distances use whole map
   blocks.

### Required content

- Five short handcrafted levels: the existing Space map, the Emberkeep dragon
  map, a neutral Green Hills map based on the bright castle-and-waterfalls
  gameplay treatment in `brand/app-1.png`, a haunted graveyard map, and an Ice
  World map built around long frozen runways and controlled sliding.
- Static ground and platform tiles.
- An Emberkeep-specific ground, platform, solid obstacle, and animated lava
  hazard set for the second map.
- A Green Hills-specific full-cell ground block, full-cell platform block,
  wooden-crate obstacle, and animated full-height waterfall hazard set for the
  third map. Walkable tile artwork fills the complete 64-by-64 collision cell
  with its top surface at pixel row 0, so characters do not appear to float
  above it. The waterfall curtain begins four pixels below the cell top to make
  room for its animated upward spray, and tiles join seamlessly side-by-side.
- A Haunted-specific full-cell ground block, full-cell platform block, a
  typical solid stone block, the approved tombstone as a second obstacle
  choice, and an eight-frame graveyard hazard in which a skeleton hand swipes
  upward. Terrain cells retain semantic collision while selecting obstacle art
  independently, so the stone block and tombstone are interchangeable obstacle
  choices.
- An Ice World-specific full-cell ice ground treatment, floating ice platforms,
  frozen blocks, crystal-spike hazards, and a cold mountain or glacier parallax
  treatment. These use normal recipe-backed assets and the same Sprite Viewer
  approval flow as every other theme; Ice World has no special drawing path.
- A large Ice World Glacier Brute boss with crystal spikes and its own four-frame
  ice-crystal projectile. The map authors a bounded lobbed-projectile attack;
  the projectile sheet's four rotations create the end-over-end spin while the
  shared simulation supplies the arc.
- Coins or one equivalent themed collectible.
- One checkpoint and one goal treatment per map.
- Emberkeep-specific coin, checkpoint flag, and goal flag sprites, including
  their collected, activated, and level-complete event sheets.
- One player spawn point.
- Enemy spawns using selected character assets and bounded patroller or chaser
  behavior.
- `dragon_ghost_01` as enemy #1 and the approved `dragon_dragon_01`
  (**Dragon Dragon 01**) as enemy #2 on the Emberkeep map.
- Approved `neutral_ghost_01`, `neutral_robot_01`, and `neutral_zombie_01`
  enemies on the Green Hills map.
- `haunted_spirit_orb_01` as enemy #1 and `neutral_ghost_01` as enemy #2 on the
  Haunted map. Complete the Haunted regular-character set by adding Human,
  Ghost, Zombie, Dragon, and Robot variants alongside `haunted_cooper_01`.
- A small four-frame 64-by-64 fireball sheet for Dragon Dragon 01, with its
  projectile asset, travel distance in blocks, and shot cooldown configured on
  that enemy.
- One trusted short-sword weapon with separate character and weapon artwork.
- A polished layered parallax background treatment using repeatable sections;
  the second map uses the approved `dragons_emberkeep_01` (**Emberkeep
  dragons**) pack and the third uses `neutral_green_hills_01`.
- A haunted graveyard background pack for the fourth map.
- A dedicated three-layer Ice World background pack for the fifth map: snowy
  mountains and ice palace, frozen cliffs and waterfalls, then crystalline
  foreground growth.
- A bounded `physics.groundTractionScale` on every Platformer map. It scales
  grounded acceleration and braking together, defaults to `1`, and never
  changes air control. The Ice World map starts at `0.15`, so the player needs
  time to build speed, continues coasting after input is released, and reverses
  direction gradually instead of stopping instantly.
- A per-placement first animation frame for animated map sprites. This value is
  1-based and does not change the shared sprite recipe; neighboring animated
  hazards can use different starting frames to keep their loops out of phase.
- `shared_victory_burst_01` fireworks when any Platformer map is completed.

### Explicit platformer limits

The HackYard platformer does not include:

- Slopes.
- Moving platforms.
- One-way platforms unless trivial after the core level works.
- Ladders, swimming, wall jumps, double jumps, or complex movement abilities.
- Projectile combat beyond Dragon Dragon 01's bounded straight-line fireball
  attack, or weapons beyond the supported short sword.
- Enemy behavior trees or behaviors beyond patroller and chaser.
- Procedural levels.
- A general-purpose level editor.

The bounded patroller and chaser behaviors and one-hit short-sword combat are
part of the five-map acceptance path. Behavior trees, combos, blocking,
durability, inventories, and general health systems remain out of scope.

### Post-HackYard nine-level campaign

The five-map acceptance path above remains the hackathon seed rather
than being retroactively expanded. The follow-on campaign has nine Platformer
levels in three groups: three Green Hills, three Space, then three Haunted.
Levels 3, 6, and 9 are boss levels. Each uses the bounded single-boss contract
in `GAME.md`: existing movement/range behavior, `hitsToDefeat`, horizontal
player-facing art, one large collider, and a full defeat animation that must
finish before level completion. Multi-phase bosses and general-purpose enemy
health remain outside this campaign contract.

## Music and sound effects

The HackYard build ships five configurable sound packs: `space_basic_v1` for
the first Platformer map, `dragons_emberkeep_v1` for the second,
`neutral_green_hills_v1` for the third, `haunted_graveyard_v1` for the fourth,
and `ice_world_v1` for the fifth.
Each provides one seamless background loop plus short effects for `jump`,
`land`, `collectible`, `enemy_defeat`, `player_damage`, `player_death`,
`respawn`, `weapon_swing`, `weapon_hit`, `fire`, `checkpoint`, and `goal`.

The runtime raises semantic gameplay events and the selected sound pack maps
them to audio assets. Maps never contain filenames or timing-dependent audio
logic. The child-facing builder initially exposes the sound-pack choice plus
music/effects toggles and bounded relative levels. A player's master mute and
master volume are local preferences, not shared game rules.

Audio starts only after the browser receives an intentional play interaction.
Missing or blocked audio must not block gameplay. Music loops cleanly, effect
voices are capped so rapid collections do not become painfully loud, visible
mute controls are always available, and every important cue also has a visual
signal.

### Reusing the existing characters

Many characters have already been generated and should be used rather than
discarded. Their four-direction sheets work directly in Maze.

For the HackYard platformer, the runtime may use the right-facing animation row
as the horizontal walk cycle and mirror it for left-facing movement. A stable
existing pose may be held during jumping and falling. This is a tactical reuse
of approved art for the demo, not the final long-term side-view animation
contract.

The HackYard schedule must not wait for a complete platformer-specific character
matrix. New side-view animation sets can be created after the event.

## Asset strategy

The existing approved and staged characters are an advantage, but the hackathon
must not become an effort to complete the entire sprite inventory.

### Use now

- Approved generated characters that work in the relevant runtime.
- Existing neutral fallbacks when an exact theme/body combination is missing.
- The strongest existing themed characters for the onstage path.
- Static collectibles, obstacles, and goals where animation is not essential.
- Shared UI overlays generated at runtime where practical.

### Generate only when blocking the demo

- The minimal floor, wall, platform, collectible, hazard, and goal art needed
  for the two handcrafted levels.
- A small platformer background pack that makes the preview visually
  convincing: solid sky color, one far repeatable layer, one mid repeatable
  layer, and one near repeatable layer.
- A missing hero or theme asset only if it is part of the rehearsed demo path
  and no acceptable fallback exists.

### Do not require for HackYard

- The complete theme/body character matrix.
- Five complete theme gameplay atlases.
- Complete effect and multiplayer-overlay atlases.
- Unique maps for every theme.
- Bespoke animation for every collectible, door, hazard, or goal.
- Unique full-width painted background images for every platformer level.
- A child-facing AI sprite generation or revision editor. The mask-based skin
  and hair editor is part of the required builder flow.

All newly generated sprite assets still follow the existing recipe, validation,
preview, and recorded approval process. HackYard urgency is not permission to
bypass the sprite pipeline.

## Map representation

Maps should be small, deterministic, handcrafted data files. HackYard does not
need procedural generation or a child-facing level editor.

The sibling `game_editor` checkout contains developer-only editors for both
game types. The focused Maze editor paints walls and floors, places the
two-to-four player spawns, one key, and one locked exit required by the
HackYard rules, and can author optional bounded chaser or wanderer enemies.
It can also place optional sprite-backed damage hazards and neutral grey solid
obstacles while keeping their gameplay meaning semantic in `MapSpec`.
Its draggable player character is preview-only rather than `MapSpec` data, and
enemy, hazard, and obstacle authoring does not promote those optional systems
into the guaranteed Maze runtime scope. The richer Platformer editor exists
because a continuous side-scrolling level needs faster visual iteration for platform spacing,
hazards, collectibles, checkpoints, enemies, and goals. Building these tools is
pre-HackYard support work rather than part of the competition's 48-hour scope.

The Platformer editor has two synchronized presentations of one continuous
map:

- **Complete Map** fits the level from beginning to end and shows the current
  gameplay-camera rectangle. Clicking the overview repositions that rectangle.
- **Gameplay View** shows one camera-sized area at an editing scale for precise
  terrain painting and object placement. Previous/next and up/down controls move
  the editing camera; they do not divide the map into independent screens.

Until theme atlases exist, the editor draws semantic colored shapes for ground,
platforms, hazards, spawns, coins, checkpoints, and goals. These placeholders
are renderer fallbacks and are never stored as colors or temporary sprite paths
inside `MapSpec`.

For the HackYard platformer, the background should use the same principle:
simple semantic presentation metadata plus renderer fallbacks. The runtime can
ship with one hardcoded or map-selected parallax background made from
repeatable horizontal layers. Those layers should scroll at different fractions
of camera movement to create depth:

```text
sky color        -> fixed or nearly fixed
far layer        -> slow repeat-x movement
middle layer     -> medium repeat-x movement
near layer       -> faster repeat-x movement
gameplay tiles   -> full camera movement
```

Do not generate a single giant background image for the whole level during
HackYard. It would look good once, but it would make map edits expensive and
would not demonstrate the reusable content model. If final art is not ready,
canvas-drawn placeholder strips are acceptable as long as the parallax motion
is visible in the playable platformer.

Maze and Platformer use different movement systems, but they should share one
outer map format:

```text
MapSpec
  + runtime ID
  + dimensions and tile size
  + tile legend
  + tile layers
  + placed gameplay objects
  + presentation metadata
```

Collision comes from map data, never from inspecting image pixels. Themes skin
semantic tile and object roles without changing the level geometry.

Example:

```json
{
  "schemaVersion": 1,
  "id": "maze_small_01",
  "runtime": "top_down_v1",
  "tileSize": 64,
  "width": 12,
  "height": 5,
  "legend": {
    "#": "solid_wall",
    ".": "floor"
  },
  "tiles": [
    "############",
    "#..........#",
    "#..##......#",
    "#..........#",
    "############"
  ],
  "objects": [
    { "type": "player_spawn", "x": 2, "y": 2, "slot": 1 },
    { "type": "player_spawn", "x": 9, "y": 3, "slot": 2 },
    { "type": "key", "x": 5, "y": 3, "id": "key_1" },
    { "type": "exit", "x": 10, "y": 1, "requires": "key_1" }
  ]
}
```

A platformer map uses the same envelope with `runtime: "platformer_v1"` and
semantic objects such as `coin`, `hazard`, `checkpoint`, and `goal`. Its tile
grid is interpreted by horizontal movement and gravity rather than top-down
movement.

For HackYard, create exactly one strong Maze map and five strong Platformer maps.
The first Platformer map remains the existing Space layout. The second is an
88-column by 12-row Emberkeep dragons layout with a 16-column by 9-row camera,
theme-specific terrain and object art, two named enemies, the shared fireworks
victory effect, and its own audio pack. The third is an 88-column by 12-row
neutral Green Hills layout with the same 16-column by 9-row camera, a bright
layered castle-and-waterfalls background, full-cell grass-and-earth terrain,
wooden crates, waterfall hazards, neutral enemies, the shared fireworks victory
effect, and its own audio pack. The fourth is an 88-column by 12-row haunted
graveyard layout with the same camera, Haunted terrain, multiple obstacle art
choices, offset eight-frame graveyard-hand hazards, the Haunted Spirit Orb and
Neutral Ghost enemies, the shared fireworks victory effect, and its own audio
pack. Map data remains semantic: background
and victory presentation are referenced by stable IDs, while sound-pack choice
stays in `GameSpec` or editor preview state rather than `MapSpec`.
The fifth is an 88-column by 12-row Ice World layout with the same camera,
long frozen runways, ice platforms, frozen blocks, crystal-spike hazards, a
checkpoint, a goal, map-backed enemies, and the Glacier Brute boss encounter.
The boss chases within its bounded view and lobs a four-frame spinning ice
crystal along the shared parabolic projectile path. It stores
`physics.groundTractionScale: 0.15`; other maps explicitly store `1`. The
website runtime and Game Editor preview must apply the same fixed-step grounded
acceleration and braking scale. Ice presentation comes from the background and
recipe-backed terrain assets, never from collision-pixel inspection.

## Runtime architecture

HackYard introduces two deliberately narrow runtime families:

```text
top_down_v1   -> four-direction movement used by Maze
platformer_v1 -> horizontal movement, gravity, and jumping
```

Both runtimes share as much infrastructure as practical:

- Asset lookup by stable ID.
- `GameSpec` validation.
- Map loading and semantic object placement.
- Fixed-step simulation.
- Player identity and spawn handling.
- Collectibles, goals, scoring, timers, and match results.
- Input messages and state snapshots.
- Builder-to-preview updates.

The movement and collision rules remain runtime-specific. Platformer physics
must not be forced into the top-down engine merely to claim that there is only
one runtime.

The exact HackYard simulation, collision, collider, trigger, and movement-mode
contracts are locked in [`PHYSICS.md`](./PHYSICS.md) and the trusted profiles
under [`physics-specs/`](./physics-specs/). `GameSpec` also references a
revisioned document under [`game-physics/`](./game-physics/) containing bounded,
player-facing tuning such as run speed, jump height, and flight mode. Cooper may
translate a request into a validated patch to that game-owned document; themes,
maps, characters, and appearance choices do not change physics implicitly. The
Ice World is an explicit map-authored rule rather than an inferred theme effect:
its `groundTractionScale` changes grounded control because the value is present
in MapSpec.

## Networking architecture

### Long-term direction

Splat Lab! should use a central authoritative room server for internet
multiplayer. Clients send player intentions to the server; they do not send raw
browser key events directly to every other player and they do not decide
authoritative outcomes independently.

Keyboard, touch, and gamepad input is normalized into a device-independent
message such as:

```json
{
  "sequence": 1842,
  "moveX": 1,
  "moveY": 0,
  "jumpPressed": true
}
```

The authoritative flow is:

```text
keyboard, touch, or gamepad
            |
            v
normalized player intention
            |
            v
authoritative room simulation
            |
            +-- movement and physics
            +-- collision
            +-- collectibles and keys
            +-- doors, goals, and winners
            |
            v
state snapshots sent to every client
```

The browser predicts its own movement so controls feel immediate. When the
server acknowledges inputs and sends authoritative state, the browser corrects
disagreement and replays any unacknowledged inputs. Remote players are rendered
by interpolating between received snapshots.

Maze is comparatively forgiving because small movement corrections are less
visible. Platformer networking is harder because gravity, jump timing, and
ledge collisions make disagreement obvious. Browser and server should
therefore share the same fixed-step movement, physics, collision, and ruleset
code wherever possible.

### Service boundaries

The long-term system has three distinct responsibilities:

- **Web application and database:** accounts, saved games, `GameSpec`, map
  definitions, asset metadata, room invitations, and durable results.
- **Realtime room server:** the authoritative simulation for each active match,
  reached through a persistent connection such as WebSockets.
- **Browser runtime:** rendering, audio, input collection, local prediction,
  interpolation, builder controls, and player-facing UI.

The database should not record every movement frame. An active room keeps its
simulation state in memory, while durable game definitions and final results
are stored separately.

Peer-to-peer networking is not the default plan. It creates connection and NAT
problems, makes one player's device a fragile host, complicates host migration,
and allows clients to disagree or cheat about important results. Even a
WebRTC-based peer-to-peer design normally needs signaling infrastructure.

### Single-player execution

All games should share the same simulation code, but ordinary single-player
play does not need to make a network round trip through the central room server.
The client should depend on a session boundary with two interchangeable
transports:

```text
game client
  +-- LocalSession   -> shared simulation running in the browser
  +-- NetworkSession -> shared simulation running on the room server
```

The builder preview and ordinary single-player Platformer should use
`LocalSession` so changes and controls remain immediate. Multiplayer uses
`NetworkSession`, where the room server is authoritative. A one-player online
room is acceptable when testing Maze networking or when a future competitive
solo mode needs server authority, but it is not required for every solo play
session.

This keeps one implementation of movement, collision, maps, and rules without
making every single-player game depend permanently on connectivity and realtime
server capacity.

### HackYard networking boundary

For HackYard, one always-on realtime server process is enough. It can:

1. Create and join invite-only rooms using short codes.
2. Host one authoritative simulation per room.
3. Support two to four players.
4. Receive normalized input messages.
5. Broadcast compact state snapshots.
6. Decide key ownership, exit state, and the Maze winner.
7. Retain a player slot briefly after disconnection.
8. Send a complete state snapshot when that player reconnects.

Maze multiplayer is guaranteed. Platformer multiplayer is a stretch goal after
the local Platformer, builder flow, and Maze networking are stable. The
Platformer should still use the shared simulation boundary from the start so it
can gain authoritative multiplayer without an architectural rewrite.

Long-term horizontal scaling does not change the protocol. Each room remains
owned by one simulation process; a room allocator later decides which process
hosts it.

## Shared game specification

The builder produces a validated `GameSpec` rather than generating arbitrary
game code. A minimal HackYard specification can select the runtime, ruleset,
theme, map, hero, and match settings:

```json
{
  "schemaVersion": 1,
  "runtime": "platformer_v1",
  "ruleset": "reach_goal",
  "theme": "space",
  "mapId": "platformer_small_01",
  "physics": {
    "specId": "platformer_small_01",
    "revision": 1
  },
  "heroAssetId": "space_human_01",
  "appearance": {
    "skinToneId": "skin_04",
    "hairColorId": "hair_03"
  },
  "audio": {
    "soundPackId": "space_basic_v1",
    "musicEnabled": true,
    "effectsEnabled": true,
    "musicLevel": 0.6,
    "effectsLevel": 0.8
  },
  "match": {
    "minPlayers": 1,
    "maxPlayers": 1
  }
}
```

Changing a guided choice mutates this structured specification and refreshes
the preview. Natural-language physics input may only produce a constrained,
validated patch to the referenced `GamePhysicsSpec`. It must not generate or
execute arbitrary game code during the match.

## Two-day implementation order

The order protects the complete demonstration path rather than maximizing the
number of partially implemented systems.

### Phase 1: shared vertical slice

- Define the minimal `GameSpec`, `GamePhysicsSpec`, and `MapSpec` schemas.
- Load and render the pre-HackYard Platformer map from semantic tile and object
  data.
- Render the Platformer preview over one layered repeat-x parallax background.
- Load one approved character by asset ID.
- Reuse the sprite-viewer renderer and mask palettes in a simplified embedded
  character editor.
- Add the left-panel transition from character selection to character editing.
- Apply skin-tone and hair-color choices to the character editor, live game
  preview, and `GameSpec`.
- Add separate Play and Pause controls backed by the complete **All frames**
  playback sequence, with play state preserved across appearance changes.
- Implement the shared fixed-step simulation boundary.
- Connect builder choices to immediate preview updates.

### Phase 2: complete Maze locally

- Add four-direction movement and wall collision.
- Add the key, exit, win condition, and reset flow.
- Verify the complete builder-to-play path with the strongest Maze theme and
  characters.

### Phase 3: network Maze

- Add room creation and joining.
- Send normalized inputs to the authoritative room server.
- Synchronize players and authoritative key/exit/winner state.
- Add basic disconnect, reconnect, and full-snapshot recovery.

### Phase 4: complete the narrow Platformer

- Add horizontal movement, gravity, grounded jumping, and static collision.
- Add bounded directional flight using the same static collision and trigger
  rules.
- Add coins, shared extra-life pickups, one hazard, respawning, the goal, and level completion.
- Add bounded patroller and chaser enemies, stomp defeat, and side/bottom contact
  defeat on the first Space map.
- Start `space_basic_v1` after the play interaction and connect semantic audio
  cues for jumping, landing, coins, enemy defeat, player defeat/respawn,
  checkpoints, and the goal.
- Add `platformer_emberkeep_01` as the second Platformer map: 88 columns by 12
  rows, a 16-by-9 camera, `dragons_emberkeep_01`, Emberkeep ground/platform/
  obstacle/lava art, Emberkeep coin/checkpoint/goal flags, `dragon_ghost_01` as
  enemy #1, and `dragon_dragon_01` (Dragon Dragon 01) as enemy #2 with its
  bounded mouth-height animated fireball attack.
- Start `dragons_emberkeep_v1` for the Emberkeep configuration and trigger
  its `fire` cue when Dragon Dragon 01 shoots; trigger
  `shared_victory_burst_01` fireworks when its goal completes the level.
- Add `platformer_green_hills_01` as the third Platformer map: 88 columns by 12
  rows, a 16-by-9 camera, `neutral_green_hills_01`, full-cell Green Hills ground
  and platform blocks, wooden-crate obstacles, repeatable animated full-height
  waterfall hazards with upward spray, and the approved neutral Ghost, Robot,
  and Zombie enemies.
- Add the Green Hills coin, checkpoint, goal, and `neutral_green_hills_v1`
  sound pack; trigger `shared_victory_burst_01` when its goal completes the
  level.
- Add `platformer_haunted_graveyard_01` as the fourth Platformer map: 88 columns
  by 12 rows, a 16-by-9 camera, the haunted graveyard background, full-cell
  Haunted ground and platform blocks, both a typical stone block and the
  approved tombstone as selectable obstacle sprites, and an eight-frame
  graveyard hazard with a skeleton hand that swipes upward. Offset neighboring
  hazard loops with each placement's 1-based `animationStartFrame`.
- Add `haunted_spirit_orb_01` as enemy #1 and `neutral_ghost_01` as enemy #2;
  finish Haunted Human, Ghost, Zombie, Dragon, and Robot character sheets, add
  the haunted sound pack, and trigger `shared_victory_burst_01` when the goal
  completes the level.
- Add `ice_world_01` as the fifth Platformer map: 88 columns by 12 rows, a
  16-by-9 camera, long frozen runways, ice platforms and blocks, crystal-spike
  hazards, approved neutral enemies, one checkpoint, one goal, and the shared
  fireworks victory effect. Add bounded `physics.groundTractionScale` support
  to MapSpec, the Game Editor control and preview, and the website player; set
  this map to 15% traction while all existing maps remain at 100%.
- Add `ice_world_boss_01` as the map's single large boss and
  `ice_world_crystal_projectile_01` as its four-frame end-over-end projectile.
  Configure its range, cooldown, and arc height in the checked-in map through
  the existing `lobbed_projectile` contract, and expose the same authored
  behavior in the Game Editor preview and website player.
- Add the dedicated Ice World background/terrain presentation and
  `ice_world_v1` sound pack. Ice terrain follows the same recipe, staged
  candidate, validation, Sprite Viewer approval, and suffix-free runtime-asset
  path as every other Platformer theme; it has no theme-specific procedural
  rendering fallback.
- Polish the parallax background enough that camera movement visibly sells the
  side-scroller.
- Reuse approved character animations and the strongest available theme art.
- Polish camera behavior, feedback, and all five handcrafted Platformer levels.

### Phase 5: presentation and resilience

- Add **Coming soon** badges and disabled behavior for unavailable game types.
- Improve loading, empty, error, and reconnect states.
- Rehearse the exact onstage creation and play path.
- Fix visible rough edges before adding any optional mechanic.

### Stretch goals, in order

1. Authoritative Platformer multiplayer with client prediction and
   reconciliation.
2. A sixth Platformer visual theme or a second Maze visual theme.
3. An additional approved music or effects pack beyond the five core
   Platformer map packs.
4. One constrained natural-language `GamePhysicsSpec` patch, such as higher
   jumping or flight mode.
5. A child-facing AI sprite revision path using the existing locked pipeline.

## Explicit HackYard non-goals

- Treasure Rush, Tag Chase, Survival Arena, or top-down adventure as additional
  playable modes.
- Endless runner gameplay.
- A general map or level editor.
- Procedural map generation.
- Public matchmaking, public rooms, spectators, public chat, or voice chat.
- Full anti-cheat, lag compensation, regional matchmaking, or room migration.
- A complete theme/body asset matrix.
- Perfect bespoke platformer animations for every existing character.
- Freeform drawing, pixel editing, costume generation, or AI sprite revision
  inside the required mask-based character editor.
- Physics modes beyond grounded jumping and bounded directional flight, or a
  large campaign.
- Arbitrary AI-authored gameplay code.
- Production-scale distributed room infrastructure.

These are postponements, not removals from the long-term Splat Lab! direction.

## Scope rule

Once both short game loops, the builder-to-preview transformation, and Maze
multiplayer work reliably, remaining time should go to visual polish,
rehearsal, and failure recovery. It should not go toward a third game type or a
larger asset matrix.

A convincing HackYard result is:

> Choose Platformer or Maze, choose a world and hero, see the game transform,
> and immediately play it—with Maze proving multiplayer and Platformer proving
> the visual ambition of Splat Lab!
