import { GAME_PLAYER_CONTENT } from "../game/game-player-content";
import { gameCampaignMaps } from "../game/game-levels";
import {
  applyPlatformerLevelArt,
  applyPlatformerObjectEdits,
  applyPlatformerRules,
  applyPlatformerTerrainEdits,
  applyPlatformerTerrainSettings,
  platformerObjectAtCell,
  platformerObjectKind,
  platformerTerrainKindAt,
} from "../game/platformer/map-editing";
import { ART_WORLDS } from "../game/platformer/art-catalog";
import {
  charactersFor,
  type CharacterOption,
} from "../game/platformer/character-catalog";
import {
  DEFAULT_STARTING_LIVES,
  MAXIMUM_STARTING_LIVES,
  MINIMUM_STARTING_LIVES,
  resolveStartingLives,
} from "../game/platformer/engine";
import type { PlatformerMapSpec } from "../game/platformer/types";
import {
  HERO_CHOICES,
  HERO_OPTION_ENUMS,
  heroLabel,
} from "../game/hero-catalog";
import {
  PLATFORMER_OBJECT_KINDS,
  platformerTemplateSource,
  playerAssetIdForPlatformerLevel,
  type ArtWorldId,
  type GameDocument,
  type PlatformerMapSource,
  type PlatformerObjectEdit,
  type PlatformerObjectKind,
  type PlatformerObjectSettings,
  type PlatformerTerrainKind,
} from "./game-contract";
import type { CooperSpecChange } from "./cooper-spec-change";

export type { CooperSpecChange } from "./cooper-spec-change";

/**
 * The kinds Cooper may add or remove. `spawn` and `goal` are deliberately
 * absent: a level with no spawn or no goal cannot be played or finished, and a
 * second one of either is meaningless.
 */
export const COOPER_OBJECT_KINDS = [
  "coin",
  "extra_life",
  "platform_spring",
  "enemy",
  "boss",
  "flying_object",
  "checkpoint",
] as const satisfies readonly PlatformerObjectKind[];

export type CooperObjectKind = (typeof COOPER_OBJECT_KINDS)[number];

/** Kinds that stand on a surface, so they need solid terrain directly below. */
const GROUNDED_OBJECT_KINDS = new Set<CooperObjectKind>([
  "enemy",
  "boss",
  "platform_spring",
  "checkpoint",
]);

const SUPPORTING_TERRAIN_KINDS = new Set<PlatformerTerrainKind>([
  "ground",
  "platform",
  "obstacle",
]);

export const MAX_PLACEMENTS_PER_CALL = 24;
export const MAX_OBJECTS_PER_LEVEL = 400;
/** Mirrors the `.max(1000)` bound on each array in `gameDocumentSchema`. */
const MAX_STORED_ENTRIES = 1000;

const OBJECT_GRID_SYMBOLS: Record<PlatformerObjectKind, string> = {
  spawn: "P",
  coin: "c",
  extra_life: "x",
  platform_spring: "s",
  enemy: "e",
  boss: "B",
  flying_object: "f",
  checkpoint: "k",
  goal: "G",
};

const EMPTY_OBJECT_CELL = ".";

/** Words Cooper can say to a kid, rather than the schema's snake_case kinds. */
const KIND_LABELS: Record<CooperObjectKind, { one: string; many: string }> = {
  coin: { one: "coin", many: "coins" },
  extra_life: { one: "extra life", many: "extra lives" },
  platform_spring: { one: "spring", many: "springs" },
  enemy: { one: "enemy", many: "enemies" },
  boss: { one: "boss", many: "bosses" },
  flying_object: { one: "flying thing", many: "flying things" },
  checkpoint: { one: "checkpoint", many: "checkpoints" },
};

