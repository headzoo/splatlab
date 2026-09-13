import { z } from "zod";

import {
  HUMAN_GENDERS,
  PLAYER_CHARACTERS,
  platformerObjectEditSchema,
  platformerObjectRemovalSchema,
  platformerObjectSettingsSchema,
  type GameDocument,
  type PlatformerObjectEdit,
  type PlatformerObjectRemoval,
  type PlatformerObjectSettings,
} from "./game-contract";

/**
 * Everything Cooper's tools may write to a saved game, in one payload. A tool
 * sets only the fields it touched, and the change rides back to the client on
 * the build-turn response so the preview re-renders without a refetch.
 */
export const cooperSpecChangeSchema = z
  .object({
    platformerObjectEdits: z.array(platformerObjectEditSchema).max(1000).optional(),
    platformerObjectRemovals: z.array(platformerObjectRemovalSchema).max(1000).optional(),
    platformerObjectSettings: z.array(platformerObjectSettingsSchema).max(1000).optional(),
    playerCharacter: z.enum(PLAYER_CHARACTERS).optional(),
    humanGender: z.enum(HUMAN_GENDERS).optional(),
    startingLives: z.number().int().min(1).max(99).optional(),
  })
  .strict();

export type CooperSpecChange = z.infer<typeof cooperSpecChangeSchema>;

type ObjectArrayFields = Pick<
  GameDocument,
  "platformerObjectEdits" | "platformerObjectRemovals" | "platformerObjectSettings"
>;

function unionBy<Entry>(
  base: readonly Entry[],
  incoming: readonly Entry[],
  key: (entry: Entry) => string,
): Entry[] {
  const merged = new Map(base.map((entry) => [key(entry), entry]));
  for (const entry of incoming) merged.set(key(entry), entry);
  return [...merged.values()];
}

const editKey = (edit: PlatformerObjectEdit) => `${edit.mapSource}:${edit.id}`;
const removalKey = (removal: PlatformerObjectRemoval) =>
  `${removal.mapSource}:${removal.objectId}`;
const settingsKey = (settings: PlatformerObjectSettings) =>
  `${settings.mapSource}:${settings.objectId}`;

/**
 * Cooper and the kid's level editor both append to these arrays, so neither
 * side may simply overwrite the other. Entries are keyed and unioned, with
 * `incoming` winning a collision.
 *
 * Deleting still works because erasing an object records a removal, and
 * `applyPlatformerObjectEdits` filters added edits through those removals. A
 * union therefore cannot resurrect something the kid erased.
 */
export function mergeObjectArrays(
  base: ObjectArrayFields,
  incoming: Partial<ObjectArrayFields>,
): ObjectArrayFields {
  return {
    platformerObjectEdits: unionBy(
      base.platformerObjectEdits,
      incoming.platformerObjectEdits ?? [],
      editKey,
    ),
    platformerObjectRemovals: unionBy(
      base.platformerObjectRemovals,
      incoming.platformerObjectRemovals ?? [],
      removalKey,
    ),
    platformerObjectSettings: unionBy(
      base.platformerObjectSettings,
      incoming.platformerObjectSettings ?? [],
      settingsKey,
    ),
  };
}

/**
 * Applies a change onto a full document. Object arrays union with what is
 * already there; the scalar fields simply replace.
 */
export function applyCooperSpecChange(
  spec: GameDocument,
  change: CooperSpecChange,
): GameDocument {
  const scalars = Object.fromEntries(
    (["playerCharacter", "humanGender", "startingLives"] as const)
      .filter((field) => change[field] !== undefined)
      .map((field) => [field, change[field]]),
  );
  return { ...spec, ...mergeObjectArrays(spec, change), ...scalars };
}

/** True when the change would leave the document exactly as it is. */
export function specChangeIsNoop(spec: GameDocument, change: CooperSpecChange): boolean {
  const next = applyCooperSpecChange(spec, change);
  return (
    next.playerCharacter === spec.playerCharacter
    && next.humanGender === spec.humanGender
    && next.startingLives === spec.startingLives
    && JSON.stringify(next.platformerObjectEdits) === JSON.stringify(spec.platformerObjectEdits)
    && JSON.stringify(next.platformerObjectRemovals) === JSON.stringify(spec.platformerObjectRemovals)
    && JSON.stringify(next.platformerObjectSettings) === JSON.stringify(spec.platformerObjectSettings)
  );
}

/**
 * Keeps anything that is not part of the change out of the payload. Planners
 * return their validated change alongside a report for the model, such as the
 * cells they filled, and that report must not ride along to the client: the
 * schema is strict, so one unknown key fails the parse and the whole reply is
 * rejected as malformed.
 */
export function toSpecChange(value: CooperSpecChange): CooperSpecChange {
  return cooperSpecChangeSchema.parse(
    Object.fromEntries(
      Object.entries(value).filter(([key]) => key in cooperSpecChangeSchema.shape),
    ),
  );
}

/** Projects a full document down to just the fields Cooper's tools own. */
export function specChangeFrom(spec: GameDocument): CooperSpecChange {
  return {
    platformerObjectEdits: spec.platformerObjectEdits,
    platformerObjectRemovals: spec.platformerObjectRemovals,
    platformerObjectSettings: spec.platformerObjectSettings,
    playerCharacter: spec.playerCharacter,
    humanGender: spec.humanGender,
    ...(spec.startingLives === undefined ? {} : { startingLives: spec.startingLives }),
  };
}
