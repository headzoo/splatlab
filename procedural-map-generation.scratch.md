<!-- BIG-PLAN:1 -->
# Big Plan: Procedural Map Generation During Game Creation

Plan status: complete
Review cycle: 2
Max review cycles: 2

## Objective

Add server-side procedural map generation for both Maze and Platformer games. The setup conversation must ask for a ready-made or random map after theme selection, ask random-map users for short, medium, or long length, immediately materialize the generated map in `Game.spec`, and support safe re-rolls from both the builder and Cooper without flags or stale source-keyed edits.

## Original request

After Cooper asks about the random map or pre-made, if the user selects random map, Cooper should give 3 options of short map, medium range map, and long map.

Come up with the plan for procedural/random map generation at game creation time, including that length choice step.

Agreed product decisions and constraints:

- No EXPERIMENT_MAPS_GEN env flag. Keep existing template maps. When creating a new game, after the player chooses game type and theme, ask whether they want a ready-made map or a random map. Create the map automatically if they choose random; otherwise use existing templates.
- mapStyle question after theme (so generator can use theme template as art donor).
- If random is chosen, Cooper then offers 3 length options: short, medium, and long map.
- Scope: both platformers and mazes from the start.
- Re-roll: both a builder re-roll button AND a Cooper agent tool ("give me a different map"). Re-rolling discards terrain/object edits; confirm when edits exist rather than making re-roll undoable.
- Generation is server-side; store materialized maps in Game.spec (not seed-regenerate-on-read).
- Generated maps must load regardless of any flags; they are a property of the saved game.
- Prefer minting a fresh custom map source id per roll (e.g. custom-platformer-gen-*) and pruning old source-keyed edits via existing pruneRemovedMapSources pattern — do not overwrite in place (union merge would resurrect stale edits).
- Generator should clone art/legend/presentation/physics quirks from the theme's catalog template and produce geometry + objects; keep templateSource as art donor.
- Flat arena at end for bosses and game-complete flags (platformer); flat start for spawn.
- Earlier recommendation to do mazes first as the vertical slice (perfect-maze connectivity by construction), then platformer trajectory-driven generation — incorporate if still sound after inspecting the repo.
- Server-owned field pattern like physics/startingLives for generated map data.
- Setup wizard: GAME_SETUP_QUESTIONS / setupStep / builderSetupHistory / selectX callbacks / cooper-setup-choice-replies.json.

## Global architectural decisions

- Keep catalog templates in `apps/game/maps` unchanged and always available. A ready-made choice continues to select `THEME_MAP_SOURCES`; random generation uses that selected theme source as an immutable art and mechanics donor.
- Add setup values `mapStyle: "ready_made" | "random"` and `mapLength: "short" | "medium" | "long"` to `GameDocument`. Insert setup steps in this order: `gameType`, `theme`, `mapStyle`, conditional `mapLength`, then the existing character/appearance/name sequence. Ready-made skips `mapLength`; random requires it.
- Store complete generated runtime documents in bounded, validated, server-owned `generatedPlatformerMaps` and `generatedMazeMaps` arrays in `Game.spec`. Each record is keyed by a fresh custom source, carries its donor `templateSource` and chosen length, and contains the materialized runtime map. No seed is required to load or replay a game, and no database migration is needed because `Game.spec` is already JSON.
- Define strict Zod schemas for the generated subset of `PlatformerMapSpec`, `MazeMapSpec`, object types, motion values, dimensions, row lengths, IDs, and coordinates. Validate both generator output and every stored/public game parse; do not use unchecked casts for generated data.
- Resolve authored levels by source in this order: matching materialized generated record, then catalog-template clone. A generated map keeps its own geometry and objects while its `templateSource` continues to drive theme/title/player-art resolution.
- A roll replaces the active level in place in campaign order with a fresh `custom-platformer-gen-*` or `custom-maze-gen-*` source, removes the old generated record, and prunes every old source-keyed platformer edit/art array through the existing `pruneRemovedMapSources` behavior. Never mutate a generated map under the same source ID.
- Treat a roll as one server-owned atomic state transition with a dedicated `MapRollChange` response, not an ordinary local edit and not an undo entry. Applying a roll clears local undo/redo history so undo can never point at a pruned source.
- Preserve autosave concurrency by making generated-map arrays server-owned in the same reconciliation layer as `physicsDocument` and `startingLives`. Map-roll responses carry the authoritative source, level lists, generated arrays, and pruned source-keyed arrays needed for the preview to update immediately.
- Use one shared roll service for setup, the builder button, and Cooper. The service reloads the current owner-scoped game, checks an optional expected revision, detects source-keyed edits, requires explicit discard confirmation when they exist, generates and validates the map, and commits spec/gameType/mapSource/revision atomically with bounded optimistic retries.
- Keep generation deterministic for tests by injecting a small seeded PRNG; production creates a cryptographically random seed per roll but persists only the generated map (optional non-runtime provenance may record generator version, not a read-time dependency).
- Maze generation is the first vertical slice because randomized depth-first carving on odd cells yields a perfect connected maze by construction. Use fixed bounded worlds large enough for every donor camera: short `21x15`, medium `31x21`, long `41x29`.
- Maze placement starts at `(1,1)`, uses BFS distances on carved floor, puts the key on a distant branch and the exit farther along a reachable route, retains donor spawn/object mechanics, and scales optional enemy/hazard counts by length while keeping blocking objects off the required spawn-key-exit path.
- Platformer lengths use fixed bounded widths short `48`, medium `88`, long `128`, with the donor row count. Clone donor schema/runtime/tile size/camera/physics/rules/presentation/legend, then generate terrain and objects.
- Platformer generation uses a constrained segment grammar plus a reachability validator derived from the effective saved physics and the protected `PLATFORMER_LEVEL_DESIGN` jump envelope. Every generated landing on the critical path must be reachable with collision clearance; generated gaps/rises must remain inside the minimum envelope accepted by future Cooper physics patches.
- Every platformer has a flat, hazard-free start large enough for the player spawn and a flat final arena large enough for the donor boss and goal/game-complete flag. Place checkpoints before the final arena and distribute donor-derived collectibles, enemies, hazards, and presentation objects only on validated support cells; revalidate after placement.
- Re-roll confirmation is enforced server-side to prevent time-of-check/time-of-use loss. The builder presents a confirmation only when the active source has terrain/object/removal/settings/art edits. Cooper's tool returns `needsConfirmation` without writing, asks the kid, and accepts an explicit `confirmDiscardEdits` on the next turn.
- Do not add an environment flag, generated-map database table, background job, runtime regeneration path, or new dependency.

## Open questions / assumptions

