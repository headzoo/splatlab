import type {
  PlatformerMapSource,
  PlatformerObjectEdit,
  PlatformerObjectKind,
  PlatformerObjectRemoval,
  PlatformerObjectSettings,
  PlatformerTerrainEdit,
  PlatformerTerrainKind,
} from "@/lib/game-contract";

import type {
  PlatformerMapObject,
  PlatformerMapSpec,
  PlatformerState,
} from "./types";

export type PlatformerTerrainStrokeCell = Pick<
  PlatformerTerrainEdit,
  "x" | "y" | "kind"
>;

export type PlatformerEditTool =
  | "select"
  | "move"
  | "erase"
  | Exclude<PlatformerTerrainKind, "empty">
  | PlatformerObjectKind;

export type PlatformerObjectPlacement = Pick<
  PlatformerObjectEdit,
  "id" | "x" | "y" | "kind"
>;

export const PLATFORMER_OBJECT_TOOLS: readonly PlatformerObjectKind[] = [
  "spawn",
  "coin",
  "extra_life",
  "platform_spring",
  "enemy",
  "boss",
  "flying_object",
  "checkpoint",
  "goal",
];

export type PlatformerObjectSettingsChange = Pick<
  PlatformerObjectSettings,
  "assetId" | "behavior" | "direction"
>;

const FALLBACK_SYMBOLS: Record<PlatformerTerrainKind, string> = {
  empty: ".",
  ground: "#",
  platform: "=",
  obstacle: "O",
  hazard: "^",
};

function terrainLayer(map: PlatformerMapSpec) {
  return map.layers.find((layer) => layer.id === "terrain");
}

function symbolForKind(
  map: PlatformerMapSpec,
  kind: PlatformerTerrainKind,
) {
  const matchingLegendEntry = Object.entries(map.legend).find(
    ([, entry]) => entry.visualSlot === kind,
  );
  return matchingLegendEntry?.[0] ?? FALLBACK_SYMBOLS[kind];
}

function objectMatchesKind(object: PlatformerMapSpec["objects"][number], kind: PlatformerObjectKind) {
  if (kind === "spawn") return object.type === "player_spawn";
  if (kind === "coin") return object.type === "collectible";
  if (kind === "enemy") return object.type === "enemy_spawn" && object.role !== "boss";
  if (kind === "boss") return object.type === "enemy_spawn" && object.role === "boss";
  return object.type === kind;
}

export function platformerObjectKind(
  object: PlatformerMapSpec["objects"][number],
): PlatformerObjectKind {
  if (object.type === "player_spawn") return "spawn";
  if (object.type === "collectible") return "coin";
  if (object.type === "enemy_spawn") return object.role === "boss" ? "boss" : "enemy";
  return object.type;
}

export function platformerObjectAtCell(map: PlatformerMapSpec, x: number, y: number) {
  return [...map.objects].reverse().find(
    (object) => Math.floor(object.x) === x && Math.floor(object.y) === y,
  ) ?? null;
}

export function platformerPreviewCellForObject(
  map: PlatformerMapSpec,
  state: PlatformerState,
  object: PlatformerMapObject,
) {
  if (object.type === "player_spawn") {
    return {
      x: Math.floor(state.x / map.tileSize),
      y: Math.round(state.y / map.tileSize) - 1,
    };
  }
  if (object.type === "enemy_spawn") {
    const enemy = state.enemies.find((candidate) => candidate.id === object.id);
    if (!enemy || enemy.defeated) return null;
    return {
      x: Math.floor(enemy.x / map.tileSize),
      y: Math.round(enemy.y / map.tileSize) - 1,
    };
  }
  if (object.type === "flying_object") {
    const flyingObject = state.flyingObjects.find(
      (candidate) => candidate.id === object.id,
    );
    if (flyingObject?.phase === "active") {
      return {
        x: Math.floor(flyingObject.x / map.tileSize),
        y: Math.floor(flyingObject.y / map.tileSize),
      };
    }
  }
  return { x: Math.floor(object.x), y: Math.floor(object.y) };
}

export function platformerObjectAtPreviewCell(
  map: PlatformerMapSpec,
  state: PlatformerState,
  x: number,
  y: number,
) {
  return [...map.objects].reverse().find((object) => {
    const cell = platformerPreviewCellForObject(map, state, object);
    return cell?.x === x && cell.y === y;
  }) ?? null;
}

const THEMED_OBJECT_ASSETS: Record<string, { enemy: string; boss: string; flying: string; spring?: string }> = {
  neutral_green_hills_01: {
    enemy: "neutral_ghost_01",
    boss: "neutral_green_hills_boss_01",
    flying: "neutral_green_hills_flying_cooper_01",
  },
  space_orbital_outpost_01: {
    enemy: "space_ghost_01",
    boss: "space_boss_01",
    flying: "neutral_green_hills_flying_cooper_01",
  },
  haunted_graveyard_01: {
    enemy: "haunted_ghost_01",
    boss: "haunted_boss_01",
    flying: "haunted_flying_cooper_bat_01",
    spring: "haunted_graveyard_platformer_spring_01",
  },
  dragons_emberkeep_01: {
    enemy: "dragon_ghost_01",
    boss: "dragons_emberkeep_boss_01",
    flying: "dragons_emberkeep_flying_fireball_01",
  },
  ice_world_01: {
    enemy: "ice_world_ghost_01",
    boss: "ice_world_boss_01",
    flying: "neutral_green_hills_flying_cooper_01",
    spring: "ice_world_platformer_spring_01",
  },
};

