import { GAME_PLAYER_CONTENT } from "../game/game-player-content";
import { gameCampaignMaps, gameMazeMaps } from "../game/game-levels";
import {
  HAIR_COLORS,
  SKIN_TONES,
  type GameDocument,
  type GamePreviewKind,
  type HairColor,
  type MazeLevel,
  type MazeMapSource,
  type PlatformerLevel,
  type PlatformerMapSource,
  type SkinTone,
} from "./game-contract";
import { GameObjectEditError } from "./game-objects";
import type { CooperSpecChange } from "./cooper-spec-change";

/** Mirrors the `.max(20)` bound on each level array in `gameDocumentSchema`. */
export const MAX_LEVELS_PER_GAME = 20;
/** Mirrors `platformerLevelSchema.label`. */
export const MAX_LEVEL_NAME_LENGTH = 40;
/** Mirrors `createGameInputSchema.title`. */
export const MAX_GAME_NAME_LENGTH = 80;

export const LEVEL_MOVE_DIRECTIONS = ["earlier", "later"] as const;
export type LevelMoveDirection = (typeof LEVEL_MOVE_DIRECTIONS)[number];

/**
 * The worlds a level can be built from, as the kid sees them named in the
 * builder. Ice World is platformer-only, which is why this is derived from the
 * content catalog rather than from `GAME_THEMES`.
 */
export const WORLD_NAMES = [
  ...new Set([
    ...GAME_PLAYER_CONTENT.maps.map((template) => template.label),
    ...GAME_PLAYER_CONTENT.mazes.map((template) => template.label),
  ]),
] as const;

export function worldNamesFor(kind: GamePreviewKind): string[] {
  return [
    ...new Set(templatesFor(kind).map((template) => template.label)),
  ];
}

export type LevelSummary = Readonly<{
  number: number;
  name: string;
  world: string;
  playing: boolean;
}>;

function templatesFor(kind: GamePreviewKind) {
  return kind === "maze" ? GAME_PLAYER_CONTENT.mazes : GAME_PLAYER_CONTENT.maps;
}

/**
 * The levels in the order the kid sees them in the Level dropdown: a catalog
 * template that has not been customised yet comes first, then the game's own
 * levels. Cooper addresses levels by their position in this list.
 */
function campaignEntries(spec: GameDocument) {
  return spec.previewKind === "maze"
    ? gameMazeMaps(spec, GAME_PLAYER_CONTENT.mazes)
    : gameCampaignMaps(spec, GAME_PLAYER_CONTENT.maps);
}

function worldNameFor(spec: GameDocument, source: string): string {
  const authored = spec.previewKind === "maze"
    ? spec.mazeLevels.find((level) => level.id === source)
    : spec.platformerLevels.find((level) => level.id === source);
  const templateSource = authored?.templateSource ?? source;
  return templatesFor(spec.previewKind).find(
    (template) => template.source === templateSource,
  )?.label ?? "Green Hills";
}

export function gameLevelSummaries(spec: GameDocument): LevelSummary[] {
  const active = spec.previewKind === "maze"
    ? spec.mazeMapSource
    : spec.platformerMapSource;
  return campaignEntries(spec).map((entry, index) => ({
    number: index + 1,
    name: entry.label,
    world: worldNameFor(spec, entry.source),
    playing: entry.source === active,
  }));
}

type PlatformerEdits = Pick<
  GameDocument,
  | "platformerTerrainEdits"
  | "platformerObjectEdits"
  | "platformerObjectRemovals"
  | "platformerObjectSettings"
  | "platformerTerrainSettings"
>;

type Editable<Level> = {
  activeSource: string;
  levels: Level[];
  /**
   * Set when a bare catalog template was turned into one of the game's own
   * levels. Its edits were copied onto the new id, so the entries under the old
   * source have to be dropped or the document would carry both copies.
   */
  promotedFrom?: string;
  edits?: PlatformerEdits;
};

