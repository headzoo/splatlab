# Splat Lab! Physics Specification

## Status and authority

This document is the normative movement and collision contract for the
HackYard `top_down_v1` and `platformer_v1` runtimes. It turns the behavioral
scope in [`HACKYARD.md`](./HACKYARD.md) into exact, testable mechanics.

The machine-readable sources of truth are:

- [`physics-specs/registry.json`](./physics-specs/registry.json), which maps a
  runtime to its default profile.
- [`physics-specs/top_down_standard_v1.json`](./physics-specs/top_down_standard_v1.json).
- [`physics-specs/platformer_standard_v1.json`](./physics-specs/platformer_standard_v1.json).
- [`physics-specs/physics-profile.schema.json`](./physics-specs/physics-profile.schema.json),
  which describes the profile envelope.
- [`game-physics/platformer_small_01.json`](./game-physics/platformer_small_01.json),
  the first user/Cooper-editable game instance.
- [`game-physics/game-physics.schema.json`](./game-physics/game-physics.schema.json),
  which bounds the editable values and movement modes.
- [`game-physics/cooper-physics-patch.schema.json`](./game-physics/cooper-physics-patch.schema.json),
  which defines the only patch envelope Cooper may submit.

If prose and JSON disagree, the machine-readable document controls at its
layer. Both the trusted profile and the game-owned document must pass validation
before their resolved physics can be used by a runtime.

Physics resolves in two layers. The runtime registry selects a trusted base
profile that owns the simulation, collision, collider, and trigger contracts.
Each saved game then owns a revisioned `GamePhysicsSpec` containing the
player-facing movement values Cooper may change. Maps, themes, character
bodies, costumes, and appearance settings do not silently change physics. A
platformer map may explicitly set a bounded `physics.gravityScale` so different
levels can have different gravity while retaining the game's trusted launch
impulse, movement values, collision, and trigger contracts.

This separation keeps customization real without letting a generated patch
disable wall collision, change the simulation tick, or derive gameplay from
sprite pixels.

## Shared units and simulation

- One world tile is `64 × 64` world pixels.
- Position and velocity use float64 values during simulation.
- The origin is at the top left. Positive X points right and positive Y points
  down.
- Player position is the bottom-center point at the character's feet.
- Simulation runs at a fixed 60 Hz, so `dt = 1 / 60` second.
- Rendering may run at a different rate and interpolates between completed
  simulation states. Rendering never supplies a variable physics delta.
- A frame-driven local loop clamps one measured frame to `0.25` second and runs
  at most five catch-up ticks before yielding to rendering. It never replaces
  fixed ticks with one large variable step.
- An authoritative server numbers and executes the same fixed ticks in order.
  State snapshots may be sent less often, but snapshot frequency does not alter
  simulation frequency.

The browser and server must load the same profile ID and use the same movement
and collision implementation. Profile IDs are included in room initialization
and replay/debug records. A client with a different profile ID must not predict
that room.

## Shared input contract

Inputs describe player intent rather than raw keys:

```json
{
  "sequence": 1842,
  "moveX": 1,
  "moveY": 0,
  "jumpPressed": true,
  "jumpHeld": true
}
```

- `moveX` and `moveY` are clamped to `[-1, 1]`.
- `jumpPressed` is true only on the up-to-down edge of the mapped jump control.
- `jumpHeld` remains true while that control is held.
- The current Maze profile ignores both jump fields. A planned profile revision
  uses `jumpPressed` for the bounded one-cell hazard hop described below.
- Grounded Platformer ignores `moveY`; Platformer flight uses it for vertical
  intent.
- Keyboard, touch, and gamepad adapters must produce the same normalized shape.

## Default profile resolution

For the HackYard build:

```text
top_down_v1   -> top_down_standard_v1
platformer_v1 -> platformer_standard_v1
```

These mappings are explicit in `physics-specs/registry.json`. Discovery order
or filename sorting must never decide which profile is active.

## User- and Cooper-editable game physics

The base profiles above are trusted engine defaults. They are not the only
game feel a player may create. A `GameSpec` may reference a `GamePhysicsSpec` by
ID and revision:

```json
{
  "runtime": "platformer_v1",
  "physics": {
    "specId": "platformer_small_01",
    "revision": 1
  }
}
```

The editable document uses child- and agent-meaningful values such as jump
height in tiles and time to the apex. The resolver compiles those values into
the pixel velocities and accelerations consumed by the fixed-step runtime. It
does not ask Cooper to coordinate raw gravity and launch velocity correctly.

