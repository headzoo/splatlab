import { z } from "zod";

import {
  HAIR_COLORS,
  HUMAN_GENDERS,
  PLAYER_CHARACTERS,
  SKIN_TONES,
  mazeLevelSchema,
  mazeMapSourceSchema,
  generatedMazeMapRecordSchema,
  generatedPlatformerMapRecordSchema,
  platformerLevelArtSchema,
  platformerLevelSchema,
  platformerMapSourceSchema,
  platformerObjectEditSchema,
  platformerObjectRemovalSchema,
  platformerObjectSettingsSchema,
  platformerTerrainEditSchema,
  platformerTerrainSettingsSchema,
  type GameDocument,
  type PlatformerObjectEdit,
  type PlatformerObjectRemoval,
  type PlatformerObjectSettings,
  type PlatformerTerrainSettings,
} from "./game-contract";

/**
 * Everything Cooper's tools may write to a saved game, in one payload. A tool
 * sets only the fields it touched, and the change rides back to the client on
 * the build-turn response so the preview re-renders without a refetch.
 */
export const cooperSpecChangeSchema = z
  .object({
    previewKind: z.enum(["platformer", "maze"]).optional(),
    platformerMapSource: platformerMapSourceSchema.optional(),
    mazeMapSource: mazeMapSourceSchema.optional(),
    platformerLevels: z.array(platformerLevelSchema).max(20).optional(),
    mazeLevels: z.array(mazeLevelSchema).max(20).optional(),
    platformerTerrainEdits: z.array(platformerTerrainEditSchema).max(5000).optional(),
    platformerObjectEdits: z.array(platformerObjectEditSchema).max(1000).optional(),
    platformerObjectRemovals: z.array(platformerObjectRemovalSchema).max(1000).optional(),
    platformerObjectSettings: z.array(platformerObjectSettingsSchema).max(1000).optional(),
    platformerTerrainSettings: z.array(platformerTerrainSettingsSchema).max(5000).optional(),
    platformerLevelArt: z.array(platformerLevelArtSchema).max(220).optional(),
    playerCharacter: z.enum(PLAYER_CHARACTERS).optional(),
    humanGender: z.enum(HUMAN_GENDERS).optional(),
    skinTone: z.enum(SKIN_TONES).optional(),
    hairColor: z.enum(HAIR_COLORS).optional(),
    startingLives: z.number().int().min(1).max(99).optional(),
    /**
     * Map sources of levels deleted this turn. Their leftover edits are dropped
     * rather than unioned, because a union cannot express a removal and the
     * orphaned entries would otherwise sit in the document forever.
     */
    removedMapSources: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  })
  .strict();

export type CooperSpecChange = z.infer<typeof cooperSpecChangeSchema>;

/** Replaced outright when present, because each one describes a whole state. */
const SCALAR_FIELDS = [
  "previewKind",
  "platformerMapSource",
  "mazeMapSource",
  "playerCharacter",
  "humanGender",
  "skinTone",
  "hairColor",
  "startingLives",
] as const satisfies readonly (keyof GameDocument)[];

/**
 * Replaced whole. Level lists are ordered, so a union would scramble them, and
 * a level's borrowed art is one row per slot that a later borrow replaces.
 */
const REPLACED_ARRAY_FIELDS = [
  "platformerLevels",
  "mazeLevels",
  "platformerLevelArt",
] as const satisfies readonly (keyof GameDocument)[];

const EDIT_ARRAY_FIELDS = [
  "platformerTerrainEdits",
  "platformerObjectEdits",
  "platformerObjectRemovals",
  "platformerObjectSettings",
  "platformerTerrainSettings",
] as const satisfies readonly (keyof GameDocument)[];

const CHANGEABLE_FIELDS = [
  ...SCALAR_FIELDS,
  ...REPLACED_ARRAY_FIELDS,
  ...EDIT_ARRAY_FIELDS,
] as const;

type ObjectArrayFields = Pick<
  GameDocument,
  | "platformerObjectEdits"
  | "platformerObjectRemovals"
  | "platformerObjectSettings"
  | "platformerTerrainSettings"
>;

/** Every array whose entries name the level they belong to. */
type MapSourceKeyedFields = Pick<
  GameDocument,
  (typeof EDIT_ARRAY_FIELDS)[number] | "platformerLevelArt"
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
const terrainSettingsKey = (settings: PlatformerTerrainSettings) =>
  `${settings.mapSource}:${settings.x}:${settings.y}`;

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
    platformerTerrainSettings: unionBy(
      base.platformerTerrainSettings,
      incoming.platformerTerrainSettings ?? [],
      terrainSettingsKey,
    ),
  };
}