export const OBJECT_GRID_LEGEND: Readonly<Record<string, string>> = Object.freeze({
  [EMPTY_OBJECT_CELL]: "nothing",
  ...Object.fromEntries(
    PLATFORMER_OBJECT_KINDS.map((kind) => [OBJECT_GRID_SYMBOLS[kind], kind]),
  ),
});

export class GameObjectEditError extends Error {
  /** Short, kid-safe explanation Cooper can repeat in chat. */
  readonly reason: string;

  constructor(reason: string, detail?: string) {
    super(detail ? `${reason} (${detail})` : reason);
    this.name = "GameObjectEditError";
    this.reason = reason;
  }
}

export function isCooperObjectKind(value: unknown): value is CooperObjectKind {
  return typeof value === "string"
    && (COOPER_OBJECT_KINDS as readonly string[]).includes(value);
}

export type ActivePlatformerLevel = Readonly<{
  mapSource: PlatformerMapSource;
  label: string;
  /** The map as played: catalog map plus this game's terrain and object edits. */
  map: PlatformerMapSpec;
}>;

/**
 * The level the builder is currently showing, composed the same way
 * `GamePlayer` composes it, so Cooper reads exactly what the kid can see.
 */
export function resolveActivePlatformerLevel(
  spec: GameDocument,
): ActivePlatformerLevel | null {
  if (spec.previewKind !== "platformer") return null;

  const campaignMaps = gameCampaignMaps(spec, GAME_PLAYER_CONTENT.maps);
  const active = campaignMaps.find(
    (candidate) => candidate.source === spec.platformerMapSource,
  ) ?? campaignMaps[0];
  if (!active) return null;

  const map = applyPlatformerRules(
    applyPlatformerLevelArt(
      applyPlatformerObjectEdits(
        applyPlatformerTerrainSettings(
          applyPlatformerTerrainEdits(active.map, active.source, spec.platformerTerrainEdits),
          active.source,
          spec.platformerTerrainSettings,
        ),
        active.source,
        spec.platformerObjectEdits,
        spec.platformerObjectRemovals,
        spec.platformerObjectSettings,
      ),
      active.source,
      spec.platformerLevelArt,
      spec.platformerObjectSettings,
      spec.platformerObjectEdits,
    ),
    spec.startingLives,
  );

  return { mapSource: active.source, label: active.label, map };
}

function terrainRows(map: PlatformerMapSpec): string[] {
  return map.layers.find((layer) => layer.id === "terrain")?.rows ?? [];
}

/**
 * Who the kid plays as on this level, with the sprite this level's art will
 * draw and every hero option Cooper may switch to.
 */
export function describePlayer(spec: GameDocument, level: ActivePlatformerLevel) {
  const templateSource = platformerTemplateSource(spec, level.mapSource);
  const backgroundId = level.map.presentation.backgroundId as ArtWorldId;
  const lookFor = (character: typeof spec.playerCharacter, gender = spec.humanGender) =>
    playerAssetIdForPlatformerLevel(templateSource, backgroundId, character, gender);

  return {
    character: spec.playerCharacter,
    gender: spec.humanGender,
    skinTone: spec.skinTone,
    hairColor: spec.hairColor,
    look: lookFor(spec.playerCharacter),
    label: heroLabel(spec.playerCharacter),
    options: HERO_CHOICES.map((choice) => ({
      character: choice.value,
      label: choice.label,
      look: lookFor(choice.value, choice.value === "human" ? spec.humanGender : "boy"),
    })),
    ...HERO_OPTION_ENUMS,
  };
}

/**
 * The grids Cooper reads before choosing cells: the authored terrain rows, and
 * a parallel grid of one symbol per object. Object ids are deliberately not
 * listed -- a level carries around a hundred of them, nearly all coins.
 */