For example, “Make the player bounce higher” can change only:

```json
{
  "op": "replace",
  "path": "/verticalMovement/groundedJump/jumpHeightTiles",
  "value": 3.5
}
```

The current `timeToApexSeconds` remains unchanged, so the resolver derives a
higher but equally responsive arc. “Make the jump floatier” changes the apex
time. “Make the player faster” changes the run speed in tiles per second.

“Make the player fly” is not faked by setting gravity to zero. Cooper switches
the explicit mode:

```json
{
  "op": "replace",
  "path": "/verticalMovement/mode",
  "value": "flight"
}
```

Both the grounded-jump and flight settings remain in the document, so switching
back restores the previous jump tuning rather than recreating defaults.

### Cooper patch boundary

Cooper submits a constrained patch containing the base revision, the user's
prompt, and one or more `replace` operations. The application:

1. Rejects a stale base revision.
2. Rejects operations outside `editPolicy.allowedPaths`.
3. Applies the operations to a copy, never the active document.
4. Records `lastEditedBy: "cooper"` and the originating prompt.
5. Increments the revision.
6. Validates and resolves the entire result.
7. Publishes it only if validation passes.

An active preview applies the accepted revision on the next simulation reset.
An active network room remains pinned to the revision and resolved physics with
which it started; it never changes physics halfway through a match.

For a saved game, the website owns this boundary at runtime.
[`game-physics/platformer_small_01.json`](./game-physics/platformer_small_01.json)
is an immutable template: Cooper's first accepted patch deep-clones it into that
game's `Game.spec.physicsDocument`, and every later patch revises the fork.
`apps/website/src/lib/game-physics.ts` ports the rules above and adds the
level-design envelope check, and both `/build` and `/play` resolve the fork ahead
of the catalog file. `tools/physics.py` remains the catalog authority and the CI
validator for the checked-in documents; it does not see per-game forks.

The editable values are bounded as follows:

- Run or top-down speed: `0.5–12 tiles/s`.
- Ground acceleration/deceleration times: `0.05–2 s`.
- Jump height: `0.5–8 tiles`.
- Time to jump apex: `0.15–1.5 s`.
- Maximum falling speed: `2–30 tiles/s`.
- Coyote time and jump buffer: `0–12 ticks`.
- Early-release multiplier: `0.1–1`.
- Flight rise/fall speed: `0.5–10 tiles/s`.
- Flight acceleration/deceleration times: `0.05–2 s`.
- Per-map gravity scale: `0.5–2`, where `1` is the resolved game default.

Collider geometry, collision semantics, trigger volumes, tick rate, catch-up
rules, numerical precision, and protected fields are inherited from the base
profile and are not Cooper-editable.

### Per-map gravity

Every `platformer_v1` `MapSpec` stores an explicit gravity multiplier:

```json
{
  "physics": {
    "gravityScale": 1
  }
}
```

The runtime multiplies the resolved downward acceleration by this value but
does not change the shared jump launch velocity. A value below `1` therefore
creates a higher, longer arc and a slower fall; a value above `1` creates a
shorter, faster arc. The Game Editor exposes the bounded value as a percentage
and persists it with the map. Editor preview changes apply immediately; a
networked room remains pinned to the value with which it started.

### Per-map ground traction

Every `platformer_v1` `MapSpec` stores an explicit grounded-control multiplier:

```json
{
  "physics": {
    "groundTractionScale": 1
  }
}
```

The allowed range is `0.05–2`, where `1` preserves the resolved game profile.
The runtime multiplies both grounded acceleration and grounded zero-input
deceleration by this value. It does not change maximum run speed, air control,
gravity, or jump launch velocity. Low values therefore make a character take
longer to build speed, coast after input is released, and take longer to reverse
direction. Ice World uses `0.15`; ordinary maps use `1`.

The Game Editor exposes the value as a percentage, persists it in MapSpec, and
applies it to the fixed-step preview immediately. Active network rooms remain
pinned to the value with which they started.

### Per-map respawn delay

Every `platformer_v1` `MapSpec` stores the total delay from player defeat to
respawn as a bounded gameplay rule:

```json
{
  "rules": {
    "respawnDelaySeconds": 2
  }
}
```

The allowed range is `0.5–10` seconds. The death animation plays inside this
window rather than extending it. The Game Editor persists the setting with the
map and its gameplay preview uses the same delay. Older imported maps without
the rule default to `2` seconds.

