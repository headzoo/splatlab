# Lock Down the Top-Down Sprite and Tileset Contracts

We need to freeze a small set of technical art rules before generating anything. Otherwise the sprites may look good individually but fail when mixed in the same game.

## 1. Lock the visual style

Use:

- Bright, chunky pixel art
- Three-quarter top-down perspective
- Consistent dark outline
- Simple silhouettes readable at small sizes
- Transparent backgrounds
- No baked shadows, health bars, names, or player colors

Every theme and creature must follow the same perspective and proportions.

## 2. Lock the world scale

- Tile size: `64 × 64` runtime pixels
- Character frame: `64 × 64` runtime pixels
- Character anchor: bottom-center at `(32, 56)`
- Standard character collision box: approximately `36 × 28`, positioned around the feet
- Runtime scaling: integer-only with nearest-neighbor rendering

Artwork can be generated at higher resolution, but it must be normalized into this runtime format.

## 3. Lock the character sheet layout

Each character should use one `5 × 4` sheet:

```text
             Idle   Walk 1   Walk 2   Walk 3   Walk 4
Down
Left
Right
Up
```

At 64 pixels per frame, the final sheet is:

```text
320 × 256 pixels
```

Required animations:

- `idle_down`, `idle_left`, `idle_right`, `idle_up`
- `walk_down`, `walk_left`, `walk_right`, `walk_up`
- Four walking frames per direction
- Eight frames per second by default

The four walk columns are gait phases, not four interchangeable moving poses:

```text
Walk 1   Contact A: one foot is visibly forward and the other is back
Walk 2   Passing A: the rear foot passes the planted foot
Walk 3   Contact B: the opposite foot is visibly forward
Walk 4   Passing B: the first foot passes the planted foot
```

This alternating stride must read in every grounded direction. Left and right
rows must not repeat one leg-forward silhouette while only the arms or torso
change. The up row must visibly alternate which foot advances even though the
body faces away. Non-legged bodies need an equivalent directional locomotion
cycle, such as an alternating tail/wisp sweep, rather than four near-identical
poses.

The approved `5 × 4` sheet remains locomotion-only. Attack and defeat artwork
uses additive, play-once `eventSheets` so the base character contract never
changes. Weapons remain separate sprites rendered from trusted attachment data;
they are never baked into either the locomotion or character event sheet.

## 4. Lock character boundaries

All characters must:

- Keep their feet on the same anchor point
- Have approximately the same visible scale
- Fit inside the frame without clipping
- Use a shared collision profile regardless of costume
- Face clearly in all four directions
- Preserve recognizable colors between frames
- Avoid loose accessories extending outside the frame

Large creatures such as dragons can look larger while still using the same gameplay collision profile.

Platformer bosses are the deliberate exception to the standard character
geometry. Each boss frame is `128 × 128`, occupies a `2 × 2` group of the
canonical `64 × 64` art modules, anchors bottom-center at `(64, 120)`, and uses
the fixed `boss_large_v1` collision profile. A boss is still one sprite, one
collider, and one enemy record. It has only left and right rows; the runtime
chooses the row by the player's horizontal position, not by vertical position
or necessarily by travel direction.

## 4a. Lock configurable human skin tone and hair color

Human characters remain part of the supported body library. Skin tone is
runtime appearance data and must not be fixed by duplicating a complete human
spritesheet for every tone or by tinting the entire sprite. Hair color is a
second, independent runtime appearance value; it must not be coupled to skin.

Every human character recipe must declare `body: "human"` and an
`appearance.skinTone` object containing:

- `palette`: the stable palette ID `skin_tones_v1`.
- `mask`: a same-size RGBA PNG named `<asset-id>-skin-mask.png` under
  `sprite-masks/`.
- `minimumPixelsPerFrame`: the minimum expected mask coverage used by
  validation.

It must also declare `appearance.hairColor` with palette `hair_colors_v1`, mask
`sprite-masks/<asset-id>-hair-mask.png`, and its own minimum coverage. Both masks
use the same four-index RGBA format, but their opaque pixels must never overlap.

The mask uses transparent pixels for non-skin artwork. Selected skin pixels use
opaque grayscale indexes `0`, `85`, `170`, and `255`, representing shadow,
midtone, light, and highlight. Hair, eyes, facial outlines, clothing, armor,
accessories, and UI remain outside the mask. Recoloring replaces only those four
indexes with the selected four-color ramp while preserving the runtime
spritesheet's original alpha.