- The requested “medium range map” is presented to the child as the concise label “Medium map”; persisted value is `medium`.
- Re-roll retains the current generated map's donor theme and length unless Cooper explicitly supplies another allowed length. A ready-made active level can also be rolled into a random map using its catalog source as donor.
- Existing Maze levels have no terrain editor, so discard confirmation normally applies only to Platformer source-keyed edits, but the server check remains generic for future Maze editing.
- Baseline warning: `pnpm --filter website test` currently has one unrelated failure before implementation: `each campaign map includes one shared extra-life pickup` reports two pickups in `space_01`. Implementers must report this known failure separately and must not weaken that test as part of this feature.

## Execution policy

- The current repository is authoritative; this plan captures intent.
- Paths below are hints unless explicitly stated otherwise.
- Never use line numbers as implementation anchors.
- The orchestrator owns this plan's status fields and completion records.
- Implementers must not edit this plan file.

---

## Step BP-001: Add generated-map contracts and runtime resolution

Status: complete
Agent: reasoning-implementer
Model tier: reasoning
Session: foreground
Depends on: none
Parallel group: none
Retry limit: 1
Escalation chain: frontier-implementer

### Routing reason

This changes the central persisted contract, conditional setup state, public projection, level resolution, history semantics, and server/client ownership rules together; local cross-cutting reasoning is required, but the architecture is fully specified.

### Intent

Establish validated materialized-map storage and make every existing preview/player/Cooper level resolver able to load generated maps safely before any generator or UI can create them.

### Architectural decisions to preserve

- Generated map arrays are complete, bounded, validated, server-owned runtime data in `Game.spec`.
- Catalog templates remain the fallback and `templateSource` remains the art donor.
- Map rolls will be dedicated non-undoable server transitions.
- Legacy documents default to ready-made behavior and empty generated arrays.

### Semantic targets

- `GAME_SETUP_QUESTIONS`, `GAME_SETUP_STEPS`, and `gameDocumentSchema` — add ordered conditional map choices and generated records without breaking old games.
- `PlatformerMapSpec` / `MazeMapSpec` persisted generated subset — provide strict schemas and inferred compatible types.
- `gameCampaignMaps` / `gameMazeMaps` — resolve materialized generated maps by source before cloning a catalog map.
- `activeGameTheme`, `activePlayerAssetId`, `defaultGameTitle`, `toPublicGameDocument` — derive presentation from donor metadata and include only runtime-required generated data publicly.
- `sameGameDocument`, reconciliation, and undo/redo server-owned preservation — compare/preserve generated state and prepare a dedicated history action for rolls.
- `pruneRemovedMapSources` — expose or reuse this behavior from one domain-level map-roll application function rather than duplicating filters.

### Likely files

Paths are hints based on the repository at planning time.

- `apps/website/src/lib/generated-map-contract.ts` (new)
- `apps/website/src/lib/game-contract.ts`
- `apps/website/src/game/platformer/types.ts`
- `apps/website/src/game/top-down/types.ts`
- `apps/website/src/game/game-levels.ts`
- `apps/website/src/lib/cooper-spec-change.ts`
- `apps/website/src/lib/game-history.ts`
- `apps/website/src/lib/games.ts`
- `apps/website/src/lib/game-contract.test.ts`
- `apps/website/src/game/game-player-content.test.ts`
- `apps/website/src/lib/game-history.test.ts`
- `apps/website/src/lib/games.test.ts`

### Implementation

1. Add constants/types for map style, map length, and generated source prefixes. Extend custom source regexes to accept the agreed `custom-*-gen-*` form while retaining all existing custom IDs.
2. Build strict schemas for the exact platformer and maze runtime fields the generators may persist, including motion/object discriminators, bounded dimensions, matching row widths/heights, in-bounds objects, unique IDs, one primary spawn, and runtime-specific invariants. Keep checked-in catalog imports as trusted donors, but parse every generated record.
3. Add `generatedPlatformerMaps` and `generatedMazeMaps` records with source, template source, length, generator version, and materialized map. Bound record counts to the existing 20-level cap and refine `GameDocument` so records, level metadata, selected sources, runtime IDs, and map IDs agree.
4. Add `mapStyle` and `mapLength` defaults that parse legacy documents as ready-made/medium without changing their active maps. Insert `mapStyle` and `mapLength` into setup vocabulary; conditional skipping is implemented in BP-005.
5. Update level resolution to choose a generated record's map for a generated source and otherwise preserve existing template clone behavior. Ensure campaign order and labels still come from the level metadata.
6. Update theme/title/player-art helpers to resolve through generated record `templateSource`. Include generated arrays in `PublicGameDocument`, but continue excluding setup and chat history.
7. Add a `MapRollChange` schema and pure `applyMapRollChange` helper that replaces authoritative map/level/generated fields and prunes removed source-keyed arrays. Add a reducer action that applies it and clears past/future; undo/redo must preserve current generated server-owned fields.
8. Extend document equality and client/server reconciliation for every new field, and update `updateGame` so stale client autosaves cannot delete or overwrite stored generated arrays. Avoid changing unrelated object-union behavior.
9. Add focused tests for legacy parsing, invalid/mismatched generated payload rejection, public loading, donor-derived theme/title/art, generated resolver precedence, source pruning, server-owned autosave behavior, and history clearing.

### Do not

- Do not generate maps in this step.
- Do not loosen schemas with arbitrary executable-looking records or unchecked `unknown as` casts for persisted generated maps.
- Do not remove or rewrite catalog-map behavior.
- Do not add a Prisma migration; the existing JSON spec column is the storage boundary.

### Acceptance criteria

- [ ] A valid materialized Maze or Platformer map in `Game.spec` resolves in builder and public player without a feature flag.
- [ ] Legacy saved games parse to their current ready-made maps unchanged.
- [ ] Invalid dimensions, rows, coordinates, duplicate IDs, source mismatches, or runtime mismatches are rejected.
- [ ] Generated data survives stale autosaves and is preserved across ordinary undo/redo.
- [ ] Applying a map roll prunes the old source and clears undo/redo history.

### Verification

```text
pnpm --filter website exec node --import tsx --test src/lib/game-contract.test.ts src/game/game-player-content.test.ts src/lib/game-history.test.ts src/lib/games.test.ts
pnpm --filter website typecheck
```

### Completion record

Started: 2026-09-15
Completed: 2026-09-15
Actual agent: reasoning-implementer
Attempts: 1
Result: COMPLETE
Files changed: generated-map-contract.ts, game-contract.ts, game-levels.ts, cooper-spec-change.ts, game-history.ts, games.ts, build-setup.tsx, tests
Symbols changed: generatedPlatformerMapSchema, generatedMazeMapSchema, gameDocumentSchema, applyMapRollChange, MapRollChange, gameCampaignMaps, gameMazeMaps, gameHistoryReducer
Verification result: contract/player/history/games tests PASS; typecheck PASS
Deviations: none
Notes for later steps: Map-roll application available as pure server-owned transition; applyMapRollChange ready for BP-004/005

---

## Step BP-002: Implement connected Maze generation

