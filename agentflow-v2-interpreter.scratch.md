<!-- BIG-PLAN:1 -->
# Big Plan: Agentflow V2 interpreter and build-turn runner

Plan status: complete
Review cycle: 2
Max review cycles: 2

## Objective

Replace Flowise execution with a server-only, closed-set interpreter in `apps/website` while preserving the existing Flowise Agentflow V2 JSON and the sibling Game Editor as the authoring surface. A browser turn uses authenticated `POST /api/games/:id/build-turn` requests, persists kid-visible text in `Game.spec.builderChatHistory`, checkpoints machine state in a new owner/game-bound Prisma `AgentFlowRun`, and supports request-based pause/resume without SSE or WebSockets.

The first proven slice is Start → Agent → Condition Agent → Direct Reply, plus a durable Human Input pause. Once that slice passes, add LLM, deterministic Condition, bounded Loop resume, and both Human Input actions while retaining the invariant that a request invokes at most one Agent/LLM node and one Condition Agent. Agent tools remain disabled until a separate safe tool catalog is specified.

## Original request

The repo `/media/sean/work/www/game_edit` (actual sibling checkout is `/media/sean/work/www/game_editor`) is part of this project. We built `agent-flows.html` to generate Flowise documents, but Flowise is being sunsetted (`https://flowiseai.com/` and `https://flowiseai.com/sunset`).

Keep the visual Agentflow editor and JSON format, run a closed node set in the Next.js app, persist runs in Neon next to games, and keep chat text on the game document, matching how `/build` already works.

The first slice must execute Start → Agent → Condition Agent → Direct Reply for one chat turn and persist a paused row for Human Input. Skip tools and loops until that path is solid.

Use `POST /api/games/:id/build-turn`, not SSE, token streaming, or WebSockets:

- A message request is JSON `{ message }`.
- A resume request is JSON `{ action: "proceed" | "reject", feedback? }`.
- The route returns JSON `{ status: "replied" | "paused", cooperMessage, runId }`.
- Ready writes the reply and finishes the run so a later message starts a new run.
- Needs work writes a paused row and returns the Human Input prompt.
- Proceed or Reject is another POST and resumes the owner/game-bound paused run.
- Append every kid-visible user/Cooper line to `Game.spec.builderChatHistory`, preserving its existing 50-turn, 500-character, `user | cooper` contract.
- Keep graph state out of strict `Game.spec`; use `AgentFlowRun` for flow id/hash, current node, `$flow.state`, `$flow.output`, loop counts, pending Human Input, and `running | paused | done | failed` status.
- Prisma is authoritative; Drizzle is migration history only.
- Support local development without `DATABASE_URL` with the same memory-fallback behavior as games.
- Use `runtime = "nodejs"` and set `maxDuration` because two sequential model calls may take 5–20 seconds.
- Invoke at most one Agent and one Condition Agent per request and never run three retries in one invocation.
- Start seeds `$flow.state`; interpolate `{{ question }}`, `{{ $flow.output }}`, and `{{ $flow.state.key }}`.
- The closed set is Start, Agent, LLM, Condition, Condition Agent, Human Input, Loop, and Direct Reply; Sticky Notes are ignored. Unknown or unsafe nodes such as Retriever, Custom Function, Execute Flow, or connector tools must error rather than no-op. Never execute `customFunction`.
- The checked-in flow id begins with `build_agentflow_v1`; hash/version its JSON so a paused run cannot resume against a rewritten graph.
- Resolve Flowise-shaped loop targets such as `agentAgentflow_0-Agent` explicitly.
- The Game Editor remains authoring-only; the website owns execution.
- Pick a server-only model provider, keep credentials off the client, and rate-limit this kids' builder.
- Do not plan GCP or Flowise self-hosting.

## Global architectural decisions

- `apps/website` owns a small interpreter library and an application service; the sibling Game Editor never runs models or owns run state.
- The flow registry is an explicit allowlist keyed by `build_agentflow_v1`. It statically includes the checked-in JSON from `apps/game/agent-flows/` so Next/Vercel bundles it, canonicalizes execution-relevant JSON, and computes a SHA-256 `flowHash`. No request-supplied path or dynamic flow id is read from disk.
- Compilation validates both `data.name` and `data.type` as an exact supported pair: `startAgentflow/Start`, `agentAgentflow/Agent`, `llmAgentflow/LLM`, `conditionAgentflow/Condition`, `conditionAgentAgentflow/ConditionAgent`, `humanInputAgentflow/HumanInput`, `loopAgentflow/Loop`, and `directReplyAgentflow/DirectReply`. `stickyNoteAgentflow/StickyNote` is omitted from execution. Every other name/type, mismatched pair, malformed branch, unsupported deterministic operation, or non-empty Agent tool list fails closed before model invocation.
- The compiler indexes nodes and outgoing edges by node id/source handle, requires one executable Start, validates reachability and branch uniqueness, and treats Loop as an explicit jump rather than permitting ordinary graph cycles.
- Condition and Condition Agent select an edge without replacing `$flow.output`; this ensures the starter graph's Direct Reply emits the coordinator result rather than `"Ready"`. Agent/LLM update `$flow.output` and apply bounded `*UpdateState` entries after interpolation.
- Interpolation is a non-evaluating string substitution supporting only `question`, `$flow.output`, and direct `$flow.state.<key>` lookups. Missing variables, nested expressions, filters, JavaScript, and prototype-sensitive keys fail closed.
- OpenAI's server-side Responses API is the initial provider, called with built-in `fetch` through a narrow internal `ModelClient` interface. `OPENAI_API_KEY` and an explicit `OPENAI_MODEL` are server-only environment variables. No SDK/dependency is added. Tests inject a fake client and never use the network.
- Condition Agent uses schema-constrained output limited to one configured scenario and receives no tools. Agent/LLM receives only checked-in instructions, the interpolated input, and bounded kid-visible context. Model replies and Human Input prompts are normalized to the existing 500-character visible-message limit; empty or malformed output fails the run.
- There is no automatic model retry in the first feature. A request executes no more than one Agent/LLM and one Condition Agent. Loop counts are durable across POSTs; Proceed may jump through one Loop and run one Agent plus one Condition Agent in that resume request, then either reply or pause again.
- A new message creates a fresh run; `done` and `failed` are terminal. Exactly one active (`running` or `paused`) run per owner/game is enforced with a nullable unique `activeKey`; terminal transitions clear it. A compare-and-swap `revision` protects claims/finalization, and a bounded stale-running lease lets a later request fail an abandoned invocation rather than permanently locking a game.
- `AgentFlowRun` stores `ownerId`, `gameId`, `flowId`, `flowHash`, `status`, `currentNodeId`, `question`, JSON `flowState`, JSON `flowOutput`, JSON `loopCounts`, optional JSON `pendingHumanInput`, `revision`, nullable unique `activeKey`, lease/timestamps, and a bounded failure code. The Game relation cascades on deletion; indexed owner/game/status lookups never trust a client-supplied owner.
- The run repository exposes atomic lifecycle operations that update run state and `Game.spec.builderChatHistory` together in Prisma transactions. Its memory implementation uses shared global stores and the same ownership, active-run, revision, trimming, and state-transition semantics.
- A message claim appends the user line before model work. A successful Direct Reply appends the Cooper reply; a Human Input checkpoint appends its Cooper prompt once. Resume actions do not duplicate the prompt; optional feedback is appended as a user line and stored in `$flow.state.humanFeedback`.
- The route response body stays exactly `{ status, cooperMessage, runId }`. Because server-side chat writes increment the existing optimistic Game revision, the route also returns the resulting revision in an `X-Game-Revision` response header. The build context propagates the persisted chat/revision to `BuildGamePreview` so its next PATCH does not conflict or resave the same transcript.
- App-level fixed-window limiting uses the existing Prisma `RateLimit` table with a namespaced owner key and an equivalent process-memory fallback. It is applied before model invocation, returns 429 with `Retry-After`, and does not depend on Better Auth's internal endpoint limiter.
- Runtime flow validation is authoritative. The Game Editor narrows its creation palette and validation language to the supported runtime set but continues preserving unknown JSON during import/save so it remains a portable authoring tool.
- Tools are deliberately out of scope for this feature: non-empty `agentTools` and connector/tool nodes fail closed. Adding tools later requires a separately reviewed, server-owned allowlist of typed game mutations; no arbitrary HTTP, Flowise-id tool, or custom function is planned here.

