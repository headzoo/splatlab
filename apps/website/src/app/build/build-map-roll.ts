import { applyMapRollChange, mapRollSuccessSchema, type MapRollSuccess } from "@/lib/cooper-spec-change";
import {
  gameDocumentSchema,
  type GameDocument,
} from "@/lib/game-contract";
import type { MapLength } from "@/lib/game-contract";
import {
  hasSourceEdits,
  resolveMapRollLength,
} from "@/lib/random-map/map-roll-shared";

export type MapRollClientOutcome =
  | { status: "success"; result: MapRollSuccess }
  | { status: "confirmation_required"; message: string }
  | { status: "conflict"; message: string; revision?: number }
  | { status: "error"; message: string };

export type MapRollStart = "ready" | "already_in_progress" | "persistence_failed";

/**
 * A roll is destructive, so it takes ownership only after the current local
 * document has been durably written. Waiting before claiming the guard lets a
 * pending autosave finish and produce the revision that the roll must send.
 */
export async function serializeMapRollStart(
  persistLatest: () => Promise<boolean>,
  inProgress: { current: boolean },
): Promise<MapRollStart> {
  if (inProgress.current) return "already_in_progress";
  if (!await persistLatest()) return "persistence_failed";
  if (inProgress.current) return "already_in_progress";
  inProgress.current = true;
  return "ready";
}

function responseMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }
  return fallback;
}

export function activeMapRollLength(spec: GameDocument): MapLength {
  return resolveMapRollLength(spec);
}

export function needsMapRollDiscardConfirmation(spec: GameDocument) {
  return hasSourceEdits(spec);
}

export function interpretMapRollResponse(
  status: number,
  payload: unknown,
): MapRollClientOutcome {
  if (status === 200) {
    const parsed = mapRollSuccessSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        status: "error",
        message: "We couldn't save that map. Please try again.",
      };
    }
    return { status: "success", result: parsed.data };
  }

  const message = responseMessage(payload, "We couldn't make that map. Please try again.");
  if (status === 409) {
    if (message.includes("confirm")) {
      return { status: "confirmation_required", message };
    }
    const revision = payload &&
      typeof payload === "object" &&
      "revision" in payload &&
      typeof payload.revision === "number"
      ? payload.revision
      : undefined;
    return { status: "conflict", message, revision };
  }

  return { status: "error", message };
}

export function rolledSpecFromOutcome(
  beforeRoll: GameDocument,
  result: MapRollSuccess,
  extra?: Partial<GameDocument>,
) {
  return gameDocumentSchema.parse({
    ...applyMapRollChange(beforeRoll, result.change),
    ...extra,
  });
}

/**
 * Setup edits merge onto the latest document so a late theme leftover cannot
 * wipe a roll that already landed. Ready-made and game-type resets still win.
 */
export function mergeBuilderSetupChange(
  latest: GameDocument,
  change: Partial<GameDocument>,
): GameDocument {
  const honorCampaignReset =
    change.mapStyle === "ready_made"
    || (change.previewKind !== undefined && change.previewKind !== latest.previewKind);
  const spec = { ...latest, ...change };
  if (!honorCampaignReset && latest.mapStyle === "generated") {
    spec.platformerMapSource = latest.platformerMapSource;
    spec.mazeMapSource = latest.mazeMapSource;
    spec.platformerLevels = latest.platformerLevels;
    spec.mazeLevels = latest.mazeLevels;
    spec.generatedPlatformerMaps = latest.generatedPlatformerMaps;
    spec.generatedMazeMaps = latest.generatedMazeMaps;
    spec.mapStyle = latest.mapStyle;
  }
  return spec;
}