Status: complete
Agent: reasoning-implementer-bg
Model tier: reasoning
Session: background
Depends on: BP-001
Parallel group: generators
Retry limit: 1
Escalation chain: frontier-implementer

### Routing reason

Perfect-maze generation and object placement need algorithmic care and property tests, but are isolated from the Platformer generator and safe to run in the background once contracts exist.

### Intent

Generate short, medium, and long Maze maps that are connected by construction, visually inherit the selected theme donor, contain a reachable spawn-key-exit objective, and remain within persisted contract limits.

### Architectural decisions to preserve

- Use randomized depth-first carving on odd cells and fixed `21x15`, `31x21`, and `41x29` worlds.
- Clone donor art, camera, legend, runtime, tile size, and compatible object mechanics.
- Persist the final map, not a read-time seed recipe.

### Semantic targets

- Maze generator entry point — accept donor, length, fresh source/map ID, and injected PRNG.
- Perfect-maze carver — produce one connected acyclic floor component with solid borders.
- Maze objective placer — choose distant reachable key and exit cells from BFS distances.
- Donor object archetypes — clone safe mechanics while replacing IDs and coordinates.
- Maze generator property tests — prove invariants over many seeds for every length and donor.

### Likely files

Paths are hints based on the repository at planning time.

- `apps/website/src/lib/random-map/random-source.ts` (new shared utility if BP-001 did not create it)
- `apps/website/src/lib/random-map/maze-generator.ts` (new)
- `apps/website/src/lib/random-map/maze-generator.test.ts` (new)
- `apps/website/src/game/game-player-content.ts`

### Implementation

1. Implement a tiny deterministic PRNG adapter and shuffle/sample helpers with injected state for tests; production seeding remains the roll service's responsibility.
2. Carve odd-cell mazes with randomized depth-first search, keeping the outer border solid and opening the wall between visited cells. Assert exact configured dimensions and donor camera fit.
3. Compute graph distances from `(1,1)`. Reserve a safe start neighborhood, place all donor player spawns on distinct nearby floor cells, place the key on a distant branch, and place the exit on a far reachable cell whose route is meaningful after collecting the key.
4. Scale optional enemy and hazard counts conservatively by length using donor instances as property archetypes. Place them on reachable floor cells outside the protected start area; never put a solid obstacle on the required spawn-key-exit path.
5. Copy donor schema/runtime/tile size/camera/legend/presentation and safe per-object behavior/asset/speed/motion fields. Generate stable per-map object IDs and set the runtime map ID from the fresh source.
6. Parse the completed map with the strict generated Maze schema before returning it.
7. Add table/property tests across all donors, lengths, and a broad deterministic seed set for dimensions, border walls, row widths, full floor connectivity, unique in-bounds objects, distinct spawns, required key/exit linkage, objective reachability, donor visual inheritance, and output diversity between seeds.

### Do not

- Do not use rejection loops without a hard attempt bound.
- Do not place required objectives by Manhattan distance alone; use carved-floor graph distance.
- Do not copy donor coordinates or mutate the donor.
- Do not add Maze editor functionality.

### Acceptance criteria

- [ ] Every tested generated Maze has one connected floor component and a reachable spawn-key-exit objective.
- [ ] All three lengths use the agreed dimensions and fit every donor camera.
- [ ] Generated objects are in bounds, unique, non-overlapping where required, and inherit the donor theme/mechanics.
- [ ] Identical seeds are reproducible and different seeds produce multiple layouts.

### Verification

```text
pnpm --filter website exec node --import tsx --test src/lib/random-map/maze-generator.test.ts
pnpm --filter website typecheck
```

### Completion record

Started: 2026-09-15
Completed: 2026-09-15
Actual agent: frontier-implementer (escalation from reasoning-implementer-bg)
Attempts: 2
Result: COMPLETE
Files changed: top-down/types.ts, generated-map-contract.ts, random-source.ts, maze-generator.ts, maze-generator.test.ts
Symbols changed: MazeMapObject, generatedMazeMapSchema, createSeededRandomSource, generateMazeMap, MAZE_GENERATED_DIMENSIONS
Verification result: maze-generator tests PASS; typecheck PASS
Deviations: none
Notes for later steps: generateMazeMap ready for BP-004 roll service

---

## Step BP-003: Implement trajectory-validated Platformer generation

Status: complete
Agent: frontier-implementer
Model tier: frontier
Session: foreground
Depends on: BP-001
Parallel group: none
Retry limit: 0
Escalation chain: stop

### Routing reason

Generating varied terrain while proving collision-safe reachability under mutable game physics is the novel, highest-risk implementation in the feature and warrants frontier execution.

### Intent

Generate short, medium, and long Platformer maps whose critical path is playable, whose start and final boss arena are safe and flat, and whose visuals and mechanics come from the selected theme donor.

### Architectural decisions to preserve

- Use widths `48`, `88`, and `128` with donor row count.
- Combine a bounded segment grammar with trajectory/reachability validation.
- Validate against the effective saved physics and never exceed the protected minimum design envelope.
- Preserve donor physics quirks, presentation, legend, object mechanics, and boss/goal semantics.

### Semantic targets

- Platformer segment grammar — bounded ground, gap, rise/fall, platform, hazard, and recovery segments.
- Reachability model — derive jump trajectories from the same physics formulas as the runtime and account for player dimensions and collision clearance.
- Critical-path validator — prove a route from spawn platform through landings to the final arena.
- Object support-cell placer — place donor-derived objects only on valid, reachable terrain.
- Generator property and runtime integration tests — cover every donor, length, and varied seeds.

### Likely files

Paths are hints based on the repository at planning time.

- `apps/website/src/lib/random-map/platformer-generator.ts` (new)
- `apps/website/src/lib/random-map/platformer-generator.test.ts` (new)
- `apps/website/src/game/platformer/engine.ts`
- `apps/website/src/lib/game-physics.ts`
- `apps/website/src/game/platformer-engine.test.ts`

### Implementation

1. Expose/reuse pure physics metrics from the platformer engine rather than maintaining divergent constants. Compute launch velocity, gravity, horizontal acceleration/range, actor clearance, and the protected minimum jump envelope.
2. Define a finite grammar of easy bounded segments. Reserve at least 8 flat hazard-free columns at the start and at least 18 flat hazard-free columns at the end; fill exactly the target width without truncating either reserved zone.
3. Build a critical-path landing graph as segments are proposed. Sample the runtime-equivalent trajectory across simulation-sized time increments, reject arcs that intersect terrain or miss a landing rectangle, and cap attempts before falling back to a known-safe flat/low-variation segment.
4. Restrict critical rises/gaps to the minimum protected `PLATFORMER_LEVEL_DESIGN` envelope even when current saved physics is more generous. Also validate with the current effective physics so altered gravity/movement modes do not create a map the current game cannot play.
5. Clone donor schema/runtime/tile size/camera/physics/rules/presentation/legend. Build a terrain layer with matching row lengths and no unsupported symbols.
6. Clone donor object archetypes rather than inventing assets/behaviors. Place one player spawn in the flat start, checkpoints before major sections/final arena, collectibles along reachable landings, ordinary enemies on safe supported patrol spans, hazards away from mandatory landing cells, and optional flying presentation objects only in bounds.
7. Put a donor-derived boss and goal/game-complete flag in the flat final arena. Ensure boss patrol/chase bounds and large collider fit entirely on solid terrain; no other object or hazard may make the arena unusable.
8. Run a final reachability and support validation after object placement, then strict-parse the materialized map. Return a descriptive bounded failure if generation exhausts attempts rather than persisting a partial map.
9. Add deterministic property tests over every donor/length and many seeds for dimensions, symbol/row integrity, flat start/final arena, spawn/path reachability, trajectory clearance, object supports, boss bounds, donor inheritance, reproducibility, and layout diversity. Include a runtime test that initializes and steps a generated map through the real engine.