function newLevelId(kind: GamePreviewKind) {
  const prefix = kind === "maze" ? "custom-maze" : "custom-platformer";
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

/**
 * Renaming, reordering, or deleting a level that is still a shared catalog
 * template would change it for every game, so the template is first copied into
 * one of this game's own levels. It goes to the front because that is where
 * `gameCampaignMaps` already lists it, which keeps the level numbers stable.
 */
function editablePlatformerLevels(spec: GameDocument): Editable<PlatformerLevel> {
  const source = spec.platformerMapSource;
  const template = GAME_PLAYER_CONTENT.maps.find(
    (candidate) => candidate.source === source,
  );
  if (!template) return { activeSource: source, levels: [...spec.platformerLevels] };

  const promoted: PlatformerLevel = {
    id: newLevelId("platformer") as PlatformerLevel["id"],
    templateSource: template.source as PlatformerLevel["templateSource"],
    label: `${template.label} 1`,
  };
  const remap = <Entry extends { mapSource: PlatformerMapSource }>(
    entries: readonly Entry[],
  ): Entry[] =>
    entries.map((entry) =>
      entry.mapSource === source ? { ...entry, mapSource: promoted.id } : entry,
    );

  return {
    activeSource: promoted.id,
    levels: [promoted, ...spec.platformerLevels],
    promotedFrom: source,
    edits: {
      platformerTerrainEdits: remap(spec.platformerTerrainEdits),
      platformerObjectEdits: remap(spec.platformerObjectEdits),
      platformerObjectRemovals: remap(spec.platformerObjectRemovals),
      platformerObjectSettings: remap(spec.platformerObjectSettings),
      platformerTerrainSettings: remap(spec.platformerTerrainSettings),
    },
  };
}

function editableMazeLevels(spec: GameDocument): Editable<MazeLevel> {
  const source = spec.mazeMapSource;
  const template = GAME_PLAYER_CONTENT.mazes.find(
    (candidate) => candidate.source === source,
  );
  if (!template) return { activeSource: source, levels: [...spec.mazeLevels] };

  const promoted: MazeLevel = {
    id: newLevelId("maze") as MazeLevel["id"],
    templateSource: template.source as MazeLevel["templateSource"],
    label: `${template.label} 1`,
  };
  return {
    activeSource: promoted.id,
    levels: [promoted, ...spec.mazeLevels],
    promotedFrom: source,
  };
}

/**
 * The two level kinds differ only in which document fields they write and in
 * whether they carry platformer edits, so every planner below works through one
 * of these and stays kind-agnostic.
 */
type LevelOps<Level extends { id: string; label: string }> = Readonly<{
  editable(spec: GameDocument): Editable<Level>;
  create(templateSource: string, label: string): Level;
  change(
    editable: Editable<Level>,
    levels: Level[],
    activeSource: string,
    removed?: readonly string[],
  ): CooperSpecChange;
}>;

function droppedSources(editable: Editable<unknown>, removed: readonly string[]) {
  const sources = [
    ...(editable.promotedFrom ? [editable.promotedFrom] : []),
    ...removed,
  ];
  return sources.length ? { removedMapSources: sources } : {};
}

const PLATFORMER_OPS: LevelOps<PlatformerLevel> = {
  editable: editablePlatformerLevels,
  create: (templateSource, label) => ({
    id: newLevelId("platformer") as PlatformerLevel["id"],
    templateSource: templateSource as PlatformerLevel["templateSource"],
    label,
  }),
  change: (editable, levels, activeSource, removed = []) => ({
    platformerLevels: levels,
    platformerMapSource: activeSource as PlatformerMapSource,
    ...(editable.edits ?? {}),
    ...droppedSources(editable, removed),
  }),
};

const MAZE_OPS: LevelOps<MazeLevel> = {
  editable: editableMazeLevels,
  create: (templateSource, label) => ({
    id: newLevelId("maze") as MazeLevel["id"],
    templateSource: templateSource as MazeLevel["templateSource"],
    label,
  }),
  change: (editable, levels, activeSource, removed = []) => ({
    mazeLevels: levels,
    mazeMapSource: activeSource as MazeMapSource,
    ...droppedSources(editable, removed),
  }),
};

/** Runs one planner body against whichever level kind this game uses. */
function forKind(
  kind: GamePreviewKind,
  run: <Level extends { id: string; label: string }>(ops: LevelOps<Level>) => CooperSpecChange,
): CooperSpecChange {
  return kind === "maze" ? run(MAZE_OPS) : run(PLATFORMER_OPS);
}

function requireLevelIndex(count: number, level: unknown): number {
  if (typeof level !== "number" || !Number.isInteger(level)) {
    throw new GameObjectEditError(
      "Cooper needs a level number.",
      `got ${String(level)}`,
    );
  }
  const index = level - 1;
  if (index < 0 || index >= count) {
    throw new GameObjectEditError(
      count === 1
        ? "This game only has one level, so that has to be level 1."
        : `This game has levels 1 to ${count}.`,
      `requested ${level}`,
    );
  }
  return index;
}

function requireName(value: unknown, limit: number, what: string): string {
  const name = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!name) throw new GameObjectEditError(`Cooper needs a name for the ${what}.`);
  if (name.length > limit) {
    throw new GameObjectEditError(
      `That ${what} name is too long. Keep it under ${limit} letters.`,
      `${name.length} characters`,
    );
  }
  return name;
}