### Per-map starting lives

The same `rules` object carries how many lives the player begins a level with:

```json
{
  "rules": {
    "respawnDelaySeconds": 2,
    "startingLives": 3
  }
}
```

The allowed range is `1–99`. Because the count lives on the map rather than in
the running session, it applies to a fresh start and to a restart after a game
over, not only to the attempt in progress. Maps without the rule default to `3`.

A saved game may override the count for its own copy of the level: the site
stores it as `startingLives` on the game document and folds it into the map
before play, so the runtime still reads exactly one place for the value.

## Maze: `top_down_standard_v1`

### Movement

- Maximum speed is `224 px/s`, or `3.5 tiles/s`.
- Movement reaches the requested velocity immediately; there is no inertia.
- Releasing movement stops the player immediately.
- If the input vector length is greater than one, divide both components by its
  length before multiplying by maximum speed. Diagonal movement therefore has
  the same total speed as horizontal or vertical movement.
- Players do not physically block one another. The server may still detect
  player overlap for rules such as tagging in a later ruleset.

The velocity calculation is:

```text
intent = clamp(moveX, moveY)
if length(intent) > 1:
    intent = intent / length(intent)
velocity = intent * 224
```

### Facing and animation

The rendered direction remains one of `down`, `left`, `right`, or `up`, matching
the character-sheet row order. The last dominant non-zero input axis chooses
the direction. Equal axes retain the current facing direction, and zero input
retains the last facing direction. Facing affects presentation only; it never
rotates or changes the collision box.

### Collider

The player uses a `28 × 20 px` axis-aligned foot box. Relative to the player's
bottom-center world position, its top-left offset is `(-14, -20)`. Hats, wings,
weapons, and other visible pixels never expand this collider.

At maximum speed, one tile takes approximately `0.286` second to cross.

### Planned one-cell hazard hop

This traversal rule is recorded for the next `top_down_v1` profile revision;
it is not implemented by `top_down_standard_v1` yet.

- A hop travels in one cardinal direction over exactly one adjacent hazard cell.
- It succeeds only when the cell immediately beyond that hazard is walkable
  floor and contains no solid wall, obstacle, or closed door.
- A hop cannot travel diagonally, cross multiple hazards, or land on a hazard.
- The crossed hazard does not fire its overlap effect during a valid hop.
- An invalid hop does not move the player through the hazard.
- The authoritative server validates the same takeoff, crossed cell, and
  landing cell before committing the move in network play.

## Platformer: `platformer_standard_v1`

### Horizontal movement

- Maximum run speed: `320 px/s`, or `5 tiles/s`.
- Ground acceleration: `2,400 px/s²`.
- Ground deceleration with no input: `3,000 px/s²`.
- Air acceleration and air deceleration: `1,400 px/s²`.

Each tick computes `targetVx = moveX × 320` and moves `vx` toward that target
without overshooting. Grounded zero-input movement uses ground deceleration;
other grounded movement uses ground acceleration; airborne movement uses air
acceleration.

### Gravity and jump

- Gravity: `2,000 px/s²` downward.
- Maximum falling speed: `1,200 px/s`.
- Jump launch velocity: `-760 px/s`.
- Coyote time: 6 fixed ticks, exactly `100 ms` at 60 Hz.
- Jump buffer: 7 fixed ticks, approximately `116.7 ms` at 60 Hz.
- Releasing jump while rising applies `vy = vy × 0.55` once per jump.
- A jump requires grounded state or remaining coyote time.
- The player must release the jump control before another jump can be accepted.
- There are zero air jumps.

The full, unobstructed jump has this ideal continuous envelope:

- Apex height: `144.4 px`, or approximately `2.26 tiles`.
- Time to apex: `0.38 s`.
- Same-height flight time: `0.76 s`.
- Same-height range at maximum run speed: `243.2 px`, or `3.8 tiles`.
- Resulting launch angle at maximum run speed: approximately `67.2°` above the
  horizontal.

There is no independent jump-angle setting. At rest the launch is vertical,
or `90°`. Horizontal velocity combines with the vertical impulse to produce the
arc; a leftward jump mirrors the rightward one. Releasing jump early produces
a shorter arc.

### Flight mode

The default editable game document also carries a simple bounded flight mode:

- `moveY = -1` requests upward movement; `moveY = 1` requests downward
  movement.
