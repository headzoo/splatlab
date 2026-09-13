import type { GameDocument } from "@/lib/game-contract";

import type { CampaignMap, MazeMap } from "./game-player";

export function gameCampaignMaps(
  spec: GameDocument,
  templates: CampaignMap[],
): CampaignMap[] {
  return [
    ...templates,
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

export function gameMazeMaps(
  spec: GameDocument,
  templates: MazeMap[],
): MazeMap[] {
  return [
    ...templates,
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