/**
 * Cooper names a world the way the kid sees it. The builder's own dialogs pass
 * the template filename they already hold, so both are accepted.
 */
function requireTemplate(kind: GamePreviewKind, world: unknown) {
  const wanted = typeof world === "string" ? world.trim().toLowerCase() : "";
  const template = templatesFor(kind).find(
    (candidate) =>
      candidate.label.toLowerCase() === wanted || candidate.source.toLowerCase() === wanted,
  );
  if (!template) {
    const choices = worldNamesFor(kind).join(", ");
    throw new GameObjectEditError(
      `Cooper cannot build a level in "${String(world)}". The worlds you can use are ${choices}.`,
    );
  }
  return template;
}

/** Validates a name for the whole game. It is stored beside the spec, not in it. */
export function planGameName(name: unknown): string {
  return requireName(name, MAX_GAME_NAME_LENGTH, "game");
}

export function planAddLevel(
  spec: GameDocument,
  world: unknown,
  name: unknown,
): CooperSpecChange {
  const template = requireTemplate(spec.previewKind, world);
  const label = requireName(name, MAX_LEVEL_NAME_LENGTH, "level");

  return forKind(spec.previewKind, (ops) => {
    const editable = ops.editable(spec);
    if (editable.levels.length >= MAX_LEVELS_PER_GAME) {
      throw new GameObjectEditError(
        `This game already has ${MAX_LEVELS_PER_GAME} levels, which is as many as it can hold.`,
      );
    }
    const added = ops.create(template.source, label);
    return ops.change(editable, [...editable.levels, added], added.id);
  });
}

export function planRenameLevel(
  spec: GameDocument,
  level: unknown,
  name: unknown,
): CooperSpecChange {
  const label = requireName(name, MAX_LEVEL_NAME_LENGTH, "level");

  return forKind(spec.previewKind, (ops) => {
    const editable = ops.editable(spec);
    const index = requireLevelIndex(editable.levels.length, level);
    const levels = editable.levels.map((entry, position) =>
      position === index ? { ...entry, label } : entry,
    );
    return ops.change(editable, levels, editable.activeSource);
  });
}

export function planRemoveLevel(
  spec: GameDocument,
  level: unknown,
): CooperSpecChange {
  return forKind(spec.previewKind, (ops) => {
    const editable = ops.editable(spec);
    const index = requireLevelIndex(editable.levels.length, level);
    if (editable.levels.length <= 1) {
      throw new GameObjectEditError("Every game needs at least one level to play.");
    }

    const removed = editable.levels[index];
    const levels = editable.levels.filter((_, position) => position !== index);
    const nextActive = editable.activeSource === removed.id
      ? levels[Math.min(index, levels.length - 1)].id
      : editable.activeSource;

    return ops.change(editable, levels, nextActive, [removed.id]);
  });
}