## Open questions / assumptions

- OpenAI is selected because the website has no model client and raw HTTPS avoids adding a dependency. Deployment must provide `OPENAI_API_KEY` and `OPENAI_MODEL`; local deterministic tests use an injected fake.
- The memory run store is included so current no-`DATABASE_URL` development behavior remains usable, but it is process-local and intentionally not durable across restarts.
- The required response JSON does not carry the Game revision; the plan uses `X-Game-Revision` to keep the current autosave concurrency contract coherent.
- No safe Agent tool vocabulary exists in either repository. Tool execution is not guessed in this plan and remains fail-closed.

## Execution policy

- The current repository is authoritative; this plan captures intent.
- Paths below are hints unless explicitly stated otherwise.
- Never use line numbers as implementation anchors.
- The orchestrator owns this plan's status fields and completion records.
- Implementers must not edit this plan file.
- Follow `apps/website/AGENTS.md`; inspect the installed Next 16 route-handler guidance if available before changing route configuration.
- Use pnpm only and do not add dependencies.

---

## Step BP-001: Compile the checked-in closed-set flow contract

Status: complete
Agent: reasoning-implementer
Model tier: reasoning
Session: foreground
Depends on: none
Parallel group: none
Retry limit: 1
Escalation chain: frontier-implementer

### Routing reason

Flowise-shaped data, branch handles, interpolation, and loop references require nontrivial normalization and fail-closed validation, but the scope is isolated and fully specified.

### Intent

Create a pure, testable interpreter contract layer that statically loads `build_agentflow_v1`, hashes it, validates the closed node set, and exposes deterministic graph traversal/interpolation primitives without running models or touching storage.

### Architectural decisions to preserve

- Use the exact name/type allowlist and ignore only Sticky Notes.
- Static registry only; no request-controlled file access.
- Conditions preserve `$flow.output`.
- Interpolation never evaluates code.
- Non-empty tools and unsupported nodes fail before execution.

### Semantic targets

- `Agentflow registry` — maps a checked-in id to immutable compiled JSON plus SHA-256 hash.
- `Flow compiler` — validates executable nodes, branches, handles, reachability, and Loop targets.
- `Interpolation context` — resolves only the three approved variable forms.
- `Deterministic Condition evaluator` — supports an explicitly enumerated safe subset of Flowise string comparisons.

### Likely files

Paths are hints based on the repository at planning time.

- `apps/website/src/lib/agent-flow/contract.ts`
- `apps/website/src/lib/agent-flow/registry.ts`
- `apps/website/src/lib/agent-flow/interpolate.ts`
- `apps/website/src/lib/agent-flow/compiler.test.ts`
- `apps/website/next.config.ts`
- `apps/game/agent-flows/build_agentflow_v1.json`

### Implementation

1. Define bounded Zod schemas/types for the Flowise fields the runtime consumes while allowing unrelated presentation metadata to remain in the source object.
2. Build the exact name/type mapping and reject mismatches, unsafe prototype keys, overlarge prompts/state entries, non-empty `agentTools`, unsupported condition operations, duplicate ids/handles/branches, missing targets, multiple Starts, and unreachable executable nodes.
3. Remove Sticky Notes before reachability/traversal. Require normal edges to remain acyclic; validate Loop nodes as terminal explicit jumps whose `loopBackToNode` strips the final `-<Type>` suffix by matching a real node id prefix, including `agentAgentflow_0-Agent`.
4. Support deterministic Condition branch selection for bounded string `equals`, `notEquals`, `contains`, and `notContains` operations only; reject all other operations until intentionally added.
5. Implement literal interpolation for `{{ question }}`, `{{ $flow.output }}`, and `{{ $flow.state.key }}` with clear errors for missing values or unsupported expressions.
6. Statically import/register the starter graph and compute a stable SHA-256 over canonical execution-relevant content. Ensure deployment tracing/bundling includes the JSON if static import alone is not sufficient in the current Next build.
7. Add pure tests using the real starter file plus malformed fixture clones, including the unsupported Retriever/CustomFunction/ExecuteFlow/tool cases and output-preserving condition behavior.

### Do not

- Do not run a model, access Prisma, or implement the API route.
- Do not copy the graph into a second manually maintained JSON file.
- Do not execute expressions, custom functions, URLs, Flowise connector ids, or arbitrary template syntax.
- Do not support ordinary graph cycles.

