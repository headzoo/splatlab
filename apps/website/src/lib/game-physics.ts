import { z } from "zod";

import catalogPlatformerPhysics from "../../../game/game-physics/platformer_small_01.json";
import platformerBaseProfile from "../../../game/physics-specs/platformer_standard_v1.json";

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_PROMPT_LENGTH = 1000;
const MAX_OPERATIONS = 16;

/**
 * Bounds mirror apps/game/game-physics/game-physics.schema.json. The kid-facing
 * ranges are the only movement values Cooper may change; collider geometry,
 * tick rate, and trigger semantics stay in the trusted base profile.
 */
export const GAME_PHYSICS_BOUNDS = {
  speedTilesPerSecond: { minimum: 0.5, maximum: 12 },
  accelerationSeconds: { minimum: 0.05, maximum: 2 },
  jumpHeightTiles: { minimum: 0.5, maximum: 8 },
  timeToApexSeconds: { minimum: 0.15, maximum: 1.5 },
  maximumFallSpeedTilesPerSecond: { minimum: 2, maximum: 30 },
  ticks: { minimum: 0, maximum: 12 },
  earlyReleaseVelocityMultiplier: { minimum: 0.1, maximum: 1 },
  flightSpeedTilesPerSecond: { minimum: 0.5, maximum: 10 },
} as const;

export type GamePhysicsFieldDescriptor =
  | Readonly<{ path: string; kind: "number" | "integer"; minimum: number; maximum: number }>
  | Readonly<{ path: string; kind: "enum"; values: readonly string[] }>;

const VERTICAL_MODES = ["grounded_jump", "flight"] as const;

/**
 * The editable surface Cooper is told about, and the single source for
 * `editPolicy.allowedPaths`.
 */
export const PLATFORMER_EDITABLE_FIELDS: readonly GamePhysicsFieldDescriptor[] = [
  { path: "/movement/maximumRunSpeedTilesPerSecond", kind: "number", ...GAME_PHYSICS_BOUNDS.speedTilesPerSecond },
  { path: "/movement/groundTimeToMaximumSpeedSeconds", kind: "number", ...GAME_PHYSICS_BOUNDS.accelerationSeconds },
  { path: "/movement/groundTimeToStopSeconds", kind: "number", ...GAME_PHYSICS_BOUNDS.accelerationSeconds },
  { path: "/movement/airTimeToMaximumSpeedSeconds", kind: "number", ...GAME_PHYSICS_BOUNDS.accelerationSeconds },
  { path: "/verticalMovement/mode", kind: "enum", values: VERTICAL_MODES },
  { path: "/verticalMovement/groundedJump/jumpHeightTiles", kind: "number", ...GAME_PHYSICS_BOUNDS.jumpHeightTiles },
  { path: "/verticalMovement/groundedJump/timeToApexSeconds", kind: "number", ...GAME_PHYSICS_BOUNDS.timeToApexSeconds },
  { path: "/verticalMovement/groundedJump/maximumFallSpeedTilesPerSecond", kind: "number", ...GAME_PHYSICS_BOUNDS.maximumFallSpeedTilesPerSecond },
  { path: "/verticalMovement/groundedJump/coyoteTimeTicks", kind: "integer", ...GAME_PHYSICS_BOUNDS.ticks },
  { path: "/verticalMovement/groundedJump/inputBufferTicks", kind: "integer", ...GAME_PHYSICS_BOUNDS.ticks },
  { path: "/verticalMovement/groundedJump/earlyReleaseVelocityMultiplier", kind: "number", ...GAME_PHYSICS_BOUNDS.earlyReleaseVelocityMultiplier },
  { path: "/verticalMovement/flight/maximumRiseSpeedTilesPerSecond", kind: "number", ...GAME_PHYSICS_BOUNDS.flightSpeedTilesPerSecond },
  { path: "/verticalMovement/flight/maximumFallSpeedTilesPerSecond", kind: "number", ...GAME_PHYSICS_BOUNDS.flightSpeedTilesPerSecond },
  { path: "/verticalMovement/flight/timeToMaximumSpeedSeconds", kind: "number", ...GAME_PHYSICS_BOUNDS.accelerationSeconds },
  { path: "/verticalMovement/flight/timeToStopSeconds", kind: "number", ...GAME_PHYSICS_BOUNDS.accelerationSeconds },
];