/**
 * Deleting a level leaves its edits and borrowed art behind, and the union
 * above cannot remove them. They all name their level, so dropping that source
 * clears every array at once and keeps the document under its length caps
 * across repeated add-and-delete cycles.
 */
export function pruneRemovedMapSources(
  fields: MapSourceKeyedFields,
  removed: readonly string[] | undefined,
): MapSourceKeyedFields {
  if (!removed?.length) return fields;
  const dropped = new Set(removed);
  const kept = <Entry extends { mapSource: string }>(entries: readonly Entry[]) =>
    entries.filter((entry) => !dropped.has(entry.mapSource));
  return {
    platformerTerrainEdits: kept(fields.platformerTerrainEdits),
    platformerObjectEdits: kept(fields.platformerObjectEdits),
    platformerObjectRemovals: kept(fields.platformerObjectRemovals),
    platformerObjectSettings: kept(fields.platformerObjectSettings),
    platformerTerrainSettings: kept(fields.platformerTerrainSettings),
    platformerLevelArt: kept(fields.platformerLevelArt),
  };
}

/**
 * Source-keyed platformer edits are valid only for a level still in this
 * game's campaign (including the legacy active level when no campaign exists).
 * This is deliberately applied after union merges: a stale autosave cannot
 * re-add edits that a map roll or level deletion removed.
 */
export function pruneOrphanedMapSourceEdits(
  spec: GameDocument,
): GameDocument {
  const validSources = new Set([
    spec.platformerMapSource,
    ...spec.platformerLevels.map((level) => level.id),
  ]);
  const removed = [
    ...spec.platformerTerrainEdits,
    ...spec.platformerObjectEdits,
    ...spec.platformerObjectRemovals,
    ...spec.platformerObjectSettings,
    ...spec.platformerTerrainSettings,
    ...spec.platformerLevelArt,
  ]
    .map((entry) => entry.mapSource)
    .filter((source) => !validSources.has(source));

  return removed.length
    ? { ...spec, ...pruneRemovedMapSources(spec, removed) }
    : spec;
}

/**
 * A map roll replaces its active campaign source. If an autosave predates that
 * transition, it cannot name the new generated source at all, so accepting
 * its level list would restore the retired source and make its old edits look
 * valid again. Keep the authoritative campaign in that case.
 */
export function preserveRolledCampaign(
  incoming: GameDocument,
  authoritative: GameDocument,
): GameDocument {
  const platformerRolled = authoritative.generatedPlatformerMaps.some(
    (record) => record.source === authoritative.platformerMapSource,
  );
  const mazeRolled = authoritative.generatedMazeMaps.some(
    (record) => record.source === authoritative.mazeMapSource,
  );
  const incomingPlatformerSources = new Set([
    incoming.platformerMapSource,
    ...incoming.platformerLevels.map((level) => level.id),
  ]);
  const incomingMazeSources = new Set([
    incoming.mazeMapSource,
    ...incoming.mazeLevels.map((level) => level.id),
  ]);

  if (
    !platformerRolled
    || incomingPlatformerSources.has(authoritative.platformerMapSource)
  ) {
    if (!mazeRolled || incomingMazeSources.has(authoritative.mazeMapSource)) {
      return incoming;
    }
    return {
      ...incoming,
      mapStyle: authoritative.mapStyle,
      mapLength: authoritative.mapLength,
      mazeMapSource: authoritative.mazeMapSource,
      mazeLevels: authoritative.mazeLevels,
    };
  }

  return {
    ...incoming,
    mapStyle: authoritative.mapStyle,
    mapLength: authoritative.mapLength,
    platformerMapSource: authoritative.platformerMapSource,
    platformerLevels: authoritative.platformerLevels,
    ...(mazeRolled && !incomingMazeSources.has(authoritative.mazeMapSource)
      ? {
          mazeMapSource: authoritative.mazeMapSource,
          mazeLevels: authoritative.mazeLevels,
        }
      : {}),
  };
}