### Acceptance criteria

- [ ] The real starter compiles with one Start, one Agent, one Condition Agent, Direct Reply/Human Input branches, and an explicitly resolved Loop target.
- [ ] Every unknown/mismatched executable node and every non-empty Agent tool list throws a typed validation error.
- [ ] Sticky Notes do not participate in execution or reachability.
- [ ] Hashes are deterministic and change when execution-relevant graph content changes.
- [ ] Interpolation and deterministic Condition behavior are fully unit tested.

### Verification

```text
pnpm --filter website test
pnpm --filter website typecheck
```

### Completion record

Started: 2026-09-12
Completed: 2026-09-12
Actual agent: reasoning-implementer
Attempts: 1
Result: COMPLETE
Files changed: apps/website/src/lib/agent-flow/contract.ts, interpolate.ts, registry.ts, compiler.test.ts
Symbols changed: compileFlow, FlowContractError, evaluateCondition, nextNode, branchTarget, interpolate, AGENTFLOW_REGISTRY, getRegisteredFlow, flowHashFor
Verification result: typecheck PASS; compiler.test.ts 5/5 PASS (not in default test glob yet)
Deviations: none
Notes for later steps: Default test script glob `src/**/*.test.ts` may not discover nested `src/lib/agent-flow/*.test.ts`; use explicit path or widen glob when adding more agent-flow tests.

---

## Step BP-002: Add durable run lifecycle storage

Status: complete
Agent: reasoning-implementer
Model tier: reasoning
Session: foreground
Depends on: BP-001
Parallel group: none
Retry limit: 1
Escalation chain: frontier-implementer

### Routing reason

The schema itself is straightforward, but ownership, active-run uniqueness, optimistic claims, chat revision updates, database transactions, and a behaviorally equivalent memory fallback need careful cross-cutting state design.

### Intent

Add the Prisma-backed and in-memory `AgentFlowRun` lifecycle with atomic kid-visible transcript updates and safe claim/checkpoint/complete/fail transitions.

### Architectural decisions to preserve

- Prisma, not Drizzle, owns the new table and migration.
- Machine state never enters strict `Game.spec`.
- One active owner/game run is enforced; all transitions use ownership and revision checks.
- Run and transcript mutations commit atomically.

### Semantic targets

- `AgentFlowRun` Prisma model and migration — durable Neon checkpoint.
- `AgentFlowRunStore` — lifecycle boundary used by the executor.
- `Game.spec.builderChatHistory` mutation — max-50, max-500 transcript with Game revision increment.
- `memoryGames` / run memory globals — local fallback parity.

### Likely files

Paths are hints based on the repository at planning time.

- `apps/website/prisma/schema.prisma`
- `apps/website/prisma/migrations/<timestamp>_add_agent_flow_runs/migration.sql`
- `apps/website/src/lib/agent-flow/run-store.ts`
- `apps/website/src/lib/agent-flow/run-store.test.ts`
- `apps/website/src/lib/games.ts`
- `apps/website/src/lib/prisma.ts`

### Implementation

1. Add an `AgentFlowRunStatus` enum and owner/game-related model with the fields fixed in Global architectural decisions. Add indexes for owner/game/update order and status, a nullable unique `activeKey`, and cascading relations without editing the legacy Drizzle schema.
2. Generate a checked-in Prisma migration using the repository's existing naming/mapping conventions; include constraints and indexes represented by the Prisma schema.
3. Define store operations for: start message and append user line; claim a paused action; checkpoint Human Input and append prompt; complete Direct Reply and append Cooper line; fail and release the active key; load the owner/game active run.
4. Use Prisma transactions and compare-and-swap `revision` predicates. Start must surface not-found, active-conflict, and stale-running outcomes distinctly. A configurable bounded lease marks abandoned `running` rows failed before allowing a new turn; active paused rows are never silently replaced.
5. Parse `Game.spec` through `gameDocumentSchema`, append only validated turns, trim oldest entries to 50, increment Game revision, and return the resulting revision from every transcript mutation.
6. Refactor the current process-memory game accessor only as needed so the memory run store applies the same ownership checks and state transitions. Use a global memory run collection so hot reload does not immediately lose it.
7. Add storage contract tests against the memory implementation for cross-owner denial, duplicate active runs, stale claim revisions, pause/resume, terminal release, flow hash retention, transcript trimming, and Game revision increments. Keep the interface injectable so executor tests do not require Neon.

### Do not

- Do not add AgentFlow fields to `gameDocumentSchema`.
- Do not update `src/db/schema.ts`.
- Do not keep a database transaction open while awaiting a model response.
- Do not delete or overwrite completed/failed run history.

### Acceptance criteria

- [ ] Prisma validates and generates with an owner/game-bound run relation and deployable migration.
- [ ] A game can have only one active run while preserving any number of terminal runs.
- [ ] Pause survives a new store call and resume can be claimed exactly once.
- [ ] Every visible transcript update remains schema-valid and increments Game revision atomically with its run transition.
- [ ] Memory behavior matches database semantics covered by contract tests.

### Verification

```text
pnpm --filter website exec prisma validate
pnpm --filter website db:generate
pnpm --filter website test
pnpm --filter website typecheck
```

### Completion record

Started: 2026-09-12
Completed: 2026-09-12
Actual agent: reasoning-implementer
Attempts: 1
Result: COMPLETE
Files changed: prisma/schema.prisma, migrations/20260913000000_add_agent_flow_runs/migration.sql, run-store.ts, run-store.test.ts, games.ts
Symbols changed: AgentFlowRun, AgentFlowRunStatus, AgentFlowRunStore, memoryGames export
Verification result: prisma validate PASS; db:generate PASS; run-store.test.ts 4/4 PASS; typecheck PASS
Deviations: none
Notes for later steps: Store exposes start, claim, checkpoint, complete, fail, active-run loading for executor integration.

---

## Step BP-003: Execute and prove the first interpreter slice

Status: complete
Agent: reasoning-implementer
Model tier: reasoning
Session: foreground
Depends on: BP-001, BP-002
Parallel group: none
Retry limit: 1
Escalation chain: frontier-implementer

### Routing reason

This is the core state machine and model boundary. It combines checked-in prompts, model output validation, durable checkpoints, and request budgets, so it needs stronger local reasoning than ordinary endpoint wiring.

### Intent