export const TOP_DOWN_EDITABLE_FIELDS: readonly GamePhysicsFieldDescriptor[] = [
  { path: "/movement/maximumSpeedTilesPerSecond", kind: "number", ...GAME_PHYSICS_BOUNDS.speedTilesPerSecond },
];

export const PLATFORMER_EDITABLE_PATHS = PLATFORMER_EDITABLE_FIELDS.map((field) => field.path);
export const TOP_DOWN_EDITABLE_PATHS = TOP_DOWN_EDITABLE_FIELDS.map((field) => field.path);

export function editableFieldsFor(runtime: GamePhysicsDocument["runtime"]) {
  return runtime === "platformer_v1" ? PLATFORMER_EDITABLE_FIELDS : TOP_DOWN_EDITABLE_FIELDS;
}

function bounded(range: { minimum: number; maximum: number }) {
  return z.number().min(range.minimum).max(range.maximum);
}

function boundedInteger(range: { minimum: number; maximum: number }) {
  return z.number().int().min(range.minimum).max(range.maximum);
}

function allowedPathsSchema(paths: readonly string[]) {
  return z
    .array(z.string())
    .refine(
      (value) =>
        value.length === paths.length && paths.every((path) => value.includes(path)),
      { message: "editPolicy.allowedPaths must match the runtime's supported tuning fields" },
    );
}

function editPolicySchema(paths: readonly string[]) {
  return z
    .object({
      agentEditable: z.literal(true),
      applyTiming: z.literal("next_simulation_reset"),
      allowedPaths: allowedPathsSchema(paths),
    })
    .strict();
}

const provenanceSchema = z
  .object({
    lastEditedBy: z.enum(["system_default", "user", "cooper"]),
    lastPrompt: z.string().max(MAX_PROMPT_LENGTH).nullable(),
  })
  .strict();

const documentIdentitySchema = {
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  revision: z.number().int().min(1),
  baseProfileId: z.string().regex(/^[a-z][a-z0-9_]*_v[0-9]+$/),
  provenance: provenanceSchema,
};

const groundedJumpSchema = z
  .object({
    jumpHeightTiles: bounded(GAME_PHYSICS_BOUNDS.jumpHeightTiles),
    timeToApexSeconds: bounded(GAME_PHYSICS_BOUNDS.timeToApexSeconds),
    maximumFallSpeedTilesPerSecond: bounded(GAME_PHYSICS_BOUNDS.maximumFallSpeedTilesPerSecond),
    coyoteTimeTicks: boundedInteger(GAME_PHYSICS_BOUNDS.ticks),
    inputBufferTicks: boundedInteger(GAME_PHYSICS_BOUNDS.ticks),
    earlyReleaseVelocityMultiplier: bounded(GAME_PHYSICS_BOUNDS.earlyReleaseVelocityMultiplier),
  })
  .strict();

const flightSchema = z
  .object({
    maximumRiseSpeedTilesPerSecond: bounded(GAME_PHYSICS_BOUNDS.flightSpeedTilesPerSecond),
    maximumFallSpeedTilesPerSecond: bounded(GAME_PHYSICS_BOUNDS.flightSpeedTilesPerSecond),
    timeToMaximumSpeedSeconds: bounded(GAME_PHYSICS_BOUNDS.accelerationSeconds),
    timeToStopSeconds: bounded(GAME_PHYSICS_BOUNDS.accelerationSeconds),
  })
  .strict();

const platformerGamePhysicsSchema = z
  .object({
    ...documentIdentitySchema,
    runtime: z.literal("platformer_v1"),
    movement: z
      .object({
        maximumRunSpeedTilesPerSecond: bounded(GAME_PHYSICS_BOUNDS.speedTilesPerSecond),
        groundTimeToMaximumSpeedSeconds: bounded(GAME_PHYSICS_BOUNDS.accelerationSeconds),
        groundTimeToStopSeconds: bounded(GAME_PHYSICS_BOUNDS.accelerationSeconds),
        airTimeToMaximumSpeedSeconds: bounded(GAME_PHYSICS_BOUNDS.accelerationSeconds),
      })
      .strict(),
    verticalMovement: z
      .object({
        mode: z.enum(VERTICAL_MODES),
        groundedJump: groundedJumpSchema,
        flight: flightSchema,
      })
      .strict(),
    editPolicy: editPolicySchema(PLATFORMER_EDITABLE_PATHS),
  })
  .strict();