### Do not

- Do not claim reachability from endpoint geometry alone.
- Do not depend on the editor preview as the gameplay verification boundary.
- Do not create new art IDs, behavior types, or runtime mechanics.
- Do not weaken `assertJumpEnvelope`, map limits, or collision tolerances to make generation pass.

### Acceptance criteria

- [ ] Every tested map has a validated route from the flat spawn area to the flat final arena.
- [ ] Critical jumps are collision-clear under current physics and remain within the minimum protected design envelope.
- [ ] Every supported length and donor produces bounded, schema-valid maps with inherited visuals/mechanics.
- [ ] Boss, goal, checkpoints, hazards, enemies, and collectibles occupy valid supported cells.
- [ ] Exhausted generation fails closed without changing the game.

### Verification

```text
pnpm --filter website exec node --import tsx --test src/lib/random-map/platformer-generator.test.ts src/game/platformer-engine.test.ts
pnpm --filter website typecheck
```

### Completion record

Started: 2026-09-15
Completed: 2026-09-15
Actual agent: frontier-implementer
Attempts: 1
Result: COMPLETE
Files changed: platformer-generator.ts, platformer-generator.test.ts, generated-map-contract.ts, platformer/engine.ts, platformer-engine.test.ts
Symbols changed: generatePlatformerMap, validatePlatformerReachability, platformerLandings, PlatformerGenerationError
Verification result: generator tests PASS; typecheck PASS; combined tests 65/66 (pre-existing space_01 extra-life)
Deviations: Extended strict generated schema for donor boss/patrol/ranged/motion mechanics
Notes for later steps: BP-004 calls generatePlatformerMap({ donor, length, seed, physics, id })

---

## Step BP-004: Add atomic server map-roll service and API

Status: complete
Agent: reasoning-implementer
Model tier: reasoning
Session: foreground
Depends on: BP-002, BP-003
Parallel group: none
Retry limit: 1
Escalation chain: frontier-implementer

### Routing reason

The implementation combines owner scoping, optimistic concurrency, destructive-edit confirmation, server-owned JSON merging, generator selection, and DTO design; these are subtle but follow existing game/run-store transaction patterns.

### Intent

Provide one secure atomic roll operation used by setup, builder re-roll, and Cooper, returning enough authoritative state for an immediate preview update without permitting stale autosaves or race conditions to resurrect discarded edits.

### Architectural decisions to preserve

- Every roll mints a fresh source and deletes the old source's generated record and edits.
- Confirmation is checked again inside the server transition.
- A failed generator or conflict leaves the game unchanged.
- The response is a dedicated validated `MapRollChange`; generated map data remains server-owned.

### Semantic targets

- Random map roll domain service — owner-scoped load/check/generate/validate/commit.
- Edit-presence detector — inspect all source-keyed terrain/object/removal/settings/art arrays for the active source.
- Fresh source creation — use cryptographic UUIDs and exact custom source prefixes.
- Game memory and Prisma paths — perform equivalent atomic updates and revision increments.
- `/api/games/[gameId]/map-roll` — authenticated request validation, conflict/confirmation/error mapping, no-store response.

### Likely files

Paths are hints based on the repository at planning time.

- `apps/website/src/lib/random-map/map-roll.ts` (new)
- `apps/website/src/lib/random-map/map-roll.test.ts` (new)
- `apps/website/src/app/api/games/[gameId]/map-roll/route.ts` (new)
- `apps/website/src/lib/games.ts`
- `apps/website/src/lib/agent-flow/run-store.ts`
- `apps/website/src/lib/game-contract.ts`

### Implementation

1. Define strict request/result schemas: requested length, `confirmDiscardEdits`, optional expected game revision for browser calls, and reason (`setup` or `reroll`). Do not accept donor/source/map content from the client.
2. Determine the donor from the active catalog source or active level/generated record. For initial setup, the theme-selected catalog source is the donor. Select the Maze or Platformer generator from the stored `previewKind`.
3. Detect edits associated with the active source across every source-keyed field. If any exist and confirmation is false, return `confirmation_required` with no generation and no write.
4. Mint a fresh source and map ID, seed production generation with `node:crypto`, call the appropriate generator with current effective physics, strict-parse its output, and construct a `MapRollChange`.
5. Replace the active level metadata at the same campaign position, retaining its label where appropriate; initial setup creates the first custom level label from the donor. Replace old generated records, prune old source edits/art, set `mapStyle: random` and chosen length, and preserve unrelated levels/maps.
6. Commit `spec`, denormalized `gameType`, `mapSource`, and incremented revision atomically. Use the repository's bounded optimistic retry approach when no browser expected revision is supplied; with an expected revision, return a conflict rather than silently rolling a newer game.
7. Return the new game revision and validated `MapRollChange`, not an unchecked full database record. Keep failure messages child-safe while logging detailed server causes.
8. Add owner-scope, revision-conflict, confirmation/no-write, fresh-ID, pruning, replacement-order, repeated re-roll, ready-made-to-random, both-runtime, generator-failure rollback, memory-store, and response-schema tests.

### Do not

- Do not trust a client-provided source, donor, seed, or map body.
- Do not persist before generation and validation finish.
- Do not silently discard edits or retry through an explicit browser revision conflict.
- Do not add a feature flag or external queue.

### Acceptance criteria

- [ ] One authenticated operation atomically creates and stores a generated map for either runtime.
- [ ] Repeated rolls mint distinct source IDs and cannot resurrect old source-keyed edits.
- [ ] A roll with edits returns confirmation-required and leaves revision/spec unchanged until explicitly confirmed.
- [ ] Ownership and expected revisions are enforced.
- [ ] Any generation/validation failure leaves the prior playable map intact.

### Verification

```text
pnpm --filter website exec node --import tsx --test src/lib/random-map/map-roll.test.ts src/lib/games.test.ts
pnpm --filter website typecheck
```

### Completion record