Implement the provider abstraction and application service that proves Start → Agent → Condition Agent → Direct Reply and Needs work → Human Input pause, with no tools, loops, streaming, or automatic retries.

### Architectural decisions to preserve

- Raw server-side OpenAI Responses API behind an injected `ModelClient`.
- One Agent and one Condition Agent maximum in a request.
- Condition Agent selects a branch but preserves the Agent output.
- Persistence operations bracket model calls; no transaction spans network I/O.
- A graph rewrite invalidates a paused run.

### Semantic targets

- `ModelClient` / `OpenAIResponsesModelClient` — server-only text and scenario calls.
- `executeBuildMessage` — first-slice orchestration service.
- `Agent and Condition Agent handlers` — interpolation, output/state updates, branch selection.
- `Human Input checkpoint` and `Direct Reply completion` — terminal effects.

### Likely files

Paths are hints based on the repository at planning time.

- `apps/website/src/lib/agent-flow/model-client.ts`
- `apps/website/src/lib/agent-flow/openai-model-client.ts`
- `apps/website/src/lib/agent-flow/executor.ts`
- `apps/website/src/lib/agent-flow/executor.test.ts`
- `apps/website/.env.example`

### Implementation

1. Define a small injectable model interface with separate free-text and configured-scenario selection operations, abort/timeout support, and typed provider/configuration/output errors.
2. Implement the OpenAI Responses adapter using server-only environment reads and `fetch`; request bounded output, no tools, and strict scenario output for Condition Agent. Never send credentials or provider details to the browser or persist them in a run.
3. On a new message, load/compile the allowlisted flow, atomically create the run and user transcript line, seed Start state, and walk only the first-slice path.
4. Build Agent input from checked-in developer/system messages and interpolated user content. Provide only the bounded game transcript required by the node's memory setting. Normalize the response, update `$flow.output`, and apply bounded `agentUpdateState`.
5. Call Condition Agent once with its instructions, scenarios, and interpolated input. Reject any response outside the configured scenario set without guessing or retrying.
6. Follow Ready to Direct Reply, interpolate the preserved Agent output, persist the Cooper line, clear `activeKey`, and return a replied service result. Follow Needs work to Human Input, interpolate/normalize its prompt, persist it and pending branch metadata, and return a paused result.
7. On any compiler/provider/output/persistence error after a run exists, best-effort mark it failed with a bounded non-sensitive failure code and release the active key; log server diagnostics without returning prompts, keys, or raw provider payloads.
8. Before any resume support, compare the stored `flowHash` to the current registry hash and fail closed on mismatch.
9. Add deterministic tests with a scripted fake model proving Ready, Needs work, malformed scenario, model failure, state interpolation/update, output preservation, exactly two sequential calls on Ready, and the one-Agent/one-Condition budget.

### Do not

- Do not implement Loop, Proceed, Reject, deterministic Condition, LLM, tools, SSE, or token streaming in this step.
- Do not call a real model in tests.
- Do not let model output patch `Game.spec`.
- Do not retry the model automatically.

### Acceptance criteria

- [ ] A fake-model Ready turn appends user then Cooper, ends done, and returns the coordinator output.
- [ ] A Needs work turn appends the Human Input prompt once and leaves a complete paused checkpoint.
- [ ] State, output, current node, flow id/hash, and pending input survive through the store.
- [ ] Unknown/unsafe graph content reaches no model call.
- [ ] No request can exceed one Agent and one Condition Agent.

### Verification

```text
pnpm --filter website test
pnpm --filter website typecheck
pnpm --filter website lint
```

### Completion record

Started: 2026-09-12
Completed: 2026-09-12
Actual agent: reasoning-implementer
Attempts: 1
Result: COMPLETE
Files changed: model-client.ts, openai-model-client.ts, executor.ts, executor.test.ts, .env.example
Symbols changed: ModelClient, OpenAIResponsesModelClient, executeBuildMessage
Verification result: executor.test.ts 4/4 PASS; typecheck PASS
Deviations: none
Notes for later steps: Route wiring should instantiate OpenAIResponsesModelClient server-side; explicit test paths for nested agent-flow tests.

---

## Step BP-004: Expose the authenticated build-turn POST

Status: complete
Agent: cheap-implementer
Model tier: cheap
Session: foreground
Depends on: BP-003
Parallel group: none
Retry limit: 1
Escalation chain: reasoning-implementer -> frontier-implementer

### Routing reason

Authentication, JSON parsing, route configuration, and status mapping follow the existing `/api/games` conventions after the service boundary is complete.

### Intent

Add the Node.js POST route, strict request/response contracts, owner rate limiting, duration configuration, and route/service tests for the first slice.

### Architectural decisions to preserve

- POST JSON only; no live connection.
- Exact response body `{ status, cooperMessage, runId }`.
- Revision synchronization uses `X-Game-Revision`.
- Rate limit before model work with database and memory implementations.

### Semantic targets

- `POST /api/games/[gameId]/build-turn` — authenticated turn endpoint.
- `buildTurnInputSchema` / response types — mutually exclusive message/action shape.
- `AgentflowRateLimiter` — namespaced fixed-window model-spend control.
- HTTP error mapping — 400/401/404/409/429/500 without sensitive details.

### Likely files

Paths are hints based on the repository at planning time.

- `apps/website/src/app/api/games/[gameId]/build-turn/route.ts`
- `apps/website/src/lib/agent-flow/http-contract.ts`
- `apps/website/src/lib/agent-flow/rate-limit.ts`
- `apps/website/src/lib/agent-flow/build-turn-service.test.ts`

### Implementation

1. Add a strict union schema accepting either a trimmed 1–500 character `{ message }` or `{ action: "proceed" | "reject", feedback?: <1–500 chars> }`, rejecting mixed/extra fields. In this step, action requests map to a clear not-yet-supported service error for later completion.
2. Configure `runtime = "nodejs"`, `dynamic = "force-dynamic"`, and `maxDuration = 30` (or the nearest supported project/platform value at least 20 seconds).
3. Authenticate with the existing Better Auth session, use `session.user.id` for all ownership, and never accept owner/run/flow ids from the client.
4. Apply a documented fixed window (initially 6 model-bearing requests per owner per minute) with `Retry-After`. Namespace keys so Better Auth and build-turn counters cannot collide. The database implementation must perform atomic update/upsert semantics; the memory version must use the same window behavior.
5. Invoke the application service and map its result to the exact JSON body plus `X-Game-Revision` and `Cache-Control: no-store`.
6. Map validation, missing game, active/paused conflict, stale/hash conflict, provider configuration/failure, and unexpected errors to stable kid-safe responses. Do not return raw model, graph, or database errors.
7. Test request parsing and service-to-HTTP mapping through pure exported handlers/services where direct Next route mocking would add unnecessary dependencies.