export function describeLevel(level: ActivePlatformerLevel, spec?: GameDocument) {
  const { map } = level;
  const { columns, rows } = map.size;
  const grid = Array.from({ length: rows }, () => new Array<string>(columns).fill(EMPTY_OBJECT_CELL));
  const counts: Partial<Record<PlatformerObjectKind, number>> = {};

  for (const object of map.objects) {
    const kind = platformerObjectKind(object);
    counts[kind] = (counts[kind] ?? 0) + 1;
    const x = Math.floor(object.x);
    const y = Math.floor(object.y);
    if (x < 0 || y < 0 || x >= columns || y >= rows) continue;
    grid[y][x] = OBJECT_GRID_SYMBOLS[kind];
  }

  return {
    level: { mapSource: level.mapSource, label: level.label, columns, rows },
    startingLives: resolveStartingLives(map),
    ...(spec ? { player: describePlayer(spec, level) } : {}),
    characters: describeCharacters(level),
    openCells: openCells(level, grid),
    terrainLegend: Object.fromEntries(
      Object.entries(map.legend).map(([symbol, entry]) => [
        symbol,
        `${entry.visualSlot} (${entry.collision})`,
      ]),
    ),
    terrain: terrainRows(map),
    objectLegend: OBJECT_GRID_LEGEND,
    objects: grid.map((row) => row.join("")),
    counts,
    addableKinds: COOPER_OBJECT_KINDS,
    limits: {
      maxPerCall: MAX_PLACEMENTS_PER_CALL,
      maxObjectsPerLevel: MAX_OBJECTS_PER_LEVEL,
    },
  };
}

/** Both planners always write both arrays, so callers never see `undefined`. */
export type ObjectArrayChange = CooperSpecChange
  & Required<Pick<CooperSpecChange, "platformerObjectEdits" | "platformerObjectRemovals">>;

export const MAX_SUGGESTED_CELLS = 30;

/**
 * Ready-made cells a new object may go in, spread evenly along the level.
 *
 * The grids alone are enough to work this out, but deriving it costs the model
 * a lot of hidden reasoning on an eighty-column map -- enough to run the
 * response out of output tokens before it emits a tool call. Handing over the
 * answer keeps a placement turn cheap and removes the main source of rejected
 * cells.
 */
function openCells(level: ActivePlatformerLevel, objectGrid: readonly string[][]) {
  const { columns, rows } = level.map.size;
  const grounded: { x: number; y: number }[] = [];
  const floating: { x: number; y: number }[] = [];

  for (let x = 0; x < columns; x += 1) {
    for (let y = 0; y < rows; y += 1) {
      if (objectGrid[y][x] !== EMPTY_OBJECT_CELL) continue;
      if (platformerTerrainKindAt(level.map, x, y) !== "empty") continue;
      const below = y + 1 < rows ? platformerTerrainKindAt(level.map, x, y + 1) : "empty";
      (SUPPORTING_TERRAIN_KINDS.has(below) ? grounded : floating).push({ x, y });
    }
  }

  // An even stride across the level, so anything Cooper adds is spread out
  // rather than bunched at the start where the scan happens to begin.
  const spread = (cells: { x: number; y: number }[]) => {
    if (cells.length <= MAX_SUGGESTED_CELLS) return cells;
    const step = cells.length / MAX_SUGGESTED_CELLS;
    return Array.from(
      { length: MAX_SUGGESTED_CELLS },
      (_, index) => cells[Math.floor(index * step)],
    );
  };

  return {
    note: "Pick from these. onGround suits enemies, bosses, springs and checkpoints; either list suits coins, extra lives and flying things.",
    onGround: spread(grounded),
    inAir: spread(floating),
  };
}

export type ObjectPlacementRequest = Readonly<{ kind: string; x: number; y: number }>;
export type ObjectCellRequest = Readonly<{ x: number; y: number }>;

function assertCell(level: ActivePlatformerLevel, x: number, y: number) {
  const { columns, rows } = level.map.size;
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw new GameObjectEditError(
      "Those spots need to be whole numbers on the grid.",
      `non-integer cell ${x},${y}`,
    );
  }
  if (x < 0 || y < 0 || x >= columns || y >= rows) {
    throw new GameObjectEditError(
      `That spot is outside the level. It is ${columns} wide and ${rows} tall.`,
      `out of bounds ${x},${y}`,
    );
  }
}