Started: 2026-09-15
Completed: 2026-09-15
Actual agent: reasoning-implementer
Attempts: 1
Result: COMPLETE
Files changed: map-roll.ts, map-roll.test.ts, route.ts
Symbols changed: mapRollInputSchema, hasSourceEdits, rollGameMap, POST map-roll route
Verification result: map-roll + games tests PASS; typecheck PASS
Deviations: Uses mapStyle "generated" not plan text "random"
Notes for later steps: UI/Cooper call route with length, reason, confirmation, optional expected revision

---

## Step BP-005: Extend Cooper setup with style and length choices

Status: complete
Agent: reasoning-implementer
Model tier: reasoning
Session: foreground
Depends on: BP-004
Parallel group: none
Retry limit: 1
Escalation chain: frontier-implementer

### Routing reason

The wizard's conditional state machine, autosave-created identity, asynchronous server roll, reload history reconstruction, and error recovery interact across several established client components.

### Intent

After theme selection, have Cooper ask ready-made versus random; for random, show exactly Short map, Medium map, and Long map choices, generate on the server, and continue to hero selection only after the generated map is safely applied.

### Architectural decisions to preserve

- `mapStyle` follows theme and `mapLength` is conditional.
- Ready-made preserves existing template selection and skips generation.
- Random setup blocks progression while the server roll is pending and is retryable on failure.
- Setup generation uses the same map-roll service and non-undoable reducer action as later re-rolls.

### Semantic targets

- `SetupSelections`, setup callbacks, and question-history reconstruction — represent conditional style/length answers across reload.
- `BuildChat` question renderer and transitions — add two child-friendly choice grids in the agreed order.
- `BuildGamePreview` persistence bridge — ensure the game exists/saves before calling map-roll, then apply authoritative roll/revision.
- `cooper-setup-choice-replies.json` and typed reply helper — add complete replies for map style and length values.
- Setup tests — cover both branches, reload, errors, and exact labels/order.

### Likely files

Paths are hints based on the repository at planning time.

- `apps/website/src/app/build/build-setup.tsx`
- `apps/website/src/app/build/build-chat.tsx`
- `apps/website/src/app/build/build-game-preview.tsx`
- `apps/website/src/app/build/cooper-setup-choice-replies.json`
- `apps/website/src/app/build/build-setup-replies.ts`
- `apps/website/src/app/build/build-setup.test.ts`
- `apps/website/src/app/build/build.module.css`

### Implementation

1. Add `mapStyle` and `mapLength` to selections and typed callbacks. Theme selection advances to `mapStyle`; ready-made selection advances directly to `character`; random selection advances to `mapLength`.
2. Render Cooper's ready-made/random question after the theme reply. Render random length cards labeled exactly `Short map`, `Medium map`, and `Long map`; do not show them on the ready-made path.
3. Persist setup step/history for both branches. Update legacy history reconstruction so skipped `mapLength` is never fabricated for ready-made games and random partial setups resume at the correct question.
4. On a length choice, keep the UI in a generating/thinking state, ensure any pending initial autosave has produced a game identity, then call the authenticated map-roll endpoint with the latest revision and no discard confirmation.
5. Apply the returned `MapRollChange` through the dedicated reducer, adopt the returned revision/server-owned state, and only then advance to character selection. If generation fails or conflicts, retain the length question, display a retryable child-friendly error, and do not mark it answered.
6. Keep setup answers editable under the existing pre-completion rules. If game type/theme/style/length changes before setup completes, ensure an existing generated source is replaced or the ready-made donor is restored without orphaned generated data.
7. Extend typed setup replies and tests for question order, exact labels, both branch histories, selection restore, asynchronous success, generation failure, stale revision recovery, and no env-flag dependency.

### Do not

- Do not generate in the browser or optimistically fake a map before the server response.
- Do not advance to hero selection while a random roll is unsaved or failed.
- Do not require `mapLength` for ready-made games.
- Do not add an environment variable.

### Acceptance criteria

- [ ] The wizard order is game type, theme, map style, conditional map length, then hero.
- [ ] Random users see exactly three length choices and receive a generated preview before continuing.
- [ ] Ready-made users retain the theme template and never call generation.
- [ ] Reloading any partial setup reconstructs the same visible history and current question.
- [ ] Failures are retryable and do not corrupt setup history or active map.

### Verification

```text
pnpm --filter website exec node --import tsx --test src/app/build/build-setup.test.ts src/lib/game-contract.test.ts src/lib/game-history.test.ts
pnpm --filter website typecheck
```

### Completion record

Started: 2026-09-15
Completed: 2026-09-15
Actual agent: reasoning-implementer
Attempts: 1
Result: COMPLETE
Files changed: build-setup.tsx, build-chat.tsx, build-game-preview.tsx, cooper-setup-choice-replies.json, build-setup-replies.ts, build-setup.test.ts, game-contract.ts, game-history.ts
Symbols changed: SetupSelections, selectMapStyle, rollGeneratedMap, BuildChat map-style/length flow
Verification result: build-setup + contract + history tests PASS; typecheck PASS
Deviations: none
Notes for later steps: Setup uses shared map-roll endpoint with authoritative revision before advancing

---

## Step BP-006: Add builder re-roll controls and confirmation

Status: complete
Agent: cheap-implementer
Model tier: cheap
Session: foreground
Depends on: BP-005
Parallel group: none
Retry limit: 1
Escalation chain: reasoning-implementer -> frontier-implementer

### Routing reason

The service, state transition, and destructive-check semantics are already defined; this is ordinary UI wiring using existing builder buttons/dialog styles.

### Intent

Let a builder request a different map at any time, retain the current donor/length by default, clearly confirm destructive edit loss only when necessary, and apply the new server-owned map without adding an undo entry.

### Architectural decisions to preserve

- Re-roll uses the shared server endpoint and a fresh source.
- The client pre-check improves UX, but the server is authoritative about confirmation.
- Roll application clears undo/redo and editor selection.

### Semantic targets

- Builder map controls/settings — expose a visible `Re-roll map` action for both runtimes.
- Active-source edit detector — decide whether to show the discard warning.
- Re-roll request state — disable duplicate actions and show progress/error feedback.
- Editor state reset — clear selected objects/terrain, playing state as needed, and stale source UI after success.

### Likely files

Paths are hints based on the repository at planning time.

- `apps/website/src/app/build/build-game-preview.tsx`
- `apps/website/src/app/build/build.module.css`
- `apps/website/src/app/build/build-setup.test.ts` or a focused new builder test

### Implementation

1. Add a re-roll button near map/history controls or selected-level settings, available for both Maze and Platformer once the game is saved. Use the active generated record's length, falling back to stored/default medium for a ready-made map.
2. Check all source-keyed edit/art arrays for the active source. If nonempty, present an explicit confirmation that terrain/object edits on this level will be discarded; cancellation performs no request.
3. Persist pending non-map local changes first, then call map-roll with the current revision and confirmation status. Disable duplicate requests and editing actions that could race the destructive transition.
4. Handle a server `confirmation_required` response by presenting confirmation even if the pre-check missed newly stored edits. Handle revision conflicts by adopting/reloading current game state and asking the user to retry rather than silently rolling.
5. Apply success through the dedicated map-roll action, update identity revision/saved snapshot, clear selection and undo/redo, and show the new map immediately.
6. Add behavior tests for no-edit direct roll, cancel-with-edits, confirmed discard, server-required confirmation, conflict/failure preservation, loading state, fresh preview source, and both runtimes.