### Do not

- Do not duplicate executor logic in the route.
- Do not use Edge runtime.
- Do not add a general unauthenticated model endpoint.
- Do not add SSE, polling, WebSockets, or provider SDKs.

### Acceptance criteria

- [ ] Authenticated message POST returns only required JSON fields and a revision header.
- [ ] Invalid/mixed action payloads, missing games, another owner's games, concurrent active runs, and over-limit requests are rejected before model execution.
- [ ] The route can accommodate two sequential model calls without Edge/runtime timeout configuration mistakes.
- [ ] Response and errors are non-cacheable and reveal no secrets/internal prompts.

### Verification

```text
pnpm --filter website test
pnpm --filter website typecheck
pnpm --filter website lint
```

### Completion record

Started: 2026-09-12
Completed: 2026-09-12
Actual agent: cheap-implementer
Attempts: 1
Result: COMPLETE
Files changed: http-contract.ts, rate-limit.ts, build-turn-service.ts, build-turn-service.test.ts, build-turn/route.ts
Symbols changed: buildTurnInputSchema, AgentflowRateLimiter, processBuildTurn, mapBuildTurnFailure
Verification result: build-turn-service.test.ts PASS; all agent-flow tests 20/20; typecheck PASS
Deviations: none
Notes for later steps: BP-005 should wire resume actions into processBuildTurn (currently resume_not_supported).

---

## Step BP-005: Complete closed-set resume and bounded loops

Status: complete
Agent: reasoning-implementer
Model tier: reasoning
Session: foreground
Depends on: BP-004
Parallel group: none
Retry limit: 1
Escalation chain: frontier-implementer

### Routing reason

Resuming exact branch handles across requests, preserving output, incrementing durable loop counts, and enforcing a per-request node budget is a nontrivial extension of the proven state machine.

### Intent

Add Human Input Proceed/Reject, LLM, deterministic Condition, and bounded Loop execution so every node in the declared closed set is honest and the checked-in starter can resume, while tools remain rejected.

### Architectural decisions to preserve

- Resume finds the single owner/game paused run; the body does not choose a run.
- Reject follows its edge to Direct Reply without another model call.
- Proceed follows Loop, increments a persisted count, and permits at most one Agent/LLM plus one Condition Agent in that POST.
- Loop limits span requests; no invocation runs three retries.

### Semantic targets

- `resumeBuildTurn` — paused-run claim and action routing.
- `Execution budget` — per-request Agent/LLM and Condition Agent counters.
- `LLM handler` — Agent code path without tools.
- `Condition handler` — safe deterministic branch.
- `Loop handler` — explicit Flowise target resolution and durable count.

### Likely files

Paths are hints based on the repository at planning time.

- `apps/website/src/lib/agent-flow/executor.ts`
- `apps/website/src/lib/agent-flow/run-store.ts`
- `apps/website/src/lib/agent-flow/executor.test.ts`
- `apps/website/src/app/api/games/[gameId]/build-turn/route.ts`

### Implementation

1. Claim only the current owner/game paused run with compare-and-swap revision, set it running with a lease, and verify its flow id/hash before following any action edge.
2. Match Proceed/Reject using the Human Input output handle/branch label captured at pause; reject missing or ambiguous branches.
3. Store optional feedback as a bounded user transcript line and `$flow.state.humanFeedback`. Make it available to a resumed Agent through the run context without adding new executable template syntax; preserve the original question separately.
4. Reject follows Direct Reply and completes from preserved `$flow.output`. Proceed follows the starter Loop, resolves its Flowise-shaped target through the compiler, increments that Loop node's count, and fails terminally once `maxLoopCount` would be exceeded.
5. Add LLM using the same model path as Agent but reject any tool-like configuration. Honor its checked-in messages/user input/output-state options.
6. Add deterministic Condition using the compiler's operation subset and branch handles, preserving `$flow.output`.
7. Enforce an execution budget object on every walk. Stop/fail if a request would enter a second Agent/LLM or second Condition Agent; do not silently checkpoint at an arbitrary node.
8. Allow repeated Proceed requests to consume one loop iteration each and pause again when Condition Agent still selects Needs work; a later Reject returns the latest coordinator output.
9. Expand endpoint and executor tests with the real starter graph: paused Reject, Proceed then Ready, Proceed then pause, feedback propagation, concurrent double-resume, hash mismatch, loop exhaustion, LLM, deterministic Condition, and execution-budget violations.

### Do not

- Do not run all three starter retries in one request.
- Do not infer branches by array position when a validated source handle/label exists.
- Do not add tools, HTTP calls, custom functions, retrievers, nested flows, or arbitrary conditions.
- Do not create a live connection for paused runs.

### Acceptance criteria

- [ ] Both action payloads resume only the authenticated game's paused row.
- [ ] Reject completes without a model call; Proceed executes at most one Agent/LLM and one Condition Agent.
- [ ] Loop counts persist and enforce the authored maximum across requests.
- [ ] LLM and deterministic Condition share the safe primitives and fail closed on unsupported configuration.
- [ ] The complete declared closed set is implemented, with Sticky ignored and tools still rejected.

### Verification

```text
pnpm --filter website test
pnpm --filter website typecheck
pnpm --filter website lint
```

### Completion record

Started: 2026-09-12
Completed: 2026-09-12
Actual agent: reasoning-implementer
Attempts: 1
Result: COMPLETE
Files changed: executor.ts, build-turn-service.ts, contract.ts, executor.test.ts, build-turn-service.test.ts
Symbols changed: resumeBuildTurn, bounded execution walk, LLM/Condition handlers, processBuildTurn action routing
Verification result: executor + build-turn tests PASS; typecheck PASS
Deviations: none
Notes for later steps: Resume actions not rate-limited (Reject has no model); Proceed bounded to one model invocation.

---

## Step BP-006: Wire Cooper chat to build-turn

Status: complete
Agent: reasoning-implementer
Model tier: reasoning
Session: foreground
Depends on: BP-005
Parallel group: none
Retry limit: 1
Escalation chain: frontier-implementer

### Routing reason