const topDownGamePhysicsSchema = z
  .object({
    ...documentIdentitySchema,
    runtime: z.literal("top_down_v1"),
    movement: z
      .object({
        maximumSpeedTilesPerSecond: bounded(GAME_PHYSICS_BOUNDS.speedTilesPerSecond),
      })
      .strict(),
    editPolicy: editPolicySchema(TOP_DOWN_EDITABLE_PATHS),
  })
  .strict();

export const gamePhysicsDocumentSchema = z.discriminatedUnion("runtime", [
  platformerGamePhysicsSchema,
  topDownGamePhysicsSchema,
]);

export type PlatformerGamePhysicsDocument = z.infer<typeof platformerGamePhysicsSchema>;
export type GamePhysicsDocument = z.infer<typeof gamePhysicsDocumentSchema>;

export const cooperPhysicsOperationSchema = z
  .object({
    op: z.literal("replace"),
    path: z.string().min(2).max(200),
    value: z.union([z.number(), z.string(), z.boolean()]),
  })
  .strict();

export const cooperPhysicsPatchSchema = z
  .object({
    baseRevision: z.number().int().min(1),
    prompt: z.string().trim().min(1).max(MAX_PROMPT_LENGTH),
    operations: z.array(cooperPhysicsOperationSchema).min(1).max(MAX_OPERATIONS),
  })
  .strict();

export type CooperPhysicsPatch = z.infer<typeof cooperPhysicsPatchSchema>;

export class GamePhysicsPatchError extends Error {
  /** Short, kid-safe explanation Cooper can repeat in chat. */
  readonly reason: string;