### Do not

- Do not make re-roll an ordinary `edit` reducer action.
- Do not rely only on `window.confirm` state for data safety; server confirmation remains mandatory.
- Do not erase edits from unrelated levels.
- Do not allow overlapping autosave/re-roll requests.

### Acceptance criteria

- [ ] Both generated and ready-made active maps can be re-rolled from the builder.
- [ ] No-edit rolls proceed directly; edited levels require explicit confirmation.
- [ ] Cancel/error/conflict leaves the current map and edits intact.
- [ ] Success clears stale history/selection and displays a fresh-source map immediately.

### Verification

```text
pnpm --filter website exec node --import tsx --test src/app/build/build-setup.test.ts src/lib/random-map/map-roll.test.ts src/lib/game-history.test.ts
pnpm --filter website lint
```

### Completion record

Started: 2026-09-15
Completed: 2026-09-15
Actual agent: cheap-implementer
Attempts: 1
Result: COMPLETE
Files changed: build-map-roll.ts (new), build-game-preview.tsx, build.module.css, build-setup.test.ts
Symbols changed: executeMapRoll, beginMapReroll, confirmMapReroll, activeMapRollLength, needsMapRollDiscardConfirmation
Verification result: 43/43 tests PASS; changed files lint-clean
Deviations: Fixed pre-existing hooks order in build-game-preview.tsx
Notes for later steps: BP-007 can reuse build-map-roll helpers and map-roll endpoint

---

## Step BP-007: Add Cooper's re-roll tool and end-to-end coverage

Status: complete
Agent: cheap-implementer
Model tier: cheap
Session: foreground
Depends on: BP-006
Parallel group: none
Retry limit: 1
Escalation chain: reasoning-implementer -> frontier-implementer

### Routing reason

The map-roll domain operation is complete, and the repository has established allowlist, registry, executor, HTTP response, and agent-flow patterns to extend mechanically.

### Intent

Make “give me a different map” invoke the same safe server roll through Cooper, ask before discarding edits, deliver the materialized map to the builder immediately, and verify the complete feature across save/reload/public play.

### Architectural decisions to preserve

- Cooper receives only a compact success/confirmation summary as tool output; the large `MapRollChange` travels out-of-band to the client.
- A tool call without `confirmDiscardEdits` never deletes edits.
- Map roll and an ordinary Cooper spec change may coexist in one turn and apply in server order.

### Semantic targets

- Agent tool allowlist/registry — register `reroll_map`.
- Re-roll tool definition/execution — optional length plus explicit discard confirmation, backed by the shared service.
- Tool execution/build-turn result/HTTP contract/client parser — carry optional `mapRoll` alongside physics/spec/title changes.
- `build_agentflow_v1.json` Cooper instructions/tool list — teach read-before-change and conversational confirmation behavior.
- Executor/build-turn/public-player integration tests — prove immediate builder update and durable saved play.

### Likely files

Paths are hints based on the repository at planning time.

- `apps/website/src/lib/agent-flow/tools/map-roll-tool.ts` (new)
- `apps/website/src/lib/agent-flow/tools/allowlist.ts`
- `apps/website/src/lib/agent-flow/tools/registry.ts`
- `apps/website/src/lib/agent-flow/tools/types.ts`
- `apps/website/src/lib/agent-flow/executor.ts`
- `apps/website/src/lib/agent-flow/build-turn-service.ts`
- `apps/website/src/lib/agent-flow/http-contract.ts`
- `apps/website/src/app/build/build-setup.tsx`
- `apps/website/src/app/build/build-game-preview.tsx`
- `apps/game/agent-flows/build_agentflow_v1.json`
- `apps/website/src/lib/agent-flow/executor.test.ts`
- `apps/website/src/lib/agent-flow/build-turn-service.test.ts`
- `apps/website/src/lib/agent-flow/compiler.test.ts`
- `apps/website/src/lib/public-games.test.ts`

### Implementation

1. Add `reroll_map` with optional allowed length and required boolean `confirmDiscardEdits`. It loads the owner-scoped game and calls the shared roll service without a browser expected revision.
2. On edit detection without confirmation, return `{ok:false, needsConfirmation:true}` and a plain reason Cooper can ask the kid; make no write. On success, return a compact summary with kind/length/new level identity and attach the validated `MapRollChange` plus game revision out-of-band.
3. Thread optional `mapRoll` through tool execution aggregation, `BuildMessageResult`, build-turn response schema, parser, persisted turn, and preview reducer. Preserve existing physics/spec/title fields and server execution order if one turn has more than one write.
4. Add the tool to the closed allowlist, registry, compiled flow tool list, and Cooper developer instructions. Tell Cooper to call it for different/random/new maps, to ask for explicit confirmation when the tool reports edits, to pass `confirmDiscardEdits:true` only after the kid agrees, and not to claim a roll succeeded on refusal.
5. Ensure the build-turn client applies a returned map roll as non-undoable authoritative state, then applies any subsequent ordinary spec change without resurrecting the removed source.
6. Add tests for tool registration/schema, no-edit success, edit refusal, confirmed retry, optional length, both runtimes, executor/HTTP propagation, multiple writes, revision update, old-source pruning, save/reload, and public-player resolution of the stored generated map.
7. Run the complete website checks. Record the known pre-existing extra-life test separately if it still fails; do not edit that unrelated map/test unless separately authorized.

### Do not

- Do not send the complete map JSON into the model's function output or prompt history.
- Do not infer confirmation from vague earlier chat; require the tool argument on the confirming turn.
- Do not let a later spec change in the same turn restore the old source.
- Do not regenerate on public read or omit generated data from public play DTOs.

### Acceptance criteria

- [ ] Cooper successfully handles “give me a different map” for Maze and Platformer.
- [ ] Cooper asks before discarding edits and only a confirmed second call writes.
- [ ] The builder receives and displays Cooper's map roll without refresh or undo entry.
- [ ] Generated maps survive save/reload and load through `/play` with no flag or generator call.
- [ ] Targeted and full checks pass except for any explicitly recorded baseline failure unchanged by this feature.

### Verification

```text
pnpm --filter website exec node --import tsx --test src/lib/agent-flow/compiler.test.ts src/lib/agent-flow/executor.test.ts src/lib/agent-flow/build-turn-service.test.ts src/lib/public-games.test.ts
pnpm --filter website typecheck
pnpm --filter website lint
pnpm --filter website test
pnpm build
```