/**
 * Continues the `cooper-<kind>-<n>` sequence already present in the game, so
 * the same request always produces the same ids and tests need no clock stub.
 */
function nextIdFactory(spec: GameDocument, level: ActivePlatformerLevel) {
  const taken = [
    ...spec.platformerObjectEdits.map((edit) => edit.id),
    ...level.map.objects.map((object) => object.id),
  ];
  const highest = new Map<string, number>();
  for (const id of taken) {
    const match = /^cooper-([a-z_]+)-(\d+)$/.exec(id);
    if (!match) continue;
    const current = highest.get(match[1]) ?? 0;
    highest.set(match[1], Math.max(current, Number(match[2])));
  }
  return (kind: CooperObjectKind) => {
    const next = (highest.get(kind) ?? 0) + 1;
    highest.set(kind, next);
    return `cooper-${kind}-${next}`;
  };
}

/**
 * Validates every requested cell before producing the next edits array. Fails
 * closed: one bad cell rejects the whole call rather than silently relocating
 * an object or dropping it.
 */
export function planObjectAdditions(
  spec: GameDocument,
  level: ActivePlatformerLevel,
  placements: readonly ObjectPlacementRequest[],
  look = "",
): ObjectArrayChange & { added: readonly PlatformerObjectEdit[] } {
  if (placements.length === 0) {
    throw new GameObjectEditError("Cooper needs to know what to add and where.");
  }
  if (placements.length > MAX_PLACEMENTS_PER_CALL) {
    throw new GameObjectEditError(
      `Cooper can only add ${MAX_PLACEMENTS_PER_CALL} things at a time.`,
      `requested ${placements.length}`,
    );
  }
  if (level.map.objects.length + placements.length > MAX_OBJECTS_PER_LEVEL) {
    throw new GameObjectEditError(
      "This level is already too full to add more.",
      `${level.map.objects.length} objects plus ${placements.length}`,
    );
  }

  const nextId = nextIdFactory(spec, level);
  const claimed = new Set<string>();
  const added: PlatformerObjectEdit[] = [];

  for (const placement of placements) {
    const { kind, x, y } = placement;
    if (!isCooperObjectKind(kind)) {
      throw new GameObjectEditError(
        `Cooper cannot add a "${kind}".`,
        `unsupported kind ${kind}`,
      );
    }
    assertCell(level, x, y);

    const cell = `${x},${y}`;
    if (claimed.has(cell)) {
      throw new GameObjectEditError(
        "Cooper tried to put two things in the same spot.",
        `duplicate cell ${cell}`,
      );
    }
    claimed.add(cell);

    const terrain = platformerTerrainKindAt(level.map, x, y);
    if (terrain !== "empty") {
      throw new GameObjectEditError(
        `That spot is not empty, it is ${terrain}. Pick an open space.`,
        `cell ${cell} is ${terrain}`,
      );
    }
    if (platformerObjectAtCell(level.map, x, y)) {
      throw new GameObjectEditError(
        "Something is already in that spot.",
        `cell ${cell} is occupied`,
      );
    }
    if (GROUNDED_OBJECT_KINDS.has(kind)) {
      const below = y + 1 < level.map.size.rows
        ? platformerTerrainKindAt(level.map, x, y + 1)
        : "empty";
      if (!SUPPORTING_TERRAIN_KINDS.has(below)) {
        throw new GameObjectEditError(
          `A ${KIND_LABELS[kind].one} needs solid ground underneath it.`,
          `cell ${cell} has ${below} below`,
        );
      }
    }

    added.push({ id: nextId(kind), mapSource: level.mapSource, x, y, kind });
  }

  const platformerObjectEdits = [...spec.platformerObjectEdits, ...added];
  if (platformerObjectEdits.length > MAX_STORED_ENTRIES) {
    throw new GameObjectEditError(
      "This game has too many changes saved to add more.",
      `${platformerObjectEdits.length} edits`,
    );
  }

  return {
    platformerObjectEdits,
    platformerObjectRemovals: spec.platformerObjectRemovals,
    ...(look ? dressAddedCharacters(spec, level, added, look) : {}),
    added,
  };
}