function defaultObjectForKind(
  map: PlatformerMapSpec,
  edit: PlatformerObjectEdit,
): PlatformerMapSpec["objects"][number] {
  const themedAssets = THEMED_OBJECT_ASSETS[map.presentation.backgroundId]
    ?? THEMED_OBJECT_ASSETS.neutral_green_hills_01;
  const base = { id: edit.id, x: edit.x, y: edit.y };
  if (edit.kind === "spawn") return { ...base, type: "player_spawn" };
  if (edit.kind === "coin") return { ...base, type: "collectible", pointValue: 1 };
  if (edit.kind === "extra_life") return { ...base, type: "extra_life" };
  if (edit.kind === "platform_spring") {
    return {
      ...base,
      type: "platform_spring",
      assetId: themedAssets.spring ?? "ice_world_platformer_spring_01",
      launchSpeedPxPerSecond: 1200,
    };
  }
  if (edit.kind === "checkpoint") return { ...base, type: "checkpoint" };
  if (edit.kind === "goal") return { ...base, type: "goal" };
  if (edit.kind === "flying_object") {
    return { ...base, type: "flying_object", assetId: themedAssets.flying };
  }
  return {
    ...base,
    type: "enemy_spawn",
    role: edit.kind,
    assetId: edit.kind === "boss" ? themedAssets.boss : themedAssets.enemy,
    behavior: "patroller",
    direction: "left",
    patrolLeftTiles: 2,
    patrolRightTiles: 2,
    speedPxPerSecond: edit.kind === "boss" ? 80 : 60,
    defeatMode: "both",
    ...(edit.kind === "boss" ? { hitsToDefeat: 3 } : {}),
  };
}

/**
 * Folds this game's starting life count into the map, so the engine keeps
 * reading one place for it and the number really is the map's start count.
 */
export function applyPlatformerRules(
  map: PlatformerMapSpec,
  startingLives: number | undefined,
): PlatformerMapSpec {
  if (startingLives === undefined || map.rules.startingLives === startingLives) return map;
  return { ...map, rules: { ...map.rules, startingLives } };
}

export function applyPlatformerObjectEdits(
  map: PlatformerMapSpec,
  mapSource: PlatformerMapSource,
  edits: readonly PlatformerObjectEdit[],
  removals: readonly PlatformerObjectRemoval[] = [],
  settings: readonly PlatformerObjectSettings[] = [],
): PlatformerMapSpec {
  const applicable = edits.filter((edit) => edit.mapSource === mapSource);
  const removedIds = new Set(
    removals
      .filter((removal) => removal.mapSource === mapSource)
      .map((removal) => removal.objectId),
  );
  const applicableSettings = new Map(
    settings
      .filter((item) => item.mapSource === mapSource)
      .map((item) => [item.objectId, item]),
  );
  if (applicable.length === 0 && removedIds.size === 0 && applicableSettings.size === 0) {
    return map;
  }
  const replacesSpawn = applicable.some((edit) => edit.kind === "spawn");
  return {
    ...map,
    objects: [
      ...map.objects.filter((object) => (
        !removedIds.has(object.id) && !(replacesSpawn && object.type === "player_spawn")
      )),
      ...applicable.filter((edit) => !removedIds.has(edit.id)).map((edit) => {
        const template = map.objects.find((object) => objectMatchesKind(object, edit.kind));
        return template
          ? { ...template, id: edit.id, x: edit.x, y: edit.y }
          : defaultObjectForKind(map, edit);
      }),
    ].map((object) => {
      const objectSettings = applicableSettings.get(object.id);
      if (!objectSettings || object.type !== "enemy_spawn") return object;
      return {
        ...object,
        assetId: objectSettings.assetId,
        behavior: objectSettings.behavior,
        direction: objectSettings.direction,
        ...(objectSettings.behavior === "chaser"
          ? {
              viewLeftTiles: object.viewLeftTiles ?? 8,
              viewRightTiles: object.viewRightTiles ?? 8,
            }
          : {
              patrolLeftTiles: object.patrolLeftTiles ?? 2,
              patrolRightTiles: object.patrolRightTiles ?? 2,
            }),
      };
    }),
  };
}

export function upsertPlatformerObjectSettings(
  existing: readonly PlatformerObjectSettings[],
  mapSource: PlatformerMapSource,
  objectId: string,
  change: PlatformerObjectSettingsChange,
) {
  return [
    ...existing.filter((item) => !(item.mapSource === mapSource && item.objectId === objectId)),
    { mapSource, objectId, ...change },
  ];
}