The visible UI change is small, but current chat persistence is coupled to a sibling autosave component with private identity/revision refs. Synchronizing server-written chat without revision conflicts requires moderate React state reasoning.

### Intent

Replace Cooper's echo with real POST turns, render pause actions and feedback, and synchronize server-persisted transcript/revision into the existing build history/autosave path.

### Architectural decisions to preserve

- The server is authoritative for turn transcript writes.
- The required response body remains unchanged; revision comes from the header.
- A spinner is sufficient; no streaming.
- A turn cannot be sent until the game has an id.

### Semantic targets

- `BuildSetupContext` — shared saved game identity and persisted-turn event.
- `BuildGamePreview persistence coordinator` — publishes id/revision and accepts server-written chat without a redundant PATCH.
- `BuildChat` — message POST, paused controls, feedback, error/retry state.
- `builderChatHistory` rendering — existing bounded kid-visible log.

### Likely files

Paths are hints based on the repository at planning time.

- `apps/website/src/app/build/build-setup.tsx`
- `apps/website/src/app/build/build-game-preview.tsx`
- `apps/website/src/app/build/build-chat.tsx`
- `apps/website/src/app/build/build.module.css`
- `apps/website/src/app/build/build-setup.test.ts`
- `apps/website/src/lib/game-history.ts`

### Implementation

1. Move/expose the currently private `{ id, revision }` identity through the build context. `BuildGamePreview` remains the creator/PATCH owner for ordinary setup changes and publishes identity after initial load/create/save.
2. Add a context operation for a build-turn result that receives the submitted visible user/feedback line, returned Cooper line, status/run id, and parsed `X-Game-Revision`. It updates local chat/history and the preview's identity/saved-spec refs as already persisted, preventing a duplicate PATCH or stale-revision conflict.
3. Disable free-chat submission while no saved game id is available, while a turn is pending, or while a paused prompt awaits action. Preserve the current 500-character client limit but rely on server validation.
4. POST `{ message }` to the encoded game route, show the existing Cooper spinner for the whole request, parse only the declared response shape, and apply the server-persisted transcript locally.
5. On `paused`, render Proceed and Reject controls next to the latest prompt plus an optional bounded feedback field. POST the action without a run id; retain the paused controls after recoverable network/5xx errors and disable them during a request.
6. On replied, clear paused UI and allow the next message to create a new run. On 409 hash/stale state, explain that the flow changed and require a fresh message rather than attempting hidden recovery.
7. Keep setup-choice transcript behavior unchanged. Remove the echo behavior and ensure all model text is rendered as text, never HTML.
8. Extract/test pure response/reducer helpers with the existing Node test stack for replied, paused, resume, malformed response/header, revision synchronization, duplicate-click suppression state, and max-history trimming.

### Do not

- Do not optimistically persist model replies through the existing debounced PATCH.
- Do not send owner id, flow id, or run id from the browser.
- Do not add SSE, token rendering, WebSockets, polling, or a new client dependency.
- Do not make the Game Editor part of runtime execution.

### Acceptance criteria

- [ ] Sending a chat message shows one user line, a spinner, and the server's Cooper line rather than an echo.
- [ ] A paused result survives page reload through Game chat plus the run row and exposes Proceed/Reject on the next loaded build page.
- [ ] Proceed/Reject uses another POST and cannot be double-submitted.
- [ ] Subsequent ordinary Game PATCH saves use the revision produced by build-turn and do not return 409 from self-conflict.
- [ ] No streamed transport or client-side provider secret exists.

### Verification

```text
pnpm --filter website test
pnpm --filter website typecheck
pnpm --filter website lint
pnpm --filter website build
```

### Completion record

Started: 2026-09-12
Completed: 2026-09-12
Actual agent: reasoning-implementer
Attempts: 1
Result: COMPLETE
Files changed: build-setup.tsx, build-chat.tsx, build-game-preview.tsx, page.tsx, build.module.css, build-setup.test.ts
Symbols changed: parseBuildTurnResult, persistedBuildTurn, BuildChat build-turn UI, BuildSetupContext identity
Verification result: build-setup.test.ts 8/8 PASS; typecheck PASS; build PASS (with full permissions)
Deviations: none
Notes for later steps: Resume feedback rendered only when server-persisted.

---

## Step BP-007: Align the authoring editor with runtime support

Status: complete
Agent: cheap-implementer-bg
Model tier: cheap
Session: background
Depends on: BP-001
Parallel group: editor-alignment
Retry limit: 1
Escalation chain: reasoning-implementer -> frontier-implementer

### Routing reason

The runtime contract is fixed in BP-001, and this is an isolated sibling-repository palette, validation-copy, and documentation update that does not overlap website implementation.

### Intent

Keep the visual Flowise JSON editor while making its creation palette and validation accurately describe the website's closed runtime and authoring-only role.

### Architectural decisions to preserve

- Preserve Flowise Agentflow V2 JSON and unknown fields during round trips.
- Offer only the closed runtime node set plus Sticky Note for newly authored flows.
- Unsupported imported nodes remain visible/preserved but are execution errors.
- The editor never runs the flow or stores credentials.

### Semantic targets

- `NODE_DEFINITIONS` — closed creation palette.
- `validationResults` — runtime-compatibility diagnostics.
- `Agent Flows` UI copy/README — website runner ownership and server-configured models.
- `server.py` portable validator — structural safety remains separate from runtime compatibility.

### Likely files

Paths are hints based on the repository at planning time.

- `/media/sean/work/www/game_editor/agent-flow-editor.js`
- `/media/sean/work/www/game_editor/agent-flows.html`
- `/media/sean/work/www/game_editor/README.md`
- `/media/sean/work/www/game_editor/server.py`

### Implementation

1. Remove Iteration, Tool, HTTP, Retriever, Execute Flow, and Custom Function from the new-node palette. Keep Start, Agent, LLM, Condition, Condition Agent, Human Input, Loop, Direct Reply, and Sticky Note.
2. Keep normalization/import/save preservation behavior unchanged so an imported future/unknown Flowise node is not destructively rewritten.
3. Extend client validation to report unsupported or mismatched `data.name`/`data.type`, non-empty Agent tools, invalid Loop targets/counts, unsupported deterministic operations, and malformed closed-set branches as runtime-blocking errors.
4. Change model-field help from “Flowise connector” to server-configured model policy. Do not write provider keys/model secrets into flow JSON; blank connector fields are acceptable when the website's server policy supplies the model.
5. Update HTML/README language to say the editor authors compatible JSON and `apps/website` executes it. Remove the claim that Flowise remains responsible for execution while retaining JSON portability wording.
6. Leave `server.py`'s structural, size, filename, and atomic-write protections intact. Do not make structural save validation reject unknown imported metadata; runtime compatibility is reported by the editor and enforced authoritatively by the website compiler.
7. Add a small Python or Node fixture check only if it fits the repository's dependency-free tooling; otherwise perform explicit manual validation against `apps/game/agent-flows/build_agentflow_v1.json`.