- Maximum rise and fall speed are each `5 tiles/s`, or `320 px/s`.
- Time to maximum vertical speed is `0.2 s`, resolving to `1,600 px/s²`.
- Time to stop vertical movement is `0.15 s`, resolving to approximately
  `2,133.33 px/s²`.
- Gravity is disabled and jump inputs are ignored while flight is active.
- Static solid and one-way collision, triggers, checkpoints, goals, and hazards
  continue to work unchanged.

This is free directional flight inside the existing two-dimensional map. It
does not introduce altitude, foreground/background lanes, pass-through walls,
or a separate flying collision layer.

### Collider

The player uses a `32 × 48 px` axis-aligned body box. Relative to the player's
bottom-center world position, its top-left offset is `(-16, -48)`. The 64 px
sprite may extend above and beside this box without changing gameplay.

### Jump state

The runtime keeps these deterministic per-player fields in addition to position
and velocity:

```text
grounded
coyoteTicksRemaining
jumpBufferTicksRemaining
jumpReleaseArmed
jumpCutApplied
latestCheckpointId
```

Counters are evaluated once per fixed tick. `jumpPressed` loads the seven-tick
buffer. Grounded state refreshes the six-tick coyote counter; otherwise that
counter decreases toward zero. A successful jump clears the buffer and coyote
counter, disarms another jump until release, and resets `jumpCutApplied`. The
early-release multiplier is applied only once, when `jumpHeld` becomes false
while the player is still rising.

## Platformer fixed-step order

In `grounded_jump` mode, every `platformer_v1` tick executes in this order:

1. Clamp and normalize the input intent, detect the jump edge, and update the
   jump-buffer and coyote counters.
2. Move horizontal velocity toward its requested value using the grounded or
   airborne acceleration.
3. Accept a buffered jump if the release gate and grounded/coyote condition
   pass. Apply the launch velocity and clear the consumed counters.
4. Apply the one-time early-release cut when its condition passes.
5. Compute horizontal displacement from the updated horizontal velocity.
6. Compute vertical displacement using constant acceleration for this fixed
   interval: `dy = vy × dt + 0.5 × gravity × dt²`. Then update and clamp
   vertical velocity with `vy = min(vy + gravity × dt, maximumFallSpeed)`.
7. Sweep and resolve X against static solid tiles. One-way tiles do not block X.
   Clamp to the contacted face and set `vx = 0` on impact.
8. Sweep and resolve Y against static solid tiles. During downward movement,
   also resolve a one-way tile when the player's previous bottom edge was at or
   above that tile's top edge. One-way tiles do not block upward movement. Clamp
   to the contacted face and set `vy = 0` on impact. A downward blocking contact
   sets `grounded = true`; no other event may do so.
9. Evaluate collectible, extra-life, checkpoint, goal, hazard, and out-of-bounds triggers
   from the resolved position.
10. Commit the completed state for rendering, snapshots, and prediction replay.

This order is part of the profile contract. Implementations must not apply
gravity before jump acceptance on one transport and after it on another.

In `flight` mode, steps 1 through 4 instead clamp both movement axes, move `vx`
and `vy` toward their requested flight velocities, and ignore jump state.
There is no gravity step. X collision, Y collision, trigger evaluation, and
state commit then execute in the same order as grounded movement. Grounded and
jump counters are cleared when flight begins so switching back cannot release a
stored jump or stale coyote time.

## Collision contract

- Collision comes only from semantic `MapSpec` data, never sprite alpha or
  visible pixels.
- Players use axis-aligned bounding boxes.
- Static solids are resolved with swept, axis-separated collision in X-then-Y
  order so the player slides along walls instead of sticking.
- The collision skin is `0.001 px`; comparisons may use it to avoid treating
  exact resting contact as penetration.
- `top_down_v1` treats `solid`, `solid_wall`, and `closed_door` as blocking.
- `platformer_v1` treats `solid` as blocking from every direction. It treats
  `one_way` as blocking only when a descending player's previous bottom edge is
  at or above the tile's top edge, allowing movement through its sides and bottom.
- HackYard players do not block one another in either runtime.
- Coins, extra lives, checkpoints, goals, exits, keys, and hazards are overlap triggers, not
  physical solids unless their map semantics separately declare a solid tile.
- A trigger fires only when the player collider and trigger volume overlap with
  positive area. Touching exactly at an edge is not an overlap.