The default palette and six user-selectable ramps live in
`sprite-palettes/skin_tones_v1.json`. Tone IDs are stable appearance values;
their labels are neutral numbered swatches rather than racial or ethnic
categories. The default is `skin_04`, so a missing preference does not silently
make light skin the universal neutral.

The hair palette in `sprite-palettes/hair_colors_v1.json` provides stable
natural-color options including black, brown, auburn, red, blond, platinum, and
gray. Hair geometry remains part of the chosen base sprite; the option changes
color only and does not imply that every hairstyle is visible from every
direction or under every hat, hood, or helmet.

The pipeline must fail a human asset when its mask is missing, has different
dimensions, is not RGBA PNG, uses non-binary membership alpha, contains colors
outside the four shade indexes, extends beyond opaque character pixels, or has
insufficient coverage in any frame, or overlaps the other appearance mask.
Human review must play all directions with multiple light and dark skin ramps
and multiple hair colors to catch semantically incorrect mask coverage.

Generate the two masks together with `python3 tools/sprites.py
appearance-masks --replace`. The joint pass removes isolated color matches and
admits only immediately adjacent warm accent pixels, preventing unrecolored
peach highlights without flooding into brown clothing or boots. A recipe may
set zero minimum hair coverage for directions where a hood or helmet completely
hides the hair.

## 5. Lock the tileset contract

Each theme should provide:

- Two floor tiles
- Sixteen connected-wall tiles
- One closed door
- One open door
- One exit or goal tile
- One hazard tile
- Three solid obstacles
- Four decorative, non-colliding props

For connected walls, use a fixed four-neighbor bitmask:

```text
North = 1
East  = 2
South = 4
West  = 8
```

That produces tile indexes `0–15`. Every theme then implements exactly the same wall shapes.

Collision must come from map data—not image analysis. A tile or object explicitly says whether it is `floor`, `solid`, `hazard`, `door`, or `decorative`.

## 6. Separate art from gameplay

A barrel and tombstone may both use:

```json
{
  "collisionProfile": "solid_tile",
  "behavior": "solid"
}
```

A pirate ghost and ninja zombie may both use:

```json
{
  "collisionProfile": "character_small_v1",
  "animations": ["idle", "walk"]
}
```

Their images change, but their gameplay contract does not.

Player appearance travels separately from the character asset ID:

```json
{
  "assetId": "pirate_human_01",
  "appearance": {
    "skinToneId": "skin_04",
    "hairColorId": "hair_03"
  }
}
```

Multiplayer clients synchronize both stable appearance IDs and perform the same
cached palette replacement locally. Non-human bodies ignore `skinToneId` and
`hairColorId`.

## 7. Define the asset package format

Every asset should ship with metadata similar to:

```json
{
  "id": "ghost_pirate_01",
  "kind": "character",
  "runtime": "top_down_v1",
  "body": "ghost",
  "themeTags": ["pirates"],
  "sheet": {
    "url": "/assets/characters/ghost_pirate_01.png",
    "frameWidth": 64,
    "frameHeight": 64,
    "columns": 5,
    "rows": 4
  },
  "anchor": {
    "x": 32,
    "y": 56
  },
  "collisionProfile": "character_small_v1"
}
```

## 8. Create validation criteria

Before accepting an asset, check automatically:

- PNG format
- Transparent background
- Exact dimensions
- Expected row and column count
- No pixels outside the allowed frame boundaries
- Valid asset ID and metadata
- Referenced files exist
- Required animations are declared
- Human skin-tone and hair-color masks and palette references satisfy the appearance contract

Visual inspection must additionally check frame continuity, perspective, scale, and foot placement.
Human characters must also be previewed with multiple skin-tone ramps and hair
colors to verify that face, ears, hands, and hair recolor independently without
changing clothing, outlines, headwear, or held items.
For characters, reviewers must play each direction separately and verify the
Contact A -> Passing A -> Contact B -> Passing B gait. A sheet fails review if
the legs remain in the same stride position while only the arms, body bob, or
whole-sprite placement changes.

## 9. Prove one canonical asset pair

Before generating pirate ghosts or ninja zombies, create:

1. One neutral human character sheet
2. One neutral top-down tileset
3. One tiny test map
4. One runtime scene showing movement and collision

That becomes the reference against which every generated asset is judged.

## Concrete deliverables

Create:

```text
ASSET-CONTRACT.md
assets/
  characters/
  tilesets/
  objects/
  effects/
  manifests/
templates/
  character-sheet-guide.png
  tileset-guide.png
schemas/
  asset-manifest.schema.json
```

After the contract and two blank visual templates are fixed, generate the neutral reference character without risking a collection of incompatible art.