### Do not

- Do not build an executor in the Python server.
- Do not add credentials, model calls, or run persistence to the editor.
- Do not silently delete unsupported imported nodes or unknown JSON fields.
- Do not edit feature code in `apps/website` from this background step.

### Acceptance criteria

- [ ] New flows can use exactly the website closed set plus Sticky Note.
- [ ] The checked-in starter opens, validates, edits, and saves without format loss.
- [ ] Unsupported imported nodes remain round-trippable but receive a clear execution-blocking diagnostic.
- [ ] Editor documentation identifies the website as runner and omits Flowise hosting/execution guidance.

### Verification

```text
cd /media/sean/work/www/game_editor
node --check agent-flow-editor.js
python3 -m py_compile server.py
Manual: run server.py with SPLAT_LAB_GAME_ROOT=/media/sean/work/www/chickensplat/apps/game, open build_agentflow_v1.json, validate it, export it, and compare nodes/edges/raw inputs for preservation.
```

### Completion record

Started: 2026-09-12
Completed: 2026-09-12
Actual agent: cheap-implementer-bg
Attempts: 1
Result: COMPLETE
Files changed: game_editor/agent-flow-editor.js, agent-flows.html, README.md
Symbols changed: RUNTIME_NODE_TYPES, validationResults, NODE_DEFINITIONS palette trim
Verification result: node --check PASS; py_compile PASS; starter flow manual validation PASS
Deviations: none
Notes for later steps: server.py unchanged; structural vs runtime validation split preserved.

---

## Step BR-101: Enforce atomic model-work rate limiting

Status: complete
Agent: reasoning-implementer
Model tier: reasoning
Session: foreground
Depends on: none
Parallel group: remediation-a
Retry limit: 1
Escalation chain: frontier-implementer

### Intent

Ensure every model-bearing POST is limited before provider initialization or invocation. Proceed consumes rate-limit capacity; Reject remains unmetered and works without OpenAI configuration.

### Likely files

- `apps/website/src/lib/agent-flow/build-turn-service.ts`
- `apps/website/src/lib/agent-flow/rate-limit.ts`
- `apps/website/src/lib/agent-flow/build-turn-service.test.ts`

### Acceptance criteria

- [ ] Proceed returns 429 after shared allowance exhausted without claiming paused run.
- [ ] Reject succeeds with missing OpenAI configuration.
- [ ] Concurrent consumes allow no more than six requests per window.
- [ ] Memory and Prisma behavior remain equivalent.

### Verification

```text
pnpm --filter website exec node --import tsx --test src/lib/agent-flow/build-turn-service.test.ts
pnpm --filter website typecheck
```

### Completion record

Started: —
Completed: —
Actual agent: —
Attempts: 0
Result: —
Files changed: —
Verification result: —
Deviations: —
Notes for later steps: —

---

## Step BR-102: Prevent transcript and game-edit data loss

Status: complete
Agent: reasoning-implementer
Model tier: reasoning
Session: foreground
Depends on: none
Parallel group: remediation-a
Retry limit: 1
Escalation chain: frontier-implementer

### Intent

Preserve concurrent ordinary game edits while atomically appending transcript/run transitions using Game revision CAS/retry.

### Likely files

- `apps/website/src/lib/agent-flow/run-store.ts`
- `apps/website/src/app/build/build-game-preview.tsx`
- `apps/website/src/app/build/build-setup.tsx`

### Acceptance criteria

- [ ] Overlapping PATCH and build-turn cannot overwrite either change.
- [ ] Editing preview while Cooper responds remains dirty and is subsequently saved.
- [ ] Stale second tab cannot erase newer transcript entries.
- [ ] Memory fallback preserves equivalent behavior.

### Verification

```text
pnpm --filter website exec node --import tsx --test src/lib/agent-flow/run-store.test.ts src/app/build/build-setup.test.ts
pnpm --filter website typecheck
pnpm --filter website build
```

### Completion record

Started: —
Completed: —
Actual agent: —
Attempts: 0
Result: —
Files changed: —
Verification result: —
Deviations: —
Notes for later steps: —

---

## Step BR-103: Align compiler and editor contracts

Status: complete
Agent: reasoning-implementer
Model tier: reasoning
Session: foreground
Depends on: none
Parallel group: remediation-a
Retry limit: 1
Escalation chain: frontier-implementer

### Intent

Make every editor-supported closed-set node compile and execute with the same bounded schema; align Loop max with runtime bound of 20.

### Likely files

- `apps/website/src/lib/agent-flow/contract.ts`
- `apps/website/src/lib/agent-flow/executor.ts`
- `apps/website/src/lib/agent-flow/compiler.test.ts`
- `/media/sean/work/www/game_editor/agent-flow-editor.js`

### Acceptance criteria

- [ ] Editor-compatible flow compiles and runs.
- [ ] Invalid supported-node configuration fails before model call.
- [ ] Runtime and editor enforce identical Loop bounds.
- [ ] LLM, deterministic Condition, hash mismatch, loop exhaustion, execution-budget tests present.

### Verification

```text
pnpm --filter website exec node --import tsx --test src/lib/agent-flow/compiler.test.ts src/lib/agent-flow/executor.test.ts
node --check /media/sean/work/www/game_editor/agent-flow-editor.js
```

### Completion record

Started: —
Completed: —
Actual agent: —
Attempts: 0
Result: —
Files changed: —
Verification result: —
Deviations: —
Notes for later steps: —

---

## Step BR-104: Honor bounded conversation memory

Status: complete
Agent: reasoning-implementer
Model tier: reasoning
Session: foreground
Depends on: BR-102, BR-103
Parallel group: remediation-b
Retry limit: 1
Escalation chain: frontier-implementer

### Intent

Honor starter `agentEnableMemory: true` using bounded persisted `builderChatHistory`.

### Likely files