/**
 * Gives everything just added the look it was asked for, so "add three ghosts
 * from the dragon world" is one call. A new object's edit id is also its object
 * id, so the settings rows can be written before the object exists.
 */
function dressAddedCharacters(
  spec: GameDocument,
  level: ActivePlatformerLevel,
  added: readonly PlatformerObjectEdit[],
  look: string,
): Required<Pick<CooperSpecChange, "platformerObjectSettings">> {
  const lookRole = resolveLook(look);
  const wrongKind = added.find((edit) => edit.kind !== lookRole);
  if (wrongKind) {
    throw new GameObjectEditError(
      lookRole === "boss"
        ? `That is a boss look, so it only fits a boss, not a ${KIND_LABELS[wrongKind.kind as CooperObjectKind].one}.`
        : `That look is for an enemy, not a ${KIND_LABELS[wrongKind.kind as CooperObjectKind].one}.`,
      `look ${look} on kind ${wrongKind.kind}`,
    );
  }

  const settings = new Map(
    spec.platformerObjectSettings.map((item) => [`${item.mapSource}:${item.objectId}`, item]),
  );
  for (const edit of added) {
    settings.set(`${level.mapSource}:${edit.id}`, {
      mapSource: level.mapSource,
      objectId: edit.id,
      assetId: look,
      behavior: "patroller",
      direction: "left",
    });
  }

  const platformerObjectSettings = [...settings.values()];
  if (platformerObjectSettings.length > MAX_STORED_ENTRIES) {
    throw new GameObjectEditError(
      "This game has too many changes saved to add more.",
      `${platformerObjectSettings.length} settings`,
    );
  }
  return { platformerObjectSettings };
}

/**
 * Removes by cell, or every object of a kind when no cells are given, so
 * "remove all the coins" is one call rather than ninety coordinates.
 */
export function planObjectRemovals(
  spec: GameDocument,
  level: ActivePlatformerLevel,
  kind: string,
  cells: readonly ObjectCellRequest[],
): ObjectArrayChange & { removedCount: number } {
  if (!isCooperObjectKind(kind)) {
    throw new GameObjectEditError(
      `Cooper cannot remove a "${kind}".`,
      `unsupported kind ${kind}`,
    );
  }
  if (cells.length > MAX_PLACEMENTS_PER_CALL) {
    throw new GameObjectEditError(
      `Cooper can only remove ${MAX_PLACEMENTS_PER_CALL} things at a time.`,
      `requested ${cells.length}`,
    );
  }

  const targetIds = new Set<string>();

  if (cells.length === 0) {
    for (const object of level.map.objects) {
      if (platformerObjectKind(object) === kind) targetIds.add(object.id);
    }
    if (targetIds.size === 0) {
      throw new GameObjectEditError(`There are no ${KIND_LABELS[kind].many} in this level.`);
    }
  } else {
    for (const { x, y } of cells) {
      assertCell(level, x, y);
      const object = platformerObjectAtCell(level.map, x, y);
      if (!object || platformerObjectKind(object) !== kind) {
        throw new GameObjectEditError(
          `There is no ${KIND_LABELS[kind].one} in that spot.`,
          `cell ${x},${y}`,
        );
      }
      targetIds.add(object.id);
    }
  }

  const removals = new Map(
    spec.platformerObjectRemovals.map((removal) => [
      `${removal.mapSource}:${removal.objectId}`,
      removal,
    ]),
  );
  for (const objectId of targetIds) {
    removals.set(`${level.mapSource}:${objectId}`, {
      mapSource: level.mapSource,
      objectId,
    });
  }

  const platformerObjectRemovals = [...removals.values()];
  if (platformerObjectRemovals.length > MAX_STORED_ENTRIES) {
    throw new GameObjectEditError(
      "This game has too many changes saved to remove more.",
      `${platformerObjectRemovals.length} removals`,
    );
  }

  return {
    // A removal already suppresses a matching edit, but dropping the edit keeps
    // the saved game from growing a pair of entries that cancel each other out.
    platformerObjectEdits: spec.platformerObjectEdits.filter(
      (edit) => !(edit.mapSource === level.mapSource && targetIds.has(edit.id)),
    ),
    platformerObjectRemovals,
    removedCount: targetIds.size,
  };
}