export function erasePlatformerObjectsAtCells(
  baseMap: PlatformerMapSpec,
  mapSource: PlatformerMapSource,
  edits: readonly PlatformerObjectEdit[],
  removals: readonly PlatformerObjectRemoval[],
  cells: readonly Pick<PlatformerTerrainStrokeCell, "x" | "y">[],
  settings: readonly PlatformerObjectSettings[] = [],
) {
  const cellKeys = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
  const effectiveMap = applyPlatformerObjectEdits(baseMap, mapSource, edits, removals, settings);
  const addedIds = new Set(edits.map((edit) => edit.id));
  const erasedIds = new Set(
    effectiveMap.objects
      .filter((object) => (
        (object.type !== "player_spawn" || addedIds.has(object.id)) &&
        cellKeys.has(`${Math.floor(object.x)},${Math.floor(object.y)}`)
      ))
      .map((object) => object.id),
  );
  if (erasedIds.size === 0) {
    return { edits: [...edits], removals: [...removals], settings: [...settings] };
  }

  const nextEdits = edits.filter((edit) => !erasedIds.has(edit.id));
  const nextRemovals = new Map(
    removals.map((removal) => [`${removal.mapSource}:${removal.objectId}`, removal]),
  );
  // Every erased id is recorded, not just ids authored in the base map. A
  // builder-added object also needs a removal, because the same arrays are
  // unioned with the server's copy and dropping the edit alone would let
  // Cooper's stored version come back.
  for (const objectId of erasedIds) {
    nextRemovals.set(`${mapSource}:${objectId}`, { mapSource, objectId });
  }
  return {
    edits: nextEdits,
    removals: [...nextRemovals.values()],
    settings: settings.filter((item) => !erasedIds.has(item.objectId)),
  };
}

export function mergePlatformerObjectEdit(
  existing: readonly PlatformerObjectEdit[],
  mapSource: PlatformerMapSource,
  baseMap: PlatformerMapSpec,
  placement: PlatformerObjectPlacement,
): PlatformerObjectEdit[] {
  if (
    placement.x < 0 || placement.y < 0 ||
    placement.x >= baseMap.size.columns || placement.y >= baseMap.size.rows
  ) return [...existing];
  const retained = placement.kind === "spawn"
    ? existing.filter((edit) => !(edit.mapSource === mapSource && edit.kind === "spawn"))
    : [...existing];
  return [...retained, { mapSource, ...placement }];
}

export function platformerTerrainKindAt(
  map: PlatformerMapSpec,
  x: number,
  y: number,
): PlatformerTerrainKind {
  const symbol = terrainLayer(map)?.rows[y]?.[x] ?? symbolForKind(map, "empty");
  return map.legend[symbol]?.visualSlot ?? "empty";
}

export function applyPlatformerTerrainEdits(
  map: PlatformerMapSpec,
  mapSource: PlatformerMapSource,
  edits: readonly PlatformerTerrainEdit[],
): PlatformerMapSpec {
  const applicableEdits = edits.filter(
    (edit) =>
      edit.mapSource === mapSource &&
      edit.x < map.size.columns &&
      edit.y < map.size.rows,
  );
  const baseTerrain = terrainLayer(map);

  if (!baseTerrain || applicableEdits.length === 0) return map;

  const rows = [...baseTerrain.rows];
  const editedCells = new Set<string>();

  for (const edit of applicableEdits) {
    const row = rows[edit.y];
    if (row === undefined) continue;
    const symbol = symbolForKind(map, edit.kind);
    rows[edit.y] = `${row.slice(0, edit.x)}${symbol}${row.slice(edit.x + 1)}`;
    editedCells.add(`${edit.x},${edit.y}`);
  }

  return {
    ...map,
    layers: map.layers.map((layer) =>
      layer.id === "terrain"
        ? {
            ...layer,
            rows,
            spriteOverrides: layer.spriteOverrides?.filter(
              (override) => !editedCells.has(`${override.x},${override.y}`),
            ),
          }
        : layer,
    ),
  };
}

export function mergePlatformerTerrainEdits(
  existing: readonly PlatformerTerrainEdit[],
  mapSource: PlatformerMapSource,
  baseMap: PlatformerMapSpec,
  stroke: readonly PlatformerTerrainStrokeCell[],
): PlatformerTerrainEdit[] {
  const edits = new Map(
    existing.map((edit) => [`${edit.mapSource}:${edit.x}:${edit.y}`, edit]),
  );

  for (const cell of stroke) {
    if (
      cell.x < 0 ||
      cell.y < 0 ||
      cell.x >= baseMap.size.columns ||
      cell.y >= baseMap.size.rows
    ) {
      continue;
    }

    const key = `${mapSource}:${cell.x}:${cell.y}`;
    if (platformerTerrainKindAt(baseMap, cell.x, cell.y) === cell.kind) {
      edits.delete(key);
    } else {
      edits.set(key, { mapSource, ...cell });
    }
  }

  return [...edits.values()].sort((left, right) => {
    const sourceOrder = left.mapSource.localeCompare(right.mapSource);
    return sourceOrder || left.y - right.y || left.x - right.x;
  });
}