/** A completed generator roll is a server-only, non-undoable map transition. */
export const mapRollChangeSchema = z.object({
  previewKind: z.enum(["platformer", "maze"]),
  platformerMapSource: platformerMapSourceSchema.optional(),
  mazeMapSource: mazeMapSourceSchema.optional(),
  platformerLevels: z.array(platformerLevelSchema).max(20).optional(),
  mazeLevels: z.array(mazeLevelSchema).max(20).optional(),
  generatedPlatformerMaps: z.array(generatedPlatformerMapRecordSchema).max(20).optional(),
  generatedMazeMaps: z.array(generatedMazeMapRecordSchema).max(20).optional(),
  removedMapSources: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
}).strict().superRefine((change, context) => {
  if (change.previewKind === "platformer" && (!change.platformerMapSource || !change.generatedPlatformerMaps)) {
    context.addIssue({ code: "custom", path: ["platformerMapSource"], message: "A platformer roll needs its source and materialized map." });
  }
  if (change.previewKind === "maze" && (!change.mazeMapSource || !change.generatedMazeMaps)) {
    context.addIssue({ code: "custom", path: ["mazeMapSource"], message: "A maze roll needs its source and materialized map." });
  }
});
export type MapRollChange = z.infer<typeof mapRollChangeSchema>;

export const mapRollSuccessSchema = z.object({
  revision: z.number().int().positive(),
  change: mapRollChangeSchema,
}).strict();
export type MapRollSuccess = z.infer<typeof mapRollSuccessSchema>;

export function applyMapRollChange(spec: GameDocument, change: MapRollChange): GameDocument {
  const pruned = pruneRemovedMapSources(spec, change.removedMapSources);
  return {
    ...spec,
    ...pruned,
    previewKind: change.previewKind,
    ...(change.platformerMapSource ? { platformerMapSource: change.platformerMapSource } : {}),
    ...(change.mazeMapSource ? { mazeMapSource: change.mazeMapSource } : {}),
    ...(change.platformerLevels ? { platformerLevels: change.platformerLevels } : {}),
    ...(change.mazeLevels ? { mazeLevels: change.mazeLevels } : {}),
    ...(change.generatedPlatformerMaps ? { generatedPlatformerMaps: change.generatedPlatformerMaps } : {}),
    ...(change.generatedMazeMaps ? { generatedMazeMaps: change.generatedMazeMaps } : {}),
    mapStyle: "generated",
  };
}

function present<Field extends keyof CooperSpecChange>(
  change: CooperSpecChange,
  fields: readonly Field[],
) {
  return Object.fromEntries(
    fields
      .filter((field) => change[field] !== undefined)
      .map((field) => [field, change[field]]),
  );
}

/**
 * Applies a change onto a full document. Object arrays union with what is
 * already there; level lists and the scalar fields simply replace.
 */
export function applyCooperSpecChange(
  spec: GameDocument,
  change: CooperSpecChange,
): GameDocument {
  const edits = pruneRemovedMapSources(
    {
      ...mergeObjectArrays(spec, change),
      platformerTerrainEdits: change.platformerTerrainEdits ?? spec.platformerTerrainEdits,
      platformerLevelArt: change.platformerLevelArt ?? spec.platformerLevelArt,
    },
    change.removedMapSources,
  );
  // The pruned arrays land last, so deleting a level in the same turn that
  // borrowed art for it still drops the borrow.
  return pruneOrphanedMapSourceEdits({
    ...spec,
    ...present(change, REPLACED_ARRAY_FIELDS),
    ...present(change, SCALAR_FIELDS),
    ...edits,
  });
}

/** True when the change would leave the document exactly as it is. */
export function specChangeIsNoop(spec: GameDocument, change: CooperSpecChange): boolean {
  const next = applyCooperSpecChange(spec, change);
  return CHANGEABLE_FIELDS.every(
    (field) => JSON.stringify(next[field]) === JSON.stringify(spec[field]),
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
    previewKind: spec.previewKind,
    platformerMapSource: spec.platformerMapSource,
    mazeMapSource: spec.mazeMapSource,
    platformerLevels: spec.platformerLevels,
    mazeLevels: spec.mazeLevels,
    platformerTerrainEdits: spec.platformerTerrainEdits,
    platformerObjectEdits: spec.platformerObjectEdits,
    platformerObjectRemovals: spec.platformerObjectRemovals,
    platformerObjectSettings: spec.platformerObjectSettings,
    platformerTerrainSettings: spec.platformerTerrainSettings,
    platformerLevelArt: spec.platformerLevelArt,
    playerCharacter: spec.playerCharacter,
    humanGender: spec.humanGender,
    skinTone: spec.skinTone,
    hairColor: spec.hairColor,
    ...(spec.startingLives === undefined ? {} : { startingLives: spec.startingLives }),
  };
}
