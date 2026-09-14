import type {
  ArtWorldId,
  PlatformerArtSlot,
  PlatformerLevelArt,
  PlatformerMapSource,
  PlatformerObjectEdit,
  PlatformerObjectKind,
  PlatformerObjectRemoval,
  PlatformerObjectSettings,
  PlatformerTerrainEdit,
  PlatformerTerrainKind,
} from "@/lib/game-contract";

import {
  themedObjectAssets,
  worldArtAssetId,
  type PlatformerArtBorrows,
} from "./art-catalog";
import type {
  PlatformerMapObject,
  PlatformerMapSpec,
  PlatformerState,
} from "./types";

export type PlatformerTerrainStrokeCell = Pick<
  PlatformerTerrainEdit,
  "x" | "y" | "kind" | "world"
>;

export type PlatformerEditTool =
  | "select"
  | "move"
  | "erase"
  | Exclude<PlatformerTerrainKind, "empty">
  | PlatformerObjectKind;

export type PlatformerObjectPlacement = Pick<
  PlatformerObjectEdit,
  "id" | "x" | "y" | "kind" | "world"
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

export function isPlatformerObjectTool(
  tool: PlatformerEditTool,
): tool is PlatformerObjectKind {
  return PLATFORMER_OBJECT_TOOLS.includes(tool as PlatformerObjectKind);
}

export type PlatformerEditorCursor = "select" | "pan" | "paint" | "erase";

const PLATFORMER_TERRAIN_PAINT_TOOLS = new Set<PlatformerEditTool>([
  "ground",
  "platform",
  "obstacle",
  "hazard",
]);

/** Maps the active build tool to the cursor mode shown over the map canvas. */
export function platformerEditorCursor(
  tool: PlatformerEditTool | undefined,
): PlatformerEditorCursor | undefined {
  if (!tool) return undefined;
  if (tool === "move") return "pan";
  if (tool === "select") return "select";
  if (tool === "erase") return "erase";
  if (isPlatformerPalettePaintTool(tool)) {
    return "paint";
  }
  return undefined;
}

/** Terrain and object tools chosen from the build sidebar palette. */
export function isPlatformerPalettePaintTool(tool: PlatformerEditTool): boolean {
  return isPlatformerObjectTool(tool) || PLATFORMER_TERRAIN_PAINT_TOOLS.has(tool);
}

/** Clicking an active palette button again returns to select mode. */
export function togglePlatformerPaletteTool(
  activeTool: PlatformerEditTool,
  tool: PlatformerEditTool,
): PlatformerEditTool {
  return activeTool === tool ? "select" : tool;
}

export type PlatformerObjectSettingsChange = Pick<
  PlatformerObjectSettings,
  "assetId" | "behavior" | "direction"
>;

export type PlatformerEditorSelection = {
  objectIds: readonly string[];
  terrainCells: readonly { x: number; y: number }[];
};

export type PlatformerEditorHit =
  | { type: "hud" }
  | { type: "empty" }
  | { type: "object"; id: string }
  | { type: "terrain"; x: number; y: number };

export const EMPTY_PLATFORMER_EDITOR_SELECTION: PlatformerEditorSelection = {
  objectIds: [],
  terrainCells: [],
};

/** HUD pills are drawn about two tiles wide and one tile tall in viewport space. */
export const PLATFORMER_HUD_WIDTH_TILES = 2;
export const PLATFORMER_HUD_HEIGHT_TILES = 1;

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

/** The part of a level's art each placeable thing wears. */
const OBJECT_KIND_ART_SLOTS: Partial<Record<PlatformerObjectKind, PlatformerArtSlot>> = {
  coin: "coin",
  platform_spring: "spring",
  enemy: "enemy",
  boss: "boss",
  flying_object: "flying",
  checkpoint: "checkpoint",
  goal: "goal",
};

/**
 * Dresses one placement in the world it was painted from, which is how a level
 * can hold Graveyard coins beside its own. A placement clones an authored
 * object of the same kind to inherit its point value and patrol, so the art has
 * to be stamped on afterwards. Without a chosen world the object is left as it
 * came, and the level dresses it.
 */
function withPlacementArt(
  object: PlatformerMapObject,
  edit: PlatformerObjectEdit,
): PlatformerMapObject {
  const slot = OBJECT_KIND_ART_SLOTS[edit.kind];
  if (!edit.world || !slot) return object;
  return { ...object, assetId: worldArtAssetId(edit.world, slot) };
}

