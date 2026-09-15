import {
  activeMapSource,
  type GameDocument,
  type MapLength,
} from "@/lib/game-contract";

export function resolveMapRollLength(spec: GameDocument, length?: MapLength): MapLength {
  if (length) return length;
  const source = activeMapSource(spec);
  if (spec.previewKind === "platformer") {
    return spec.generatedPlatformerMaps.find((record) => record.source === source)?.length
      ?? spec.mapLength;
  }
  return spec.generatedMazeMaps.find((record) => record.source === source)?.length
    ?? spec.mapLength;
}

export function hasSourceEdits(spec: GameDocument, source = activeMapSource(spec)) {
  return [
    spec.platformerTerrainEdits,
    spec.platformerObjectEdits,
    spec.platformerObjectRemovals,
    spec.platformerObjectSettings,
    spec.platformerTerrainSettings,
    spec.platformerLevelArt,
  ].some((entries) => entries.some((entry) => entry.mapSource === source));
}