/**
 * The looks of one role across every world, grouped by the world that drew
 * them. A kid asking for "ghosts from the dragon world" while an ice level is
 * open is asking for art this level does not wear, so the whole catalog is
 * offered rather than only the active world's corner of it.
 */
function looksByWorld(role: "enemy" | "boss") {
  return ART_WORLDS.map((world) => ({
    world: world.name,
    looks: charactersFor(world.id, role),
  }));
}

/** The look options of one role from every world, flattened and deduplicated. */
function everyLook(role: "enemy" | "boss"): readonly CharacterOption[] {
  const options = new Map<string, CharacterOption>();
  for (const world of ART_WORLDS) {
    for (const option of charactersFor(world.id, role)) options.set(option.value, option);
  }
  return [...options.values()];
}

function lookLabel(look: string): string {
  return [...everyLook("enemy"), ...everyLook("boss")]
    .find((option) => option.value === look)?.label ?? look;
}

/**
 * Every enemy and boss with the look it is wearing right now, plus every look
 * any world offers. A level holds only a handful of these, so they are listed
 * in full and Cooper can answer "change the ghosts to robots" without guessing
 * an asset id.
 */
export function describeCharacters(level: ActivePlatformerLevel) {
  return {
    inLevel: level.map.objects
      .filter((object) => object.type === "enemy_spawn")
      .map((object) => {
        const role = object.role === "boss" ? ("boss" as const) : ("enemy" as const);
        const look = object.assetId ?? "";
        return {
          x: Math.floor(object.x),
          y: Math.floor(object.y),
          role,
          look,
          label: lookLabel(look),
        };
      }),
    note: "A look from any world may be used on any level.",
    enemyLooksByWorld: looksByWorld("enemy"),
    bossLooksByWorld: looksByWorld("boss"),
  };
}

/**
 * Which role a look belongs to. An unknown asset id would render as a default
 * ghost rather than failing, so a look nobody drew is refused here. Any world's
 * look fits any level: that is what makes "add ghosts from the dragon world"
 * possible on an ice level.
 */
function resolveLook(look: string): "enemy" | "boss" {
  if (everyLook("boss").some((option) => option.value === look)) return "boss";
  if (everyLook("enemy").some((option) => option.value === look)) return "enemy";
  throw new GameObjectEditError(
    `Cooper does not have a look called "${look}". Pick one from the looks each world has.`,
    `unknown look ${look}`,
  );
}

/**
 * Repaints enemies and bosses. Named cells are repainted, and an empty cell
 * list repaints every enemy or boss whose look matches `fromLook`, or all of
 * them when `fromLook` is blank.
 */
