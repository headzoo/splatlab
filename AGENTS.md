# Agent Instructions

Before planning or making changes in this project, read [GAME.md](./GAME.md). It explains the product's purpose, two-day hackathon scope, supported game types, network-play requirements, composable theme and asset model, and recommended implementation boundaries.

Use that document as the primary product context when interpreting requests and making architectural or implementation decisions.

## Sprite generation and editing

Before generating, editing, normalizing, naming, or organizing sprite assets, also read:

- [plan/1-lock-down-contracts.md](./plan/1-lock-down-contracts.md) for the required visual style, frame geometry, sheet layout, anchors, transparency, tileset contract, and validation rules.
- [plan/2-sprite-sheets.md](./plan/2-sprite-sheets.md) for the complete sprite inventory, production order, theme/body matrix, atlas layouts, filenames, game-type coverage, and acceptance checklist.

Follow both documents literally so every sprite remains interchangeable across supported games and themes. Do not generate assets for a later production set until the current set has passed the documented validation process.

The canonical runtime art scale is `64 × 64` pixels per world tile and character frame. Character sheets are `320 × 256`, with a bottom-center anchor at `(32, 56)`. Older `32 × 32` runtime assets and recipes are obsolete and must not be used as references for new production work.

Files ending in `-source.png` are high-resolution generation masters and are not runtime spritesheets. Files without `-source` or another draft suffix are the approved Sprite Viewer/game-ready assets. Do not treat temporary `-aligned`, `-v2`, or similarly suffixed drafts as final assets.

The Game Editor is kept outside this monorepo as a sibling checkout at `../../../game_editor`
from this directory, or `../game_editor` from the monorepo root.
It should be run from that directory and configured with `SPLAT_LAB_GAME_ROOT`
pointing at this `apps/game` directory so specs, sprites, maps, staged builds,
approvals, and revision records continue to live here.

Gameplay changes made in the Game Editor must also be implemented and verified
in the matching site game player under `apps/website` in the same change. The
editor preview is not the production player. When an editor feature affects
play, update the shared map contract, the editor preview, and the site runtime,
then add a site-player test that loads an actual checked-in map used by `/build`.
Do not consider editor-only gameplay behavior complete.

Every new or regenerated sprite must have a matching recipe in `sprite-specs/<asset-id>.json`. Run the automated pipeline before presenting an asset for approval:

```bash
python3 tools/sprites.py process sprite-specs/<asset-id>.json
```

The command must pass and its contact sheet, animation preview, and JSON report under `sprite-reports/<asset-id>/` must be visually reviewed. Generated runtime candidates go to `sprite-build/` by default. The external Sprite Viewer screen in `../../../game_editor` is the canonical human approval gate: it reads each JSON recipe, prefers a differing candidate from `sprite-build/`, and promotes through the pipeline only when the user presses **Approve sprite**. Pixelorama remains useful for editing or secondary verification, but it is no longer required for approval. Do not manually copy a candidate over the suffix-free file in `sprites/` or bypass the viewer's recorded approval flow.

Whenever a new sprite, sound, background, palette, mask, brand image, or other
game asset becomes part of the checked-in runtime/catalog, update
[ASSETS.md](./ASSETS.md) with recreation instructions for that asset in the same
change. Do not leave `ASSETS.md` describing only the previous catalog.

When the user submits **Request changes** in the `../../../game_editor` Sprite Viewer, the viewer starts the installed Codex CLI immediately using the user's existing Codex login; no separate API key is required. It clones the high-resolution source into `sprite-revisions/<asset-id>/<request-id>/`, attaches both the exact candidate snapshot and cloned source to Codex, records the selected frame context, and streams safe progress labels back to the viewer. The revision directory is the agent's only writable project workspace. The server independently reruns the locked revision recipe and leaves a passing candidate in `sprite-build/` for another review. Requests remain under `sprite-change-requests/<asset-id>/`; terminal results are written under `sprite-change-results/<asset-id>/`. Do not manually process an active request, expose raw agent reasoning, overwrite the original source, or overwrite the approved runtime asset before the replacement candidate is approved.

The pipeline is intentionally fail-closed. Do not bypass an ambiguous subject-detection, clipping, frame-count, filename, transparency, pivot, or envelope failure by resizing the whole generated canvas or weakening tolerances without inspecting the source and explaining the change. If automatic alignment cannot identify a stable landmark, stop and add a reviewed asset-specific recipe or manual fallback instead of guessing.