- `apps/website/src/lib/agent-flow/executor.ts`
- `apps/website/src/lib/agent-flow/model-client.ts`
- `apps/website/src/lib/agent-flow/run-store.ts`

### Acceptance criteria

- [ ] Checked-in starter receives prior conversation history.
- [ ] Memory-disabled nodes receive none.
- [ ] Roles, ordering, trimming, deduplication tested.
- [ ] Cross-owner history cannot enter a request.

### Verification

```text
pnpm --filter website exec node --import tsx --test src/lib/agent-flow/executor.test.ts
pnpm --filter website typecheck
pnpm --filter website build
```

### Completion record

Started: —
Completed: —
Actual agent: —
Attempts: 0
Result: —
Files changed: —
Verification result: —
Deviations: —
Notes for later steps: —

---

## Step BR-105: Parse raw OpenAI Responses correctly

Status: complete
Agent: cheap-implementer
Model tier: cheap
Session: foreground
Depends on: none
Parallel group: remediation-c
Retry limit: 1
Escalation chain: reasoning-implementer -> frontier-implementer

### Intent

Fix raw REST Responses API output parsing; extract text from output array; store:false; mocked-fetch tests.

### Likely files

- `apps/website/src/lib/agent-flow/openai-model-client.ts`
- `apps/website/src/lib/agent-flow/openai-model-client.test.ts`

### Verification

```text
pnpm --filter website exec node --import tsx --test src/lib/agent-flow/openai-model-client.test.ts src/lib/agent-flow/executor.test.ts
pnpm --filter website typecheck
pnpm --filter website build
```

### Completion record

Started: 2026-09-12
Completed: 2026-09-12
Actual agent: cheap-implementer
Attempts: 1
Result: COMPLETE
Files changed: openai-model-client.ts, openai-model-client.test.ts, server-only-hook.mjs
Verification result: openai + executor tests PASS; typecheck PASS; build PASS
Deviations: Added server-only-hook.mjs for node:test imports
Notes for later steps: —

---

## Step BR-106: Close editor/runtime validation gaps

Status: complete
Agent: reasoning-implementer
Model tier: reasoning
Session: foreground
Depends on: none
Parallel group: remediation-c
Retry limit: 1
Escalation chain: frontier-implementer

### Intent

Align LLM memory defaults, deterministic Condition True/False branches, Start chatInput-only semantics across compiler and editor.

### Likely files

- `apps/website/src/lib/agent-flow/contract.ts`
- `apps/website/src/lib/agent-flow/compiler.test.ts`
- `/media/sean/work/www/game_editor/agent-flow-editor.js`

### Verification

```text
pnpm --filter website exec node --import tsx --test src/lib/agent-flow/compiler.test.ts
node --check /media/sean/work/www/game_editor/agent-flow-editor.js
```

### Completion record

Started: 2026-09-12
Completed: 2026-09-12
Actual agent: reasoning-implementer
Attempts: 1
Result: COMPLETE
Files changed: contract.ts, compiler.test.ts, game_editor/agent-flow-editor.js
Verification result: compiler tests PASS; node --check PASS
Deviations: none
Notes for later steps: —

---

## Step BP-999: Final integration review

Status: complete
Agent: frontier-reviewer
Model tier: frontier
Session: foreground
Depends on: BP-001, BP-002, BP-003, BP-004, BP-005, BP-006, BP-007, BR-101, BR-102, BR-103, BR-104, BR-105, BR-106
Parallel group: none
Retry limit: 0
Escalation chain: stop

### Routing reason

A single frontier review after implementation is cheaper than frontier review after every step and catches cross-step state, security, and sibling-repository integration problems.

### Intent

Review the completed implementation as a whole against the original objective and architectural decisions.

### Architectural decisions to preserve

- All global architectural decisions in this plan.

### Semantic targets

- The complete diff in both repositories and all behavior changed by this plan.
- The checked-in `build_agentflow_v1` end-to-end message, pause, Proceed, Reject, and loop paths.
- Owner isolation, active-run concurrency, flow-hash resume protection, rate limiting, provider secrecy, and Game revision synchronization.

### Likely files

Paths are hints based on the repository at planning time.

- All files changed by completed implementation/remediation steps in `/media/sean/work/www/chickensplat` and `/media/sean/work/www/game_editor`.

### Implementation

1. Review only; do not edit implementation files.
2. Check correctness, integration, regressions, security implications, error handling, contracts, unnecessary complexity, and coverage.
3. Explicitly verify that unknown nodes/non-empty tools/custom functions cannot invoke side effects, cross-owner resume is impossible, duplicate requests cannot double-spend model calls unnoticed, and no transaction spans model I/O.
4. Confirm the first-slice tests are independently identifiable before Loop tests, and that complete closed-set behavior still enforces one Agent/LLM plus one Condition Agent per POST.
5. Confirm the exact response body, revision header, Node runtime/max duration, memory fallback, Prisma-only migration, transcript limits, and no SSE/WebSocket/GCP/Flowise-hosting scope.
6. Return `REVIEW_RESULT: PASS` when no material issue remains.
7. If material issues remain, return `REVIEW_RESULT: REMEDIATION_REQUIRED` followed by complete remediation step packets using the same step schema and cost-routing rules.
8. Do not create remediation for optional stylistic preferences.

### Do not

- Rewrite working code for style preference.
- Edit code directly.
- Request remediation for speculative improvements unrelated to the feature.

### Acceptance criteria

- [ ] Original feature requirements are satisfied.
- [ ] Cross-step integration is coherent across both repositories.
- [ ] No material regression, ownership/concurrency flaw, unsafe node path, or secret exposure remains.
- [ ] Deterministic verification passes and the actual checked-in starter is covered.

### Verification

```text
cd /media/sean/work/www/chickensplat
pnpm --filter website exec prisma validate
pnpm --filter website test
pnpm --filter website typecheck
pnpm --filter website lint
pnpm --filter website build
cd /media/sean/work/www/game_editor
node --check agent-flow-editor.js
python3 -m py_compile server.py
Review completed plan records, both repository diffs, migration SQL, and targeted end-to-end/manual results.
```

### Completion record

Started: 2026-09-12
Completed: 2026-09-12
Actual agent: frontier-reviewer
Attempts: 2
Result: PASS
Files changed: none
Verification result: 52 focused tests PASS; typecheck PASS; build PASS; cycle-2 review PASS
Deviations: —
Notes for later steps: —