export function planAppearanceChange(
  spec: GameDocument,
  level: ActivePlatformerLevel,
  look: string,
  fromLook: string,
  cells: readonly ObjectCellRequest[],
): Required<Pick<CooperSpecChange, "platformerObjectSettings">>
  & { changed: readonly { x: number; y: number; look: string }[] } {
  const lookRole = resolveLook(look);
  if (cells.length > MAX_PLACEMENTS_PER_CALL) {
    throw new GameObjectEditError(
      `Cooper can only change ${MAX_PLACEMENTS_PER_CALL} of them at a time.`,
      `requested ${cells.length}`,
    );
  }

  const isBossLook = lookRole === "boss";
  const characters = level.map.objects.filter((object) => object.type === "enemy_spawn");
  const targets = cells.length === 0
    // Sweeping the whole level only touches the ones the look actually fits,
    // so "turn the enemies into robots" repaints the enemies and leaves the
    // boss alone rather than being refused outright.
    ? characters.filter((object) => (
      (object.role === "boss") === isBossLook && (!fromLook || object.assetId === fromLook)
    ))
    : cells.map(({ x, y }) => {
      assertCell(level, x, y);
      const object = platformerObjectAtCell(level.map, x, y);
      if (!object || object.type !== "enemy_spawn") {
        throw new GameObjectEditError(
          "There is no enemy or boss in that spot.",
          `cell ${x},${y}`,
        );
      }
      return object;
    });

  if (targets.length === 0) {
    throw new GameObjectEditError(
      fromLook
        ? "There is nothing in this level with that look."
        : `This level has no ${isBossLook ? "bosses" : "enemies"} to change.`,
      `fromLook ${fromLook || "(any)"}`,
    );
  }

  // A boss look on a plain enemy, or the reverse, would draw with the wrong
  // sheet geometry, so a directly named cell has to match the table the look
  // came from. A whole-level sweep has already filtered by role above.
  for (const object of targets) {
    const isBoss = object.role === "boss";
    if (isBoss !== isBossLook) {
      throw new GameObjectEditError(
        isBoss
          ? "That look is for a regular enemy, not a boss."
          : "That is a boss look, and it only fits a boss.",
        `look ${look} on role ${object.role ?? "enemy"}`,
      );
    }
  }

  const settings = new Map(
    spec.platformerObjectSettings.map((item) => [`${item.mapSource}:${item.objectId}`, item]),
  );
  const changed: { x: number; y: number; look: string }[] = [];
  for (const object of targets) {
    // behavior and direction are required on a settings row, so the object's
    // current values are carried over rather than reset to a default.
    const entry: PlatformerObjectSettings = {
      mapSource: level.mapSource,
      objectId: object.id,
      assetId: look,
      behavior: object.behavior === "chaser" ? "chaser" : "patroller",
      direction: object.direction === "left" ? "left" : "right",
    };
    settings.set(`${level.mapSource}:${object.id}`, entry);
    changed.push({ x: Math.floor(object.x), y: Math.floor(object.y), look });
  }

  const platformerObjectSettings = [...settings.values()];
  if (platformerObjectSettings.length > MAX_STORED_ENTRIES) {
    throw new GameObjectEditError(
      "This game has too many changes saved to change more.",
      `${platformerObjectSettings.length} settings`,
    );
  }

  return { platformerObjectSettings, changed };
}

/** Clamps and validates the count that becomes the played map's start count. */
export function planStartingLives(
  lives: unknown,
): Required<Pick<CooperSpecChange, "startingLives">> {
  if (typeof lives !== "number" || !Number.isInteger(lives)) {
    throw new GameObjectEditError("Cooper needs a whole number of lives.", `got ${String(lives)}`);
  }
  if (lives < MINIMUM_STARTING_LIVES || lives > MAXIMUM_STARTING_LIVES) {
    throw new GameObjectEditError(
      `Lives have to be between ${MINIMUM_STARTING_LIVES} and ${MAXIMUM_STARTING_LIVES}.`,
      `requested ${lives}`,
    );
  }
  return { startingLives: lives };
}

export { DEFAULT_STARTING_LIVES, MAXIMUM_STARTING_LIVES, MINIMUM_STARTING_LIVES };