HackYard intentionally excludes slopes, moving platforms, step-up logic,
ladders, swimming, bounce materials, wall jumps, and sprite-pixel collision.

### Map-cell anchors and trigger volumes

A map object at integer `(x, y)` owns the cell from `(x × 64, y × 64)` through
`((x + 1) × 64, (y + 1) × 64)`. Trigger volumes are derived from that cell:

- `cell_center` centers the declared width and height on the center of the cell.
- `cell_bottom_center` centers the width horizontally and aligns the bottom of
  the volume with the bottom of the cell.
- `cell_bounds` uses the full 64 × 64 cell.

Maze uses a centered `32 × 32 px` key trigger and a centered `48 × 48 px` exit
trigger. If both overlap in one tick, the key attempt is evaluated before the
exit attempt, allowing the authoritative ruleset to resolve ownership before
checking the finish condition.

Platformer uses these volumes:

- Collectible: centered `32 × 32 px`.
- Extra life: centered `32 × 32 px`.
- Checkpoint: bottom-centered `32 × 64 px`.
- Goal: bottom-centered `48 × 64 px`.
- Hazard tile: full-cell `64 × 64 px`.

A Platformer spawn at map cell `(x, y)` resolves to player foot position
`((x + 0.5) × 64, (y + 1) × 64)`, which places the player's bottom on the
cell boundary. A Maze spawn resolves to `((x + 0.5) × 64, (y + 0.5) × 64)`.
Spawn and checkpoint cells must not overlap a solid or hazard at their resolved
player position.

## Platformer triggers and respawn

After collision resolution, simultaneous triggers use this priority:

```text
out of bounds -> hazard -> goal -> checkpoint -> extra life -> collectible
```

A respawn or successful finish is terminal for trigger processing in that tick.
If neither occurs, checkpoint, extra-life, and collectible responses may all be committed.

Then:

- A collectible overlap collects it once and increments score.
- An extra-life overlap collects it once and increments remaining lives by one.
- A checkpoint overlap becomes the latest respawn point.
- A goal overlap finishes the level.
- A hazard overlap respawns the player.
- A player whose collider moves more than one tile below the map bounds
  respawns.

Respawn uses the latest checkpoint, or the initial spawn if no checkpoint has
been reached. It clears both velocity components, clears jump counters and jump
cut state, and begins from a non-overlapping spawn position. The runtime must
not preserve falling or running momentum through a respawn.

## Level-authoring envelope

The Platformer critical path is designed below the theoretical maximum:

- Maximum critical-path gap: 3 tiles.
- Maximum direct upward rise: 2 tiles.
- Preferred landing width: at least 2 tiles.
- Minimum landing width: 1 tile for deliberate stepping stones.
- Required jump-height margin above a critical rise: 12 px.
- Required jump-range margin beyond a critical gap: 32 px.

The locked ideal jump clears a two-tile rise by `16.4 px` and a three-tile gap
by `51.2 px`, satisfying those margins. Designers must not require a player to
use coyote time, a one-frame input, or the absolute edge of the collider to
finish the level.

The current Space map uses the canonical 64 px tile size and its two-tile hazard
run remains inside this envelope.

## Presentation is not physics

Camera smoothing, look-ahead, parallax, animation rate, sprite mirroring,
particles, sound, screen shake, and damage flashes may respond to physics state,
but cannot feed values back into the simulation. Changing character art or
appearance masks must not reset movement state or change a collider.

## Validation and change process

Validate every checked-in profile and its registry mapping:

```bash
python3 tools/physics.py validate
```

Print the derived movement envelope:

```bash
python3 tools/physics.py report
```

Resolve and inspect every editable game-physics document:

```bash
python3 tools/physics.py game-report
```

Run the focused tests:

```bash
python3 -m unittest tests.test_physics
```

Tests lock the default registry, units, collider anchors, diagonal normalization,
jump calculations, level-design margins, editable-value bounds, Cooper's patch
boundary, grounded-to-flight switching, and compatibility with the checked-in
Platformer map.

Physics changes require a new profile ID when they can alter replay, prediction,
collision algorithms, protected geometry, or the meaning of a movement mode.
Ordinary game-feel changes update the game's `GamePhysicsSpec` revision instead
of creating a new base profile. Do not silently replace the physics revision in
a saved game or active room. New base modes and tuning changes both require the
validator and tests; new base behavior also requires replaying the handcrafted
level and checking that browser and server simulations agree for the same input
sequence.