### Completion record

Started: 2026-09-15
Completed: 2026-09-15
Actual agent: cheap-implementer
Attempts: 1
Result: COMPLETE
Files changed: map-roll-tool.ts, map-roll-shared.ts, agent-flow files, build_agentflow_v1.json, tests
Symbols changed: rerollMapTool, reroll_map, ToolExecutionResult.mapRoll, BuildMessageResult.mapRoll
Verification result: 71/71 targeted tests PASS; typecheck PASS; build PASS; full test 278/279 (pre-existing extra-life)
Deviations: mapRollSuccessSchema moved to cooper-spec-change; shared helpers extracted to avoid client bundling node:crypto
Notes for later steps: none

---

## Step BR-001: Preserve campaign structure and generated-map lifecycle

Status: complete
Agent: reasoning-implementer
Model tier: reasoning
Session: foreground
Depends on: none
Parallel group: none
Retry limit: 1
Escalation chain: frontier-implementer

### Routing reason

Requires coordinated changes to roll transitions, level metadata, runtime resolution, and server-owned persistence.

### Intent

Replace only the active campaign level during a roll, preserve other levels and ordering, and safely remove generated records when returning to ready-made maps.

### Architectural decisions to preserve

- Materialized maps remain server-owned.
- Every roll mints a fresh source.
- Catalog templates remain immutable donors.
- Rolls remain atomic and non-undoable.

### Semantic targets

- MapRollChange, rollGameMap, gameCampaignMaps/gameMazeMaps, ready-made setup transitions, generated-record reconciliation

### Likely files

- apps/website/src/lib/random-map/map-roll.ts
- apps/website/src/lib/cooper-spec-change.ts
- apps/website/src/game/game-levels.ts
- apps/website/src/lib/games.ts
- apps/website/src/app/build/build-setup.tsx

### Implementation

1. Represent rolled map at active campaign position; retain unrelated levels.
2. Resolve each campaign entry independently; remove generated-map early return collapsing campaign to one map.
3. Preserve labels/ordering when replacing levels.
4. Make generated-record removal revision-checked when setup returns to ready-made.
5. Prevent generated-record orphans across generated/ready-made toggles.

### Do not

- Alter catalog templates; regenerate on resolve; make generated arrays client-owned.

### Acceptance criteria

- Re-rolling one level leaves other levels playable in original order.
- Builder and public player expose same complete campaign.
- Returning to ready-made removes obsolete generated records.
- Repeated style toggling cannot exhaust 20-record bound.

### Verification

Add multi-level roll and lifecycle tests; run player, setup, map-roll, public-game, history tests plus typecheck.

### Completion record

Started: 2026-09-15
Completed: 2026-09-15
Actual agent: reasoning-implementer
Attempts: 1
Result: COMPLETE
Files changed: map-roll.ts, cooper-spec-change.ts, game-levels.ts, games.ts, build-game-preview.tsx, tests
Symbols changed: applyMapRollChange, gameCampaignMaps, gameMazeMaps, rollGameMap, withReadyMadeGeneratedMapsRemoved
Verification result: 77 tests PASS; typecheck PASS
Deviations: none
Notes for later steps: none

---

## Step BR-002: Prevent stale source-keyed edit resurrection

Status: complete
Agent: reasoning-implementer
Model tier: reasoning
Session: foreground
Depends on: BR-001
Parallel group: none
Retry limit: 1
Escalation chain: frontier-implementer

### Routing reason

Reconciliation spans client conflict handling, autosave merging, Cooper writes, and authoritative source pruning.

### Intent

Ensure no stale autosave or Cooper reconciliation can restore edits belonging to a removed map source.

### Architectural decisions to preserve

- Object arrays continue merging for valid levels.
- removedMapSources remains explicit destructive-transition signal.
- Unrelated-level edits must survive.

### Semantic targets

- reconcilePersistedGame, withServerOwnedFields, object-array union logic, build-turn map-roll application

### Likely files

- apps/website/src/app/build/build-setup.tsx
- apps/website/src/app/build/build-game-preview.tsx
- apps/website/src/lib/games.ts
- apps/website/src/lib/cooper-spec-change.ts

### Implementation

1. Prune map-roll tombstoned sources after client/server object-array merging.
2. Server autosave reconciliation must reject/filter entries for removed sources.
3. Equivalent behavior for builder and Cooper rolls.
4. Preserve edits for still-valid campaign sources.

### Do not

- Stop merging valid object edits; globally clear unrelated edits; rely solely on UI serialization.

### Acceptance criteria

- Stale object edit/removal/settings cannot reappear after roll.
- Subsequent autosaves cannot persist orphaned source entries.
- Valid concurrent edits on retained levels survive.

### Verification

Add stale reconciliation regression tests; run setup, games, executor, map-roll, history suites.

### Completion record

Started: 2026-09-15
Completed: 2026-09-15
Actual agent: reasoning-implementer
Attempts: 1
Result: COMPLETE
Files changed: cooper-spec-change.ts, games.ts, build-setup.tsx, build-setup.test.ts, map-roll.test.ts
Symbols changed: pruneOrphanedMapSourceEdits, preserveRolledCampaign, reconcilePersistedGame, withServerOwnedFields
Verification result: setup/executor/map-roll/history/games suites PASS; typecheck PASS
Deviations: none
Notes for later steps: Valid edits on retained sources continue to merge; rolled-away sources discarded

---

## Step BR-003: Enforce bounded generated-map contracts

Status: complete
Agent: reasoning-implementer
Model tier: reasoning
Session: foreground
Depends on: none
Parallel group: contracts
Retry limit: 1
Escalation chain: frontier-implementer

### Routing reason

Schema hardening localized but requires runtime-specific invariant knowledge.

### Intent

Reject oversized or semantically invalid generated payloads during every stored/public parse.

### Architectural decisions to preserve

- Generated maps remain complete materialized runtime documents.
- Catalog maps remain trusted and unchanged.
- Validation fails closed.

### Semantic targets

- generatedPlatformerMapSchema, generatedMazeMapSchema, generated record/document refinements, create/public parsing tests

### Likely files

- apps/website/src/lib/generated-map-contract.ts
- apps/website/src/lib/game-contract.ts
- associated contract and generator tests

### Implementation

1. Bound HUD entries, sprite overrides, art-borrow entries, legend entries, nested collections.
2. Require camera dimensions and coordinates fit map.
3. Ensure terrain symbols exist in legend.
4. Enforce runtime-specific required object fields and objective invariants.
5. Correlate generated records, active sources, runtime kind, materialized map identity.
6. Reject invalid maps through create, stored-game, public projection paths.

### Do not

- Weaken generator validation; apply generated-only restrictions to catalog templates; unchecked casts.

### Acceptance criteria

- Every nested payload dimension finitely bounded.
- Invalid coordinates, symbols, cameras, objectives, record/source mismatches rejected.
- Both generators still pass all donors/lengths/seeds.

