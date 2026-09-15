import type { GameDocument } from "@/lib/game-contract";

import { nextCampaignMapIndex } from "./platformer/campaign";
import type { CampaignMap, MazeMap } from "./game-player";

// A shared game always opens on its first authored level, whichever level the
// builder happened to have selected when the game was saved.
export const FIRST_LEVEL_INDEX = 0;

export function levelProgressLabel(index: number, total: number, label: string) {
  return total > 1 ? `Level ${index + 1} of ${total} · ${label}` : label;
}

export function levelCompletionMessage(
  index: number,
  total: number,
  levelMessage: string,
) {
  return total > 1 && nextCampaignMapIndex(index, total) === null
    ? "You beat the game!"
    : levelMessage;
}

export function gameCampaignMaps(
  spec: GameDocument,
  templates: CampaignMap[],
): CampaignMap[] {
  const resolve = (source: string, templateSource: string, label: string) => {
    const generated = spec.generatedPlatformerMaps.find(
      (record) => record.source === source,
    );
    if (generated) return { source, label, map: generated.map };
    const template = templates.find((candidate) => candidate.source === templateSource);
    return template
      ? { source, label, map: { ...template.map, id: `${template.map.id}:${source}` } }
      : null;
  };
  const activeIsListed = spec.platformerLevels.some(
    (level) => level.id === spec.platformerMapSource,
  );
  const active = activeIsListed
    ? null
    : (() => {
        const generated = spec.generatedPlatformerMaps.find(
          (record) => record.source === spec.platformerMapSource,
        );
        if (generated) {
          return { source: generated.source, label: generated.map.id, map: generated.map };
        }
        return templates.find((template) => template.source === spec.platformerMapSource) ?? null;
      })();

  return [
    ...(active ? [active] : []),
    ...spec.platformerLevels.flatMap((level) => {
      const resolved = resolve(level.id, level.templateSource, level.label);
      return resolved ? [resolved] : [];
    }),
  ];
}

export function campaignMapIndex(spec: GameDocument, maps: CampaignMap[]) {
  const index = maps.findIndex(
    (candidate) => candidate.source === spec.platformerMapSource,
  );
  return index < 0 ? 0 : index;
}

export function mazeMapIndex(spec: GameDocument, maps: MazeMap[]) {
  const index = maps.findIndex(
    (candidate) => candidate.source === spec.mazeMapSource,
  );
  return index < 0 ? 0 : index;
}

export function gameMazeMaps(
  spec: GameDocument,
  templates: MazeMap[],
): MazeMap[] {
  const resolve = (source: string, templateSource: string, label: string) => {
    const generated = spec.generatedMazeMaps.find(
      (record) => record.source === source,
    );
    if (generated) return { source, label, map: generated.map };
    const template = templates.find((candidate) => candidate.source === templateSource);
    return template
      ? { source, label, map: { ...template.map, id: `${template.map.id}:${source}` } }
      : null;
  };
  const activeIsListed = spec.mazeLevels.some(
    (level) => level.id === spec.mazeMapSource,
  );
  const active = activeIsListed
    ? null
    : (() => {
        const generated = spec.generatedMazeMaps.find(
          (record) => record.source === spec.mazeMapSource,
        );
        if (generated) {
          return { source: generated.source, label: generated.map.id, map: generated.map };
        }
        return templates.find((template) => template.source === spec.mazeMapSource) ?? null;
      })();

  return [
    ...(active ? [active] : []),
    ...spec.mazeLevels.flatMap((level) => {
      const resolved = resolve(level.id, level.templateSource, level.label);
      return resolved ? [resolved] : [];
    }),
  ];
}