function defaultObjectForKind(
  map: PlatformerMapSpec,
  edit: PlatformerObjectEdit,
): PlatformerMapSpec["objects"][number] {
  const themedAssets = themedObjectAssets(map.presentation);
  const base = { id: edit.id, x: edit.x, y: edit.y };
  if (edit.kind === "spawn") return { ...base, type: "player_spawn" };
  if (edit.kind === "coin") return { ...base, type: "collectible", pointValue: 1 };
  if (edit.kind === "extra_life") return { ...base, type: "extra_life" };
  if (edit.kind === "platform_spring") {
    return {
      ...base,
      type: "platform_spring",
      assetId: themedAssets.spring,
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

/**
 * Dresses a level in the art it has borrowed from other worlds. Terrain and
 * pickups read `presentation.artBorrows` when they draw, but springs, flying
 * things, enemies and bosses each carry their own `assetId`, so those are
 * re-stamped here.
 *
 * An object dressed by hand keeps the look it was given, whether that was a
 * costume picked in its settings or the world its placement was painted from.
 * Otherwise a kid who placed one Graveyard enemy would lose it the moment the
 * level borrowed enemies from somewhere else.
 */
export function applyPlatformerLevelArt(
  map: PlatformerMapSpec,
  mapSource: PlatformerMapSource,
  levelArt: readonly PlatformerLevelArt[] = [],
  settings: readonly PlatformerObjectSettings[] = [],
  edits: readonly PlatformerObjectEdit[] = [],
): PlatformerMapSpec {
  const borrows: PlatformerArtBorrows = {};
  for (const entry of levelArt) {
    if (entry.mapSource !== mapSource) continue;
    if (entry.world === map.presentation.backgroundId) continue;
    borrows[entry.slot] = entry.world;
  }
  if (Object.keys(borrows).length === 0) return map;

  const dressedByHand = new Set([
    ...settings
      .filter((item) => item.mapSource === mapSource)
      .map((item) => item.objectId),
    ...edits
      .filter((edit) => edit.mapSource === mapSource && edit.world)
      .map((edit) => edit.id),
  ]);
  const themed = themedObjectAssets({
    backgroundId: map.presentation.backgroundId,
    artBorrows: borrows,
  });
  return {
    ...map,
    presentation: { ...map.presentation, artBorrows: borrows },
    objects: map.objects.map((object) => {
      if (dressedByHand.has(object.id)) return object;
      if (object.type === "platform_spring") {
        return borrows.spring ? { ...object, assetId: themed.spring } : object;
      }
      if (object.type === "flying_object") {
        return borrows.flying ? { ...object, assetId: themed.flying } : object;
      }
      if (object.type === "enemy_spawn") {
        if (object.role === "boss") {
          return borrows.boss ? { ...object, assetId: themed.boss } : object;
        }
        return borrows.enemy ? { ...object, assetId: themed.enemy } : object;
      }
      return object;
    }),
  };
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
  const liveEdits = applicable.filter((edit) => !removedIds.has(edit.id));
  const editsById = new Map(liveEdits.map((edit) => [edit.id, edit]));
  const baseIds = new Set(map.objects.map((object) => object.id));
  const replacesSpawn = liveEdits.some((edit) => edit.kind === "spawn");
  return {
    ...map,
    objects: [
      // An edit that reuses a base object's id relocates it in place. A new id
      // is still appended, which is how the place tools add coins and enemies.
      ...map.objects.flatMap((object) => {
        if (removedIds.has(object.id)) return [];
        const edit = editsById.get(object.id);
        if (object.type === "player_spawn" && replacesSpawn) {
          return edit?.kind === "spawn" ? [{ ...object, x: edit.x, y: edit.y }] : [];
        }
        if (edit) return [{ ...object, x: edit.x, y: edit.y }];
        return [object];
      }),
      ...liveEdits.filter((edit) => !baseIds.has(edit.id)).map((edit) => {
        const template = map.objects.find((object) => objectMatchesKind(object, edit.kind));
        return withPlacementArt(
          template
            ? { ...template, id: edit.id, x: edit.x, y: edit.y }
            : defaultObjectForKind(map, edit),
          edit,
        );
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
  world?: ArtWorldId,
): PlatformerObjectEdit[] {
  if (
    placement.x < 0 || placement.y < 0 ||
    placement.x >= baseMap.size.columns || placement.y >= baseMap.size.rows
  ) return [...existing];
  const retained = placement.kind === "spawn"
    ? existing.filter((edit) => !(edit.mapSource === mapSource && edit.kind === "spawn"))
    : [...existing];
  return [...retained, platformerObjectEditFor(mapSource, placement, world)];
}

/**
 * One placement written down. `world` is the world the kid is painting from; a
 * placement already naming its own world wins, so dragging a thing keeps its
 * art.
 */
function platformerObjectEditFor(
  mapSource: PlatformerMapSource,
  placement: PlatformerObjectPlacement,
  world: ArtWorldId | undefined,
): PlatformerObjectEdit {
  const paintedWorld = placement.world ?? world;
  return {
    mapSource,
    id: placement.id,
    x: placement.x,
    y: placement.y,
    kind: placement.kind,
    ...(paintedWorld ? { world: paintedWorld } : {}),
  };
}

/**
 * Folds a drag of object placements into one edit list. Spawn stays unique:
 * later cells in the stroke replace earlier ones, matching a single click.
 */
export function mergePlatformerObjectEdits(
  existing: readonly PlatformerObjectEdit[],
  mapSource: PlatformerMapSource,
  baseMap: PlatformerMapSpec,
  placements: readonly PlatformerObjectPlacement[],
  world?: ArtWorldId,
): PlatformerObjectEdit[] {
  return placements.reduce(
    (edits, placement) => mergePlatformerObjectEdit(edits, mapSource, baseMap, placement, world),
    [...existing],
  );
}

/**
 * Turns the cells visited during a pointer stroke into placements. A spawn
 * stroke keeps only the last cell, because a level has one hero start.
 */
export function objectPlacementsFromStroke(
  kind: PlatformerObjectKind,
  cells: readonly Pick<PlatformerObjectPlacement, "x" | "y">[],
  idFor: (
    cell: Pick<PlatformerObjectPlacement, "x" | "y">,
    index: number,
  ) => string,
): PlatformerObjectPlacement[] {
  const painted = kind === "spawn" ? cells.slice(-1) : cells;
  return painted.map((cell, index) => ({
    id: idFor(cell, index),
    x: cell.x,
    y: cell.y,
    kind,
  }));
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
  /**
   * A tile painted from a chosen world keeps that world's art, which is how one
   * level shows Graveyard ground beside its own. The per-cell override outranks
   * anything the level has borrowed, because it was picked by hand.
   */
  const paintedOverrides: NonNullable<typeof baseTerrain.spriteOverrides> = [];

  for (const edit of applicableEdits) {
    const row = rows[edit.y];
    if (row === undefined) continue;
    const symbol = symbolForKind(map, edit.kind);
    rows[edit.y] = `${row.slice(0, edit.x)}${symbol}${row.slice(edit.x + 1)}`;
    editedCells.add(`${edit.x},${edit.y}`);
    if (edit.world && edit.kind !== "empty") {
      paintedOverrides.push({
        x: edit.x,
        y: edit.y,
        assetId: worldArtAssetId(edit.world, edit.kind),
      });
    }
  }

  return {
    ...map,
    layers: map.layers.map((layer) => {
      if (layer.id !== "terrain") return layer;
      const kept = layer.spriteOverrides?.filter(
        (override) => !editedCells.has(`${override.x},${override.y}`),
      );
      const spriteOverrides = paintedOverrides.length === 0
        ? kept
        : [...(kept ?? []), ...paintedOverrides];
      return { ...layer, rows, spriteOverrides };
    }),
  };
}

/**
 * Folds a paint stroke into the edit list. `world` is the world the kid is
 * painting from; a cell already naming its own world wins, so a dragged tile
 * keeps the art it had.
 */
export function mergePlatformerTerrainEdits(
  existing: readonly PlatformerTerrainEdit[],
  mapSource: PlatformerMapSource,
  baseMap: PlatformerMapSpec,
  stroke: readonly PlatformerTerrainStrokeCell[],
  world?: ArtWorldId,
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
    const paintedWorld = cell.kind === "empty" ? undefined : cell.world ?? world;
    // A tile repainted as what it already was is only worth recording when it
    // is also wearing art the level would not have given it.
    if (
      platformerTerrainKindAt(baseMap, cell.x, cell.y) === cell.kind &&
      !paintedWorld
    ) {
      edits.delete(key);
    } else {
      edits.set(key, {
        mapSource,
        x: cell.x,
        y: cell.y,
        kind: cell.kind,
        ...(paintedWorld ? { world: paintedWorld } : {}),
      });
    }
  }

  return [...edits.values()].sort((left, right) => {
    const sourceOrder = left.mapSource.localeCompare(right.mapSource);
    return sourceOrder || left.y - right.y || left.x - right.x;
  });
}

export function platformerHudAtViewportCell(
  map: PlatformerMapSpec,
  column: number,
  row: number,
) {
  return (map.presentation.hud ?? []).find((entry) => (
    column >= entry.column &&
    column < entry.column + PLATFORMER_HUD_WIDTH_TILES &&
    row >= entry.row &&
    row < entry.row + PLATFORMER_HUD_HEIGHT_TILES
  )) ?? null;
}

export function platformerEditorHitAtCell(
  map: PlatformerMapSpec,
  state: PlatformerState,
  x: number,
  y: number,
): Exclude<PlatformerEditorHit, { type: "hud" }> {
  const object = platformerObjectAtPreviewCell(map, state, x, y);
  if (object) return { type: "object", id: object.id };
  const kind = platformerTerrainKindAt(map, x, y);
  if (kind === "empty") return { type: "empty" };
  return { type: "terrain", x, y };
}

function sameTerrainCell(
  left: { x: number; y: number },
  right: { x: number; y: number },
) {
  return left.x === right.x && left.y === right.y;
}

/**
 * The hero a click may not select. A click on a zoomed-out map stands the hero
 * in the clicked cell, and placing the hero is not selecting them, so a
 * zoomed-out map offers no hero to select.
 */
export function platformerUnselectableHeroId(
  map: PlatformerMapSpec,
  editorZoomScale: number,
) {
  if (editorZoomScale >= 1) return null;
  return map.objects.find((object) => object.type === "player_spawn")?.id ?? null;
}

/** Drops one object from a selection, leaving the terrain cells alone. */
export function platformerSelectionWithoutObject(
  selection: PlatformerEditorSelection,
  objectId: string | null,
): PlatformerEditorSelection {
  if (!objectId || !selection.objectIds.includes(objectId)) return selection;
  return {
    objectIds: selection.objectIds.filter((id) => id !== objectId),
    terrainCells: selection.terrainCells,
  };
}

export function applyPlatformerEditorSelectionClick(
  selection: PlatformerEditorSelection,
  hit: PlatformerEditorHit,
  toggle: boolean,
): PlatformerEditorSelection | null {
  if (hit.type === "hud") return null;
  if (hit.type === "empty") {
    return toggle ? selection : EMPTY_PLATFORMER_EDITOR_SELECTION;
  }
  if (hit.type === "object") {
    const selected = selection.objectIds.includes(hit.id);
    return {
      objectIds: selected
        ? selection.objectIds.filter((id) => id !== hit.id)
        : [...selection.objectIds, hit.id],
      terrainCells: selection.terrainCells,
    };
  }
  const selected = selection.terrainCells.some((cell) => sameTerrainCell(cell, hit));
  return {
    objectIds: selection.objectIds,
    terrainCells: selected
      ? selection.terrainCells.filter((cell) => !sameTerrainCell(cell, hit))
      : [...selection.terrainCells, { x: hit.x, y: hit.y }],
  };
}

export function platformerEditorSelectionHasCell(
  map: PlatformerMapSpec,
  state: PlatformerState,
  selection: PlatformerEditorSelection,
  x: number,
  y: number,
) {
  if (selection.terrainCells.some((cell) => cell.x === x && cell.y === y)) return true;
  const object = platformerObjectAtPreviewCell(map, state, x, y);
  return Boolean(object && selection.objectIds.includes(object.id));
}

export function platformerEditorSelectionCells(
  map: PlatformerMapSpec,
  state: PlatformerState,
  selection: PlatformerEditorSelection,
  delta: { dx: number; dy: number } = { dx: 0, dy: 0 },
) {
  const cells = new Map<string, { x: number; y: number }>();
  for (const objectId of selection.objectIds) {
    const object = map.objects.find((candidate) => candidate.id === objectId);
    if (!object) continue;
    const cell = platformerPreviewCellForObject(map, state, object);
    if (!cell) continue;
    const next = { x: cell.x + delta.dx, y: cell.y + delta.dy };
    cells.set(`${next.x}:${next.y}`, next);
  }
  for (const cell of selection.terrainCells) {
    const next = { x: cell.x + delta.dx, y: cell.y + delta.dy };
    cells.set(`${next.x}:${next.y}`, next);
  }
  return [...cells.values()];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function clampPlatformerSelectionDelta(
  map: PlatformerMapSpec,
  cells: readonly { x: number; y: number }[],
  dx: number,
  dy: number,
) {
  if (cells.length === 0) return { dx: 0, dy: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const cell of cells) {
    minX = Math.min(minX, cell.x);
    maxX = Math.max(maxX, cell.x);
    minY = Math.min(minY, cell.y);
    maxY = Math.max(maxY, cell.y);
  }
  return {
    dx: clamp(dx, -minX, map.size.columns - 1 - maxX),
    dy: clamp(dy, -minY, map.size.rows - 1 - maxY),
  };
}

function upsertPlatformerObjectPlacement(
  existing: readonly PlatformerObjectEdit[],
  mapSource: PlatformerMapSource,
  baseMap: PlatformerMapSpec,
  placement: PlatformerObjectPlacement,
): PlatformerObjectEdit[] {
  if (
    placement.x < 0 || placement.y < 0 ||
    placement.x >= baseMap.size.columns || placement.y >= baseMap.size.rows
  ) return [...existing];
  return [
    ...existing.filter((edit) => {
      if (edit.mapSource !== mapSource) return true;
      if (edit.id === placement.id) return false;
      return !(placement.kind === "spawn" && edit.kind === "spawn");
    }),
    platformerObjectEditFor(mapSource, placement, undefined),
  ];
}

export type PlatformerEditorMoveResult = {
  platformerObjectEdits: PlatformerObjectEdit[];
  platformerTerrainEdits: PlatformerTerrainEdit[];
  delta: { dx: number; dy: number };
  selection: PlatformerEditorSelection;
};

/**
 * Moves the Select-tool group by whole tiles. Terrain is cleared at the old
 * cells, then painted at the new ones, so a one-tile shift of a row does not
 * eat itself. Object ids stay the same so settings follow the move.
 */
export function movePlatformerEditorSelection(
  baseMap: PlatformerMapSpec,
  mapSource: PlatformerMapSource,
  existingObjectEdits: readonly PlatformerObjectEdit[],
  existingRemovals: readonly PlatformerObjectRemoval[] = [],
  existingSettings: readonly PlatformerObjectSettings[] = [],
  existingTerrainEdits: readonly PlatformerTerrainEdit[] = [],
  selection: PlatformerEditorSelection,
  dx: number,
  dy: number,
): PlatformerEditorMoveResult {
  const effectiveMap = applyPlatformerObjectEdits(
    applyPlatformerTerrainEdits(baseMap, mapSource, existingTerrainEdits),
    mapSource,
    existingObjectEdits,
    existingRemovals,
    existingSettings,
  );
  const movingObjects = selection.objectIds.flatMap((objectId) => {
    const object = effectiveMap.objects.find((candidate) => candidate.id === objectId);
    return object
      ? [{
          id: object.id,
          x: Math.floor(object.x),
          y: Math.floor(object.y),
          kind: platformerObjectKind(object),
          // Dragging a thing must not restyle it, so the world it was painted
          // from travels with it.
          world: existingObjectEdits.find(
            (edit) => edit.mapSource === mapSource && edit.id === objectId,
          )?.world,
        }]
      : [];
  });
  const originCells = [
    ...movingObjects.map((object) => ({ x: object.x, y: object.y })),
    ...selection.terrainCells,
  ];
  const delta = clampPlatformerSelectionDelta(effectiveMap, originCells, dx, dy);
  const nextSelection: PlatformerEditorSelection = {
    objectIds: selection.objectIds,
    terrainCells: selection.terrainCells.map((cell) => ({
      x: cell.x + delta.dx,
      y: cell.y + delta.dy,
    })),
  };
  if (delta.dx === 0 && delta.dy === 0) {
    return {
      platformerObjectEdits: [...existingObjectEdits],
      platformerTerrainEdits: [...existingTerrainEdits],
      delta,
      selection: nextSelection,
    };
  }

  let platformerObjectEdits = [...existingObjectEdits];
  for (const object of movingObjects) {
    platformerObjectEdits = upsertPlatformerObjectPlacement(
      platformerObjectEdits,
      mapSource,
      baseMap,
      {
        id: object.id,
        x: object.x + delta.dx,
        y: object.y + delta.dy,
        kind: object.kind,
        world: object.world,
      },
    );
  }

  const terrainStroke: PlatformerTerrainStrokeCell[] = [
    ...selection.terrainCells.map((cell) => ({ ...cell, kind: "empty" as const })),
    ...selection.terrainCells.map((cell) => ({
      x: cell.x + delta.dx,
      y: cell.y + delta.dy,
      kind: platformerTerrainKindAt(effectiveMap, cell.x, cell.y),
      world: existingTerrainEdits.find(
        (edit) => edit.mapSource === mapSource && edit.x === cell.x && edit.y === cell.y,
      )?.world,
    })),
  ];
  const platformerTerrainEdits = terrainStroke.length === 0
    ? [...existingTerrainEdits]
    : mergePlatformerTerrainEdits(
        existingTerrainEdits,
        mapSource,
        baseMap,
        terrainStroke,
      );

  return {
    platformerObjectEdits,
    platformerTerrainEdits,
    delta,
    selection: nextSelection,
  };
}