### Verification

Add negative boundary tests; run contract, generator, public-player, integration suites plus typecheck.

### Completion record

Started: 2026-09-15
Completed: 2026-09-15
Actual agent: reasoning-implementer
Attempts: 1
Result: COMPLETE
Files changed: generated-map-contract.ts, game-contract.ts, games.ts, platformer-generator.ts, tests
Symbols changed: generatedPlatformerMapSchema, generatedMazeMapSchema, gameDocumentSchema, toPublicGameDocument
Verification result: 49 tests PASS; typecheck PASS
Deviations: none
Notes for later steps: none

---

## Step BR-004: Serialize autosave before map rolls

Status: complete
Agent: reasoning-implementer
Model tier: reasoning
Session: foreground
Depends on: BP-006, BR-002
Parallel group: none
Retry limit: 1
Escalation chain: frontier-implementer

### Routing reason

Correctly ordering React refs, initial creation, autosave reconciliation, and map-roll revision handling requires cross-state reasoning.

### Intent

Ensure every builder/setup roll begins only after pending local state is durably saved and no autosave overlaps the roll.

### Architectural decisions to preserve

- Generation server-side and atomic; generated maps server-owned; expected revisions mandatory; confirmation server-authoritative; rolls non-undoable with fresh sources.

### Semantic targets

- persistLatest, executeMapRoll, initial setup game creation, in-flight autosave serialization, map-roll UI tests

### Likely files

- apps/website/src/app/build/build-game-preview.tsx
- apps/website/src/app/build/build-setup.test.ts

### Implementation

1. Flush/await persistence before enabling guard that makes autosaves no-op.
2. Unsaved setup creates game identity before posting roll.
3. Await existing save and use resulting revision.
4. Generate from persisted current theme/setup state.
5. Keep duplicate roll prevention after persistence handoff.
6. Add race-focused tests.

### Do not

- Remove optimistic revision checks; permit autosave during roll; generate client-side; weaken confirmation/pruning.

### Acceptance criteria

- Initial random-map creates/saves game then rolls; pending theme persisted before generation; active autosave completes before roll; correct revision/donor; duplicate rolls blocked; failure leaves map intact.

### Verification

Race tests; setup, map-roll, reconciliation, public-player suites; typecheck and lint.

### Completion record

Started: 2026-09-15
Completed: 2026-09-15
Actual agent: reasoning-implementer
Attempts: 1
Result: COMPLETE
Files changed: build-game-preview.tsx, build-map-roll.ts, build-setup.test.ts
Symbols changed: persistLatest, executeMapRoll, serializeMapRollStart
Verification result: map-roll/setup/reconciliation/public-player PASS; typecheck PASS
Deviations: none
Notes for later steps: none

---

## Step BR-005: Permit persisted pre-roll random setup state

Status: complete
Agent: reasoning-implementer
Model tier: reasoning
Session: foreground
Depends on: BR-004
Parallel group: none
Retry limit: 1
Escalation chain: frontier-implementer

### Intent

Allow random-map choice to persist safely while awaiting length selection without weakening post-roll generated-map validation.

### Implementation

1. Permit narrow persisted state: mapStyle generated, awaiting mapLength, active map still ready-made donor.
2. Reject generated style without matching materialized map in post-roll/completed states.
3. Preserve reload to map-length question.
4. BR-004 can save/create game then roll with persisted donor.
5. Integration tests for Maze and Platformer.

### Likely files

- game-contract.ts, game-contract.test.ts, build-setup.tsx, build-setup.test.ts

### Completion record

Started: 2026-09-15
Completed: 2026-09-15
Actual agent: reasoning-implementer
Attempts: 1
Result: COMPLETE
Files changed: game-contract.ts, game-contract.test.ts, build-setup.test.ts, map-roll.test.ts
Symbols changed: gameDocumentSchema (transitional generated checkpoint)
Verification result: 77 focused tests PASS; typecheck PASS
Deviations: none
Notes for later steps: none

---

## Step BP-999: Final integration review

Status: complete
Agent: frontier-reviewer
Model tier: frontier
Session: foreground
Depends on: BP-001, BP-002, BP-003, BP-004, BP-005, BP-006, BP-007, BR-001, BR-002, BR-003, BR-004, BR-005
Parallel group: none
Retry limit: 0
Escalation chain: stop

### Routing reason

A single frontier review after implementation is cheaper than frontier review after every step and catches cross-step integration problems.

### Intent

Review the completed procedural map feature as a whole against the original objective, persistence/concurrency requirements, generator correctness, and child-facing setup/re-roll behavior.

### Architectural decisions to preserve

- All global architectural decisions in this plan.

### Semantic targets

- The complete diff and all behavior changed by this plan.
- Setup state transitions, server-owned map storage, roll concurrency, source pruning, both generators, builder/Cooper confirmation, and public runtime loading.

### Likely files

Paths are hints based on the repository at planning time.

- All files changed by completed implementation/remediation steps.

### Implementation

1. Review only; do not edit implementation files.
2. Check correctness, integration, regressions, security implications, error handling, contracts, unnecessary complexity, and coverage.
3. Specifically verify that no code path regenerates on read, no stale autosave/undo/tool write can resurrect a removed source, all destructive rolls require confirmation, generated payloads are strictly bounded, and both runtimes load the exact persisted materialized map.
4. Examine property-test breadth and fail-closed behavior for disconnected Maze objectives, unreachable Platformer trajectories, invalid objects, and exhausted generation.
5. Return `REVIEW_RESULT: PASS` when no material issue remains.
6. If material issues remain, return `REVIEW_RESULT: REMEDIATION_REQUIRED` followed by complete remediation step packets using the same step schema and cost-routing rules.
7. Do not create remediation for optional stylistic preferences or the recorded unrelated baseline extra-life failure unless this feature changed it.

### Do not

- Rewrite working code for style preference.
- Edit code directly.
- Request remediation for speculative improvements unrelated to the feature.

### Acceptance criteria

- [ ] Original feature requirements are satisfied.
- [ ] Cross-step integration is coherent.
- [ ] No material regression or correctness issue remains.
- [ ] Security, persistence, concurrency, destructive-confirmation, and generator invariants are adequately tested.

### Verification

```text
Review the completed plan records, current repository, diff, targeted/full verification results, and the unchanged baseline extra-life failure if still present.
```

### Completion record

Started: 2026-09-15
Completed: 2026-09-15
Actual agent: frontier-reviewer (3 cycles; max 2 + post-max BR-005 fix applied)
Attempts: 3
Result: PASS (after BR-005 remediation applied outside review cycle)
Files changed: none
Symbols changed: none
Verification result: Cycles 1-2 remediated BR-001–004; cycle 3 found BR-005, fixed and verified (77 tests)
Deviations: BR-005 executed after review cycle cap; no fourth frontier review run
Notes for later steps: Pre-existing space_01 extra-life test failure unchanged