  constructor(reason: string, detail?: string) {
    super(detail ? `${reason} (${detail})` : reason);
    this.name = "GamePhysicsPatchError";
    this.reason = reason;
  }
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export const PLATFORMER_TILE_SIZE_PX = platformerBaseProfile.units.tileSizePx;

/**
 * The base profile's level-design envelope. Cooper may not tune the game below
 * the reach the handcrafted levels require, or the critical path stops being
 * completable.
 */
export const PLATFORMER_LEVEL_DESIGN = deepFreeze({
  maximumCriticalPathGapTiles: platformerBaseProfile.levelDesign.maximumCriticalPathGapTiles,
  maximumDirectRiseTiles: platformerBaseProfile.levelDesign.maximumDirectRiseTiles,
  minimumJumpHeightMarginPx: platformerBaseProfile.levelDesign.minimumJumpHeightMarginPx,
  minimumJumpRangeMarginPx: platformerBaseProfile.levelDesign.minimumJumpRangeMarginPx,
});

export const CATALOG_PLATFORMER_GAME_PHYSICS: PlatformerGamePhysicsDocument = deepFreeze(
  platformerGamePhysicsSchema.parse(catalogPlatformerPhysics),
);

/**
 * The reach implied by a document with no collision, mirroring
 * derive_platformer_metrics in apps/game/tools/physics.py. The resolver derives
 * gravity from jump height and apex time, so the apex is exactly the authored
 * jump height.
 */
export function platformerJumpEnvelope(document: PlatformerGamePhysicsDocument) {
  const jump = document.verticalMovement.groundedJump;
  const apexHeightPx = jump.jumpHeightTiles * PLATFORMER_TILE_SIZE_PX;
  const runSpeedPx = document.movement.maximumRunSpeedTilesPerSecond * PLATFORMER_TILE_SIZE_PX;
  return {
    apexHeightPx,
    sameHeightRangeAtMaxSpeedPx: runSpeedPx * 2 * jump.timeToApexSeconds,
    requiredApexHeightPx:
      PLATFORMER_LEVEL_DESIGN.maximumDirectRiseTiles * PLATFORMER_TILE_SIZE_PX
      + PLATFORMER_LEVEL_DESIGN.minimumJumpHeightMarginPx,
    requiredRangePx:
      PLATFORMER_LEVEL_DESIGN.maximumCriticalPathGapTiles * PLATFORMER_TILE_SIZE_PX
      + PLATFORMER_LEVEL_DESIGN.minimumJumpRangeMarginPx,
  };
}

export function assertJumpEnvelope(document: GamePhysicsDocument): void {
  if (document.runtime !== "platformer_v1") return;
  if (document.verticalMovement.mode !== "grounded_jump") return;

  const envelope = platformerJumpEnvelope(document);
  if (envelope.apexHeightPx < envelope.requiredApexHeightPx) {
    throw new GamePhysicsPatchError(
      "That jump is too low to reach the platforms in this game.",
      `apex ${envelope.apexHeightPx}px is below the required ${envelope.requiredApexHeightPx}px`,
    );
  }
  if (envelope.sameHeightRangeAtMaxSpeedPx < envelope.requiredRangePx) {
    throw new GamePhysicsPatchError(
      "That jump is too short to clear the gaps in this game.",
      `range ${envelope.sameHeightRangeAtMaxSpeedPx}px is below the required ${envelope.requiredRangePx}px`,
    );
  }
}

/** The document a saved game actually runs: its Cooper fork, else the catalog. */
export function effectiveGamePhysics(spec: {
  physicsDocument?: GamePhysicsDocument;
}): GamePhysicsDocument {
  return spec.physicsDocument ?? CATALOG_PLATFORMER_GAME_PHYSICS;
}

/**
 * Player-side resolution. The catalog fallback stays a parameter so the runtime
 * keeps using `GAME_PLAYER_CONTENT.physics`, and a stored document for another
 * runtime is ignored rather than handed to the platformer engine.
 */
export function effectivePlatformerGamePhysics<Catalog extends { runtime: "platformer_v1" }>(
  physicsDocument: GamePhysicsDocument | undefined,
  catalog: Catalog,
): PlatformerGamePhysicsDocument | Catalog {
  return physicsDocument?.runtime === "platformer_v1" ? physicsDocument : catalog;
}

function replaceAtPath(document: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.replace(/^\//, "").split("/");
  let target: Record<string, unknown> = document;

  for (const segment of segments.slice(0, -1)) {
    if (UNSAFE_KEYS.has(segment)) {
      throw new GamePhysicsPatchError("Cooper cannot change that setting.", `unsafe segment ${segment}`);
    }
    const next = target[segment];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      throw new GamePhysicsPatchError("Cooper cannot change that setting.", `missing path ${path}`);
    }
    target = next as Record<string, unknown>;
  }

  const leaf = segments[segments.length - 1];
  if (UNSAFE_KEYS.has(leaf) || !Object.hasOwn(target, leaf)) {
    throw new GamePhysicsPatchError("Cooper cannot change that setting.", `missing path ${path}`);
  }
  target[leaf] = value;
}

/**
 * Applies a constrained Cooper patch to a copy of the document and returns the
 * next validated revision. Mirrors apply_cooper_patch in
 * apps/game/tools/physics.py: stale revisions, protected paths, and any
 * validation failure leave the original document untouched.
 */
export function applyCooperPhysicsPatch(
  document: GamePhysicsDocument,
  patch: unknown,
): GamePhysicsDocument {
  const parsedPatch = cooperPhysicsPatchSchema.safeParse(patch);
  if (!parsedPatch.success) {
    throw new GamePhysicsPatchError(
      "Cooper couldn't understand that change.",
      parsedPatch.error.issues[0]?.message,
    );
  }
  const { baseRevision, prompt, operations } = parsedPatch.data;

  if (baseRevision !== document.revision) {
    throw new GamePhysicsPatchError(
      "This game changed since Cooper looked. Read the physics again first.",
      `expected revision ${document.revision}`,
    );
  }

  const allowedPaths = new Set(document.editPolicy.allowedPaths);
  const patchedPaths = new Set<string>();
  const updated = structuredClone(document) as unknown as Record<string, unknown>;

  for (const operation of operations) {
    if (patchedPaths.has(operation.path)) {
      throw new GamePhysicsPatchError(
        "Cooper tried to change the same setting twice.",
        `duplicate path ${operation.path}`,
      );
    }
    patchedPaths.add(operation.path);
    if (!allowedPaths.has(operation.path)) {
      throw new GamePhysicsPatchError(
        "Cooper is not allowed to change that part of the game.",
        `protected path ${operation.path}`,
      );
    }
    replaceAtPath(updated, operation.path, operation.value);
  }

  updated.revision = document.revision + 1;
  updated.provenance = { lastEditedBy: "cooper", lastPrompt: prompt };

  const validated = gamePhysicsDocumentSchema.safeParse(updated);
  if (!validated.success) {
    const issue = validated.error.issues[0];
    throw new GamePhysicsPatchError(
      "Those numbers are outside what this game allows.",
      `${issue?.path.join("/") ?? "document"}: ${issue?.message ?? "invalid"}`,
    );
  }
  assertJumpEnvelope(validated.data);
  return validated.data;
}