export function planMoveLevel(
  spec: GameDocument,
  level: unknown,
  direction: unknown,
): CooperSpecChange {
  if (!(LEVEL_MOVE_DIRECTIONS as readonly unknown[]).includes(direction)) {
    throw new GameObjectEditError(
      "Cooper can only move a level earlier or later.",
      `got ${String(direction)}`,
    );
  }

  return forKind(spec.previewKind, (ops) => {
    const editable = ops.editable(spec);
    const index = requireLevelIndex(editable.levels.length, level);
    const target = index + (direction === "earlier" ? -1 : 1);
    if (target < 0 || target >= editable.levels.length) {
      throw new GameObjectEditError(
        direction === "earlier"
          ? "That level is already first, so it cannot move earlier."
          : "That level is already last, so it cannot move later.",
      );
    }

    const levels = [...editable.levels];
    [levels[index], levels[target]] = [levels[target], levels[index]];
    return ops.change(editable, levels, editable.activeSource);
  });
}

/**
 * Moves one level directly to another numbered position. The settings dialog
 * uses this for drag-and-drop so a long move is one undoable edit rather than
 * a burst of adjacent moves.
 */
export function planMoveLevelTo(
  spec: GameDocument,
  level: unknown,
  position: unknown,
): CooperSpecChange {
  return forKind(spec.previewKind, (ops) => {
    const editable = ops.editable(spec);
    const index = requireLevelIndex(editable.levels.length, level);
    const target = requireLevelIndex(editable.levels.length, position);

    if (index === target) {
      return ops.change(editable, editable.levels, editable.activeSource);
    }

    const levels = [...editable.levels];
    const [moved] = levels.splice(index, 1);
    levels.splice(target, 0, moved);
    return ops.change(editable, levels, editable.activeSource);
  });
}

/**
 * A catalog template is only listed while it is the level being shown, so
 * switching away from one has to copy it into the game first or it drops off
 * the end of the list. Switching to the level already showing changes nothing.
 */
export function planSetActiveLevel(
  spec: GameDocument,
  level: unknown,
): CooperSpecChange {
  const entries = campaignEntries(spec);
  const index = requireLevelIndex(entries.length, level);
  const source = entries[index].source;
  const showing = spec.previewKind === "maze" ? spec.mazeMapSource : spec.platformerMapSource;

  if (source === showing) {
    return spec.previewKind === "maze"
      ? { mazeMapSource: source as MazeMapSource }
      : { platformerMapSource: source as PlatformerMapSource };
  }

  // After a copy the levels sit in campaign order too, so the position holds.
  return forKind(spec.previewKind, (ops) => {
    const editable = ops.editable(spec);
    return ops.change(editable, editable.levels, editable.levels[index].id);
  });
}

export function planGameType(gameType: unknown): CooperSpecChange {
  if (gameType !== "platformer" && gameType !== "maze") {
    throw new GameObjectEditError(
      "Cooper can only make a jumping game or a maze game.",
      `got ${String(gameType)}`,
    );
  }
  return { previewKind: gameType };
}

export function planPlayerAppearance(
  skinTone: unknown,
  hairColor: unknown,
): CooperSpecChange {
  if (!(SKIN_TONES as readonly unknown[]).includes(skinTone)) {
    throw new GameObjectEditError(
      "Cooper does not have that skin tone.",
      `got ${String(skinTone)}`,
    );
  }
  if (!(HAIR_COLORS as readonly unknown[]).includes(hairColor)) {
    throw new GameObjectEditError(
      "Cooper does not have that hair colour.",
      `got ${String(hairColor)}`,
    );
  }
  return { skinTone: skinTone as SkinTone, hairColor: hairColor as HairColor };
}
