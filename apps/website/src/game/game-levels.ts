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
  const activeTemplate = templates.find(
    (template) => template.source === spec.platformerMapSource,
  );
  return [
    ...(activeTemplate ? [activeTemplate] : []),
    ...spec.platformerLevels.flatMap((level) => {
      const template = templates.find(
        (candidate) => candidate.source === level.templateSource,
      );
      return template
        ? [{
            source: level.id,
            label: level.label,
            map: { ...template.map, id: `${template.map.id}:${level.id}` },
          }]
        : [];
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
  const activeTemplate = templates.find(
    (template) => template.source === spec.mazeMapSource,
  );
  return [
    ...(activeTemplate ? [activeTemplate] : []),
    ...spec.mazeLevels.flatMap((level) => {
      const template = templates.find(
        (candidate) => candidate.source === level.templateSource,
      );
      return template
        ? [{
            source: level.id,
            label: level.label,
            map: { ...template.map, id: `${template.map.id}:${level.id}` },
          }]
        : [];
    }),
  ];
}
