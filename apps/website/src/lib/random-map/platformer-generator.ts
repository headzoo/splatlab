import {
  FIXED_DELTA_SECONDS,
  PLATFORMER_COLLISION_SKIN_PX,
  PLATFORMER_PLAYER_HALF_WIDTH_PX,
  PLATFORMER_PLAYER_HEIGHT_PX,
  resolvePhysics,
} from "@/game/platformer/engine";
import type {
  PlatformerMapObject,
  PlatformerMapSpec,
  PlatformerPhysicsSpec,
} from "@/game/platformer/types";
import {
  CATALOG_PLATFORMER_GAME_PHYSICS,
  PLATFORMER_LEVEL_DESIGN,
  type PlatformerGamePhysicsDocument,
} from "@/lib/game-physics";
import {
  generatedPlatformerMapSchema,
  type GeneratedPlatformerMap,
} from "@/lib/generated-map-contract";

export type PlatformerMapLength = "short" | "medium" | "long";

export const PLATFORMER_GENERATED_WIDTHS: Readonly<Record<PlatformerMapLength, number>> = {
  short: 48,
  medium: 88,
  long: 128,
};
export const PLATFORMER_FLAT_START_COLUMNS = 8;
export const PLATFORMER_FINAL_ARENA_COLUMNS = 18;
export const PLATFORMER_GENERATOR_VERSION = 3;
export const HIGH_CLIMB_TILES = 7;
export const HIGH_SECTION_COUNTS: Readonly<Record<PlatformerMapLength, number>> = {
  short: 1,
  medium: 2,
  long: 3,
};
const HIGH_SECTION_WIDTH = 18;
const STAIR_STEP_WIDTH = 2;
const PEAK_PLATFORM_WIDTH = 4;
const DESCENT_COLUMNS = 6;
const APPROACH_COLUMNS = 2;
const COLLECTIBLE_SPACING_COLUMNS = 2;
const ENEMY_COUNTS: Readonly<Record<PlatformerMapLength, number>> = {
  short: 3,
  medium: 5,
  long: 7,
};

const MAX_GENERATION_ATTEMPTS = 24;
const EMPTY = ".";

type RandomSource = {
  next(): number;
  integer(minimum: number, maximum: number): number;
  pick<Value>(values: readonly Value[]): Value;
};

export type PlatformerLanding = {
  startColumn: number;
  endColumn: number;
  surfaceRow: number;
};

export type PlatformerReachability = {
  reachable: boolean;
  route: PlatformerLanding[];
  reason?: string;
};

export type GeneratePlatformerMapOptions = {
  donor: PlatformerMapSpec;
  length: PlatformerMapLength;
  seed: number | string;
  physics?: PlatformerGamePhysicsDocument;
  id?: string;
  maxAttempts?: number;
};

export class PlatformerGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformerGenerationError";
  }
}

function seedNumber(seed: number | string) {
  if (typeof seed === "number") return (Math.trunc(seed) >>> 0) || 0x9e3779b9;
  let value = 2166136261;
  for (const character of seed) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0 || 0x9e3779b9;
}

function randomSource(seed: number | string): RandomSource {
  let state = seedNumber(seed);
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
  return {
    next,
    integer(minimum, maximum) {
      return minimum + Math.floor(next() * (maximum - minimum + 1));
    },
    pick(values) {
      return values[Math.min(values.length - 1, Math.floor(next() * values.length))];
    },
  };
}

function collisionSymbols(donor: PlatformerMapSpec) {
  const entries = Object.entries(donor.legend);
  const bySlot = (
    visualSlot: PlatformerMapSpec["legend"][string]["visualSlot"],
    collision?: PlatformerMapSpec["legend"][string]["collision"],
  ) => entries.find(([, value]) => (
    value.visualSlot === visualSlot
    && (collision === undefined || value.collision === collision)
  ))?.[0];
  return {
    empty: bySlot("empty") ?? EMPTY,
    ground: bySlot("ground", "solid") ?? "#",
    platform: bySlot("platform") ?? "=",
    obstacle: bySlot("obstacle", "solid") ?? "O",
    hazard: bySlot("hazard") ?? "^",
  };
}

function highSectionStarts(width: number, length: PlatformerMapLength) {
  const arenaStart = width - PLATFORMER_FINAL_ARENA_COLUMNS;
  const playable = arenaStart - PLATFORMER_FLAT_START_COLUMNS;
  const count = HIGH_SECTION_COUNTS[length];
  const starts: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const slotStart = PLATFORMER_FLAT_START_COLUMNS + Math.floor(index * playable / count);
    const slotEnd = PLATFORMER_FLAT_START_COLUMNS + Math.floor((index + 1) * playable / count);
    const leftover = slotEnd - slotStart - HIGH_SECTION_WIDTH;
    const pitPad = leftover >= 4 ? Math.min(4, leftover) : 0;
    const start = slotStart + pitPad;
    if (start + HIGH_SECTION_WIDTH <= Math.min(arenaStart, slotEnd)) {
      starts.push(start);
    }
  }
  return starts;
}

function paintGroundColumn(
  grid: string[][],
  column: number,
  surfaceRow: number | null,
  bottom: number,
  symbols: ReturnType<typeof collisionSymbols>,
) {
  if (surfaceRow === null) {
    grid[bottom][column] = symbols.hazard;
    return;
  }
  for (let row = surfaceRow; row <= bottom; row += 1) {
    grid[row][column] = symbols.ground;
  }
}

function clearColumn(
  grid: string[][],
  column: number,
  bottom: number,
  empty: string,
) {
  for (let row = 0; row <= bottom; row += 1) grid[row][column] = empty;
}

function paintStairColumn(
  grid: string[][],
  column: number,
  top: number,
  bottom: number,
  symbols: ReturnType<typeof collisionSymbols>,
) {
  clearColumn(grid, column, bottom, symbols.empty);
  grid[top][column] = symbols.obstacle;
}

function paintPeakColumn(
  grid: string[][],
  column: number,
  bottom: number,
  symbols: ReturnType<typeof collisionSymbols>,
) {
  const top = bottom - Math.ceil(HIGH_CLIMB_TILES / 2) * 2;
  clearColumn(grid, column, bottom, symbols.empty);
  grid[top][column] = symbols.platform;
}

function paintHighSection(
  grid: string[][],
  start: number,
  bottom: number,
  symbols: ReturnType<typeof collisionSymbols>,
) {
  const width = grid[0]?.length ?? 0;
  const peakRise = Math.ceil(HIGH_CLIMB_TILES / 2) * 2;
  let column = start;
  const paintGround = (count: number) => {
    for (let offset = 0; offset < count && column < width; offset += 1, column += 1) {
      clearColumn(grid, column, bottom, symbols.empty);
      paintGroundColumn(grid, column, bottom, bottom, symbols);
    }
  };
  paintGround(APPROACH_COLUMNS);
  for (let rise = 2; rise < peakRise && column < width; rise += 2) {
    for (let offset = 0; offset < STAIR_STEP_WIDTH && column < width; offset += 1, column += 1) {
      paintStairColumn(grid, column, bottom - rise, bottom, symbols);
    }
  }
  for (let offset = 0; offset < PEAK_PLATFORM_WIDTH && column < width; offset += 1, column += 1) {
    paintPeakColumn(grid, column, bottom, symbols);
  }
  paintGround(DESCENT_COLUMNS);
}

function ensureHazardPits(
  grid: string[][],
  width: number,
  length: PlatformerMapLength,
  bottom: number,
  symbols: ReturnType<typeof collisionSymbols>,
  random: RandomSource,
) {
  const climbs = highSectionStarts(width, length);
  const arenaStart = width - PLATFORMER_FINAL_ARENA_COLUMNS;
  const ranges: Array<[number, number]> = [];
  let cursor = PLATFORMER_FLAT_START_COLUMNS;
  for (const start of climbs) {
    ranges.push([cursor, start]);
    cursor = start + HIGH_SECTION_WIDTH;
  }
  ranges.push([cursor, arenaStart]);

  for (const [from, to] of ranges) {
    const span = to - from;
    if (span < 4) continue;
    const pitCount = span >= 14 ? 2 : 1;
    for (let index = 0; index < pitCount; index += 1) {
      const pitWidth = span <= 5 ? 2 : random.integer(2, 3);
      const slot = span / pitCount;
      const slotFrom = from + Math.floor(index * slot);
      const slotTo = from + Math.floor((index + 1) * slot);
      const afterClimb = from > PLATFORMER_FLAT_START_COLUMNS;
      const minStart = slotFrom + (afterClimb && index === 0 ? 4 : 0);
      const maxStart = slotTo - pitWidth - 2;
      const pitStart = maxStart < minStart
        ? slotFrom
        : random.integer(minStart, maxStart);
      for (let column = pitStart; column < pitStart + pitWidth && column < to; column += 1) {
        clearColumn(grid, column, bottom, symbols.empty);
        grid[bottom][column] = symbols.hazard;
      }
    }
  }
}

function makeTerrain(
  donor: PlatformerMapSpec,
  width: number,
  length: PlatformerMapLength,
  random: RandomSource,
) {
  const rows = donor.size.rows;
  if (rows < 5) {
    throw new PlatformerGenerationError(
      `Platformer donor ${donor.id} has only ${rows} rows; at least 5 are required.`,
    );
  }
  const symbols = collisionSymbols(donor);
  const bottom = rows - 1;
  if (bottom < HIGH_CLIMB_TILES) {
    throw new PlatformerGenerationError(
      `Platformer donor ${donor.id} has only ${rows} rows; at least ${HIGH_CLIMB_TILES + 1} are required for tall climbs.`,
    );
  }
  const arenaStart = width - PLATFORMER_FINAL_ARENA_COLUMNS;
  const surface = Array<number | null>(width).fill(bottom);
  for (let x = 0; x < width; x += 1) surface[x] = bottom;

  const grid = Array.from({ length: rows }, () => Array(width).fill(symbols.empty));
  for (let x = 0; x < width; x += 1) {
    paintGroundColumn(grid, x, surface[x], bottom, symbols);
  }
  ensureHazardPits(grid, width, length, bottom, symbols, random);
  for (const start of highSectionStarts(width, length)) {
    paintHighSection(grid, start, bottom, symbols);
  }
  const extraPlatforms: Array<{ start: number; end: number; row: number }> = [];
  const climbs = highSectionStarts(width, length);
  const ranges: Array<[number, number]> = [];
  let cursor = PLATFORMER_FLAT_START_COLUMNS;
  for (const start of climbs) {
    ranges.push([cursor, start]);
    cursor = start + HIGH_SECTION_WIDTH;
  }
  ranges.push([cursor, arenaStart]);
  for (const [from, to] of ranges) {
    if (to - from < 10 || random.next() < 0.25) continue;
    const widthTiles = random.integer(3, 5);
    const start = to - widthTiles - 2;
    const end = start + widthTiles - 1;
    if (end - start < 2) continue;
    if (Array.from({ length: end - start + 3 }, (_, offset) => start - 1 + offset)
      .some((column) => grid[bottom][column] === symbols.hazard)) {
      continue;
    }
    extraPlatforms.push({ start, end, row: bottom - 2 });
  }
  for (const platform of extraPlatforms) {
    const stepColumn = platform.start - 1;
    if (stepColumn >= 0 && grid[platform.row][stepColumn] === symbols.empty) {
      grid[platform.row][stepColumn] = symbols.obstacle;
    }
    for (let x = platform.start; x <= platform.end; x += 1) {
      if (grid[platform.row][x] === symbols.empty) grid[platform.row][x] = symbols.platform;
    }
  }
  return grid.map((row) => row.join(""));
}

function terrainRows(map: PlatformerMapSpec) {
  return map.layers.find((layer) => layer.id === "terrain")?.rows ?? [];
}

function collisionAt(map: PlatformerMapSpec, column: number, row: number) {
  if (column < 0 || column >= map.size.columns || row < 0 || row >= map.size.rows) {
    return "none";
  }
  const symbol = terrainRows(map)[row]?.[column] ?? EMPTY;
  return map.legend[symbol]?.collision ?? "none";
}

function surfaceAt(map: PlatformerMapSpec, column: number) {
  let oneWay: number | null = null;
  for (let row = 0; row < map.size.rows; row += 1) {
    const collision = collisionAt(map, column, row);
    if (collision === "one_way" && oneWay === null) oneWay = row;
    if (collision === "solid") return row;
  }
  return oneWay;
}

export function platformerLandings(map: PlatformerMapSpec): PlatformerLanding[] {
  const result: PlatformerLanding[] = [];
  let current: PlatformerLanding | null = null;
  for (let column = 0; column < map.size.columns; column += 1) {
    const row = surfaceAt(map, column);
    if (row === null) {
      current = null;
      continue;
    }
    if (current && current.surfaceRow === row && current.endColumn === column - 1) {
      current.endColumn = column;
    } else {
      current = { startColumn: column, endColumn: column, surfaceRow: row };
      result.push(current);
    }
  }
  return result;
}

function physicsSpec(document: PlatformerGamePhysicsDocument): PlatformerPhysicsSpec {
  return document;
}

function actorOverlaps(
  map: PlatformerMapSpec,
  x: number,
  y: number,
  blocked: ReadonlySet<string>,
) {
  const left = Math.floor(
    (x - PLATFORMER_PLAYER_HALF_WIDTH_PX + PLATFORMER_COLLISION_SKIN_PX) / map.tileSize,
  );
  const right = Math.floor(
    (x + PLATFORMER_PLAYER_HALF_WIDTH_PX - PLATFORMER_COLLISION_SKIN_PX) / map.tileSize,
  );
  const top = Math.floor(
    (y - PLATFORMER_PLAYER_HEIGHT_PX + PLATFORMER_COLLISION_SKIN_PX) / map.tileSize,
  );
  const bottom = Math.floor((y - PLATFORMER_COLLISION_SKIN_PX) / map.tileSize);
  for (let row = top; row <= bottom; row += 1) {
    for (let column = left; column <= right; column += 1) {
      if (blocked.has(collisionAt(map, column, row))) return true;
    }
  }
  return false;
}

function landingsOverlap(left: PlatformerLanding, right: PlatformerLanding) {
  return left.startColumn <= right.endColumn && right.startColumn <= left.endColumn;
}

function trajectoryReachesWithRelease(
  map: PlatformerMapSpec,
  document: PlatformerGamePhysicsDocument,
  source: PlatformerLanding,
  target: PlatformerLanding,
  releaseTick: number | null,
) {
  const overlapping = landingsOverlap(source, target);
  const rising = target.surfaceRow < source.surfaceRow;
  const direction = overlapping
    ? 1
    : target.startColumn > source.endColumn ? 1 : -1;
  const sourceColumn = overlapping
    ? Math.min(
        source.endColumn,
        Math.max(source.startColumn, Math.floor((target.startColumn + target.endColumn) / 2)),
      )
    : direction > 0
      ? Math.max(source.startColumn, source.endColumn - (rising ? 2 : 0))
      : Math.min(source.endColumn, source.startColumn + (rising ? 2 : 0));
  const targetNearColumn = overlapping
    ? sourceColumn
    : direction > 0 ? target.startColumn : target.endColumn;
  const spawn = map.objects.find((object) => object.type === "player_spawn");
  const resolved = resolvePhysics(
    physicsSpec(document),
    map.tileSize,
    map.physics.gravityScale,
    map.physics.groundTractionScale,
    spawn?.speedPxPerSecond,
  );
  let x = (sourceColumn + 0.5) * map.tileSize;
  let y = source.surfaceRow * map.tileSize - PLATFORMER_COLLISION_SKIN_PX;
  let vx = document.verticalMovement.mode === "flight"
    ? 0
    : direction * resolved.maximumRunSpeed;
  let vy = document.verticalMovement.mode === "grounded_jump"
    ? resolved.jumpVelocity
    : 0;
  const targetTop = target.surfaceRow * map.tileSize;
  const targetLeft = target.startColumn * map.tileSize;
  const targetRight = (target.endColumn + 1) * map.tileSize;
  const blocked = new Set(["solid", "hazard"]);

  for (let tick = 0; tick < 240; tick += 1) {
    if (document.verticalMovement.mode === "flight") {
      const flight = document.verticalMovement.flight;
      const horizontallyArrived = x >= targetLeft + map.tileSize / 2
        && x <= targetRight - map.tileSize / 2;
      const clearanceY = Math.min(source.surfaceRow * map.tileSize, targetTop)
        - map.tileSize
        - PLATFORMER_COLLISION_SKIN_PX;
      const desiredY = horizontallyArrived
        ? targetTop - PLATFORMER_COLLISION_SKIN_PX
        : clearanceY;
      const targetVy = y > desiredY + map.tileSize / 8
        ? -flight.maximumRiseSpeedTilesPerSecond * map.tileSize
        : y < desiredY - map.tileSize / 8
          ? flight.maximumFallSpeedTilesPerSecond * map.tileSize
          : 0;
      const verticalMaximum = Math.max(
        flight.maximumRiseSpeedTilesPerSecond,
        flight.maximumFallSpeedTilesPerSecond,
      ) * map.tileSize;
      const verticalTime = targetVy === 0
        ? flight.timeToStopSeconds
        : flight.timeToMaximumSpeedSeconds;
      const change = verticalMaximum / verticalTime * FIXED_DELTA_SECONDS;
      vy = vy < targetVy ? Math.min(vy + change, targetVy) : Math.max(vy - change, targetVy);
      const horizontalTarget = !horizontallyArrived
        && y <= clearanceY + map.tileSize / 8
        ? direction * resolved.maximumRunSpeed
        : 0;
      const horizontalChange = resolved.airAcceleration * FIXED_DELTA_SECONDS;
      vx = vx < horizontalTarget
        ? Math.min(vx + horizontalChange, horizontalTarget)
        : Math.max(vx - horizontalChange, horizontalTarget);
    } else {
      if (releaseTick === tick && vy < 0) {
        vy *= document.verticalMovement.groundedJump.earlyReleaseVelocityMultiplier;
      }
      vy = Math.min(
        vy + resolved.gravity * FIXED_DELTA_SECONDS,
        resolved.maximumFallSpeed,
      );
    }
    const previousY = y;
    x += vx * FIXED_DELTA_SECONDS;
    y += (document.verticalMovement.mode === "grounded_jump"
      ? (vy - resolved.gravity * FIXED_DELTA_SECONDS) * FIXED_DELTA_SECONDS
        + 0.5 * resolved.gravity * FIXED_DELTA_SECONDS ** 2
      : vy * FIXED_DELTA_SECONDS);

    const descending = y >= previousY;
    const overlapsLanding = x + PLATFORMER_PLAYER_HALF_WIDTH_PX > targetLeft
      && x - PLATFORMER_PLAYER_HALF_WIDTH_PX < targetRight;
    if (
      document.verticalMovement.mode === "flight"
      && overlapsLanding
      && Math.abs(y - targetTop) <= map.tileSize / 3
    ) {
      return true;
    }
    if (descending && previousY <= targetTop && y >= targetTop && overlapsLanding) {
      return true;
    }
    if (actorOverlaps(map, x, y, blocked)) return false;
    if (
      (direction > 0 && x > (targetNearColumn + 5) * map.tileSize)
      || (direction < 0 && x < (targetNearColumn - 4) * map.tileSize)
      || y > map.size.rows * map.tileSize + map.tileSize
    ) return false;
  }
  return false;
}

function trajectoryReaches(
  map: PlatformerMapSpec,
  document: PlatformerGamePhysicsDocument,
  source: PlatformerLanding,
  target: PlatformerLanding,
) {
  if (document.verticalMovement.mode === "flight") {
    return trajectoryReachesWithRelease(map, document, source, target, null);
  }
  return [1, 4, 8, 12, null].some((releaseTick) => (
    trajectoryReachesWithRelease(map, document, source, target, releaseTick)
  ));
}

export function validatePlatformerReachability(
  map: PlatformerMapSpec,
  document: PlatformerGamePhysicsDocument,
): PlatformerReachability {
  const landings = platformerLandings(map);
  const spawn = map.objects.find((object) => object.type === "player_spawn");
  if (!spawn) return { reachable: false, route: [], reason: "Map has no player spawn." };
  const spawnLanding = landings.find((landing) => (
    spawn.x >= landing.startColumn
    && spawn.x <= landing.endColumn
    && spawn.y + 1 === landing.surfaceRow
  ));
  const arenaStart = map.size.columns - PLATFORMER_FINAL_ARENA_COLUMNS;
  const arenaLanding = landings.find((landing) => (
    landing.startColumn <= arenaStart
    && landing.endColumn === map.size.columns - 1
    && landing.endColumn - Math.max(landing.startColumn, arenaStart) + 1
      >= PLATFORMER_FINAL_ARENA_COLUMNS
  ));
  if (!spawnLanding || !arenaLanding) {
    return { reachable: false, route: [], reason: "Spawn or final arena lacks valid support." };
  }

  const previous = new Map<PlatformerLanding, PlatformerLanding | null>([[spawnLanding, null]]);
  const queue = [spawnLanding];
  while (queue.length > 0) {
    const source = queue.shift()!;
    if (source === arenaLanding) break;
    for (const target of landings) {
      if (previous.has(target)) continue;
      const overlapping = landingsOverlap(source, target);
      if (!overlapping && target.startColumn <= source.startColumn) continue;
      const gap = overlapping ? 0 : target.startColumn - source.endColumn - 1;
      const rise = source.surfaceRow - target.surfaceRow;
      if (
        gap > PLATFORMER_LEVEL_DESIGN.maximumCriticalPathGapTiles
        || rise > PLATFORMER_LEVEL_DESIGN.maximumDirectRiseTiles
      ) continue;
      if (!trajectoryReaches(map, document, source, target)) continue;
      previous.set(target, source);
      queue.push(target);
    }
  }
  if (!previous.has(arenaLanding)) {
    return { reachable: false, route: [], reason: "No collision-clear landing route reaches the arena." };
  }
  const route: PlatformerLanding[] = [];
  for (let landing: PlatformerLanding | null = arenaLanding; landing; landing = previous.get(landing) ?? null) {
    route.push(landing);
  }
  route.reverse();
  return { reachable: true, route };
}

function archetype(donor: PlatformerMapSpec, type: PlatformerMapObject["type"], boss = false) {
  return donor.objects.find((object) => (
    object.type === type && (type !== "enemy_spawn" || (object.role === "boss") === boss)
  ));
}

function cloneObject(
  source: PlatformerMapObject,
  id: string,
  x: number,
  y: number,
): PlatformerMapObject {
  const object: PlatformerMapObject = { id, type: source.type, x, y };
  const keys = [
    "pointValue", "role", "viewMusicCue", "assetId", "launchSpeedPxPerSecond",
    "behavior", "direction", "patrolLeftTiles", "patrolRightTiles",
    "viewLeftTiles", "viewRightTiles", "speedPxPerSecond", "defeatMode",
    "hitsToDefeat", "rangedAttack", "motion",
  ] as const;
  for (const key of keys) {
    if (source[key] !== undefined) {
      (object as unknown as Record<string, unknown>)[key] = structuredClone(source[key]);
    }
  }
  return object;
}

function supportedCell(map: PlatformerMapSpec, column: number) {
  const row = surfaceAt(map, column);
  return row === null ? null : { x: column, y: row - 1 };
}

function oneWayRuns(map: PlatformerMapSpec): PlatformerLanding[] {
  const result: PlatformerLanding[] = [];
  for (let row = 0; row < map.size.rows; row += 1) {
    let current: PlatformerLanding | null = null;
    for (let column = 0; column < map.size.columns; column += 1) {
      if (collisionAt(map, column, row) !== "one_way") {
        current = null;
        continue;
      }
      if (current && current.endColumn === column - 1) {
        current.endColumn = column;
      } else {
        current = { startColumn: column, endColumn: column, surfaceRow: row };
        result.push(current);
      }
    }
  }
  return result;
}

function claimOnLanding(
  map: PlatformerMapSpec,
  landing: PlatformerLanding,
  claim: (x: number, y: number) => boolean,
  preferredColumn?: number,
  onOneWay = false,
) {
  const mid = preferredColumn ?? Math.floor((landing.startColumn + landing.endColumn) / 2);
  const columns = [mid];
  for (let offset = 1; offset <= landing.endColumn - landing.startColumn; offset += 1) {
    columns.push(mid - offset, mid + offset);
  }
  for (const column of columns) {
    if (column < landing.startColumn || column > landing.endColumn) continue;
    const cell = onOneWay
      ? { x: column, y: landing.surfaceRow - 1 }
      : supportedCell(map, column);
    if (cell && claim(cell.x, cell.y)) return { cell, column };
  }
  return null;
}

function playableLandings(map: PlatformerMapSpec) {
  const arenaStart = map.size.columns - PLATFORMER_FINAL_ARENA_COLUMNS;
  return [...platformerLandings(map), ...oneWayRuns(map)].filter((landing) => (
    landing.endColumn >= PLATFORMER_FLAT_START_COLUMNS
    && landing.startColumn < arenaStart
  ));
}

export function oneWayPlatformsAreJumpable(map: PlatformerMapSpec) {
  for (const landing of oneWayRuns(map)) {
    for (let column = landing.startColumn; column <= landing.endColumn; column += 1) {
      let supported = false;
      for (let rise = 1; rise <= PLATFORMER_LEVEL_DESIGN.maximumDirectRiseTiles; rise += 1) {
        if (collisionAt(map, column, landing.surfaceRow + rise) === "solid") {
          supported = true;
          break;
        }
      }
      if (!supported) return false;
    }
  }
  return true;
}

function placeObjects(map: PlatformerMapSpec, donor: PlatformerMapSpec, random: RandomSource) {
  const objects: PlatformerMapObject[] = [];
  const occupied = new Set<string>();
  const claim = (x: number, y: number) => {
    const key = `${x},${y}`;
    if (
      occupied.has(key)
      || x < 0
      || y < 0
      || x >= map.size.columns
      || y >= map.size.rows
      || collisionAt(map, x, y) !== "none"
    ) return false;
    occupied.add(key);
    return true;
  };

  const spawnTemplate = archetype(donor, "player_spawn");
  if (!spawnTemplate) {
    throw new PlatformerGenerationError(`Platformer donor ${donor.id} has no player spawn archetype.`);
  }
  const spawnCell = supportedCell(map, 1)!;
  const spawn = cloneObject(spawnTemplate, "spawn_1", spawnCell.x, spawnCell.y);
  spawn.speedPxPerSecond ??= 320;
  spawn.motion ??= {
    version: 1,
    travel: { type: "controlled" },
    visual: { type: "none" },
  };
  objects.push(spawn);
  claim(spawn.x, spawn.y);

  const route = playableLandings(map);
  const groundRoute = route.filter((landing) => (
    collisionAt(
      map,
      Math.floor((landing.startColumn + landing.endColumn) / 2),
      landing.surfaceRow,
    ) === "solid"
  ));
  const collectibleTemplate = archetype(donor, "collectible");

  const checkpointTemplate = archetype(donor, "checkpoint");
  if (checkpointTemplate) {
    const checkpointColumns = [
      Math.floor(map.size.columns / 2),
      map.size.columns - PLATFORMER_FINAL_ARENA_COLUMNS - 2,
    ];
    checkpointColumns.forEach((wanted, index) => {
      const landing = groundRoute
        .filter((candidate) => candidate.endColumn - candidate.startColumn >= 2)
        .sort((left, right) => (
          Math.abs((left.startColumn + left.endColumn) / 2 - wanted)
          - Math.abs((right.startColumn + right.endColumn) / 2 - wanted)
        ))[0];
      if (!landing) return;
      const column = Math.max(landing.startColumn + 1, Math.min(wanted, landing.endColumn - 1));
      const cell = supportedCell(map, column);
      if (cell && claim(cell.x, cell.y)) {
        objects.push(cloneObject(checkpointTemplate, `checkpoint_${index + 1}`, cell.x, cell.y));
      }
    });
  }

  const enemyTemplates = donor.objects.filter((object) => (
    object.type === "enemy_spawn" && object.role !== "boss"
  ));
  const length: PlatformerMapLength = map.size.columns >= 128
    ? "long"
    : map.size.columns >= 88
      ? "medium"
      : "short";
  const enemyCount = ENEMY_COUNTS[length];
  const playableStart = PLATFORMER_FLAT_START_COLUMNS;
  const playableEnd = map.size.columns - PLATFORMER_FINAL_ARENA_COLUMNS - 1;
  for (let index = 0; index < enemyCount; index += 1) {
    const wanted = playableStart + Math.floor(
      (index + 1) * (playableEnd - playableStart) / (enemyCount + 1),
    );
    const landing = (groundRoute.find((candidate) => (
      wanted >= candidate.startColumn && wanted <= candidate.endColumn
    )) ?? [...groundRoute].sort((left, right) => (
      Math.abs((left.startColumn + left.endColumn) / 2 - wanted)
      - Math.abs((right.startColumn + right.endColumn) / 2 - wanted)
    ))[0]);
    const template = random.pick(enemyTemplates);
    if (!template || !landing) continue;
    const placed = claimOnLanding(map, landing, claim, wanted);
    if (!placed) continue;
    const { cell, column } = placed;
    const enemy = cloneObject(template, `enemy_${index + 1}`, cell.x, cell.y);
    enemy.role ??= "enemy";
    enemy.assetId ??= "neutral_ghost_01";
    enemy.behavior ??= "patroller";
    enemy.direction ??= "left";
    enemy.speedPxPerSecond ??= 48;
    enemy.pointValue ??= 0;
    enemy.defeatMode ??= "both";
    const reach = Math.max(1, Math.floor((landing.endColumn - landing.startColumn) / 2));
    if (enemy.behavior === "chaser") {
      enemy.viewLeftTiles = Math.min(reach, column - landing.startColumn);
      enemy.viewRightTiles = Math.min(reach, landing.endColumn - column);
    } else {
      enemy.patrolLeftTiles = Math.min(reach, column - landing.startColumn);
      enemy.patrolRightTiles = Math.min(reach, landing.endColumn - column);
    }
    if (enemy.motion?.travel.type === "circle") {
      enemy.motion = {
        version: 1,
        travel: { type: "behavior" },
        visual: structuredClone(enemy.motion.visual),
      };
    }
    objects.push(enemy);
  }

  const extraLifeTemplate = archetype(donor, "extra_life");
  if (extraLifeTemplate) {
    const platform = oneWayRuns(map).find((landing) => (
      landing.endColumn >= PLATFORMER_FLAT_START_COLUMNS
      && landing.startColumn < map.size.columns - PLATFORMER_FINAL_ARENA_COLUMNS
      && landing.endColumn - landing.startColumn >= 2
    ));
    const landing = platform ?? groundRoute[Math.floor(groundRoute.length / 2)];
    if (landing) {
      const column = Math.floor((landing.startColumn + landing.endColumn) / 2);
      const cell = platform
        ? { x: column, y: landing.surfaceRow - 1 }
        : supportedCell(map, column);
      if (cell && claim(cell.x, cell.y)) {
        objects.push(cloneObject(extraLifeTemplate, "extra_life_1", cell.x, cell.y));
      }
    }
  }

  const arenaStart = map.size.columns - PLATFORMER_FINAL_ARENA_COLUMNS;
  const bossTemplate = archetype(donor, "enemy_spawn", true);
  let placedBoss = false;
  if (bossTemplate) {
    const column = map.size.columns - 7;
    const cell = supportedCell(map, column)!;
    if (claim(cell.x, cell.y)) {
      const boss = cloneObject(bossTemplate, "boss_1", cell.x, cell.y);
      boss.role = "boss";
      boss.assetId ??= "neutral_green_hills_boss_01";
      boss.behavior ??= "patroller";
      boss.direction ??= "left";
      boss.speedPxPerSecond ??= 48;
      boss.pointValue ??= 0;
      boss.defeatMode ??= "both";
      boss.hitsToDefeat ??= 1;
      if (boss.behavior === "chaser") {
        boss.viewLeftTiles = Math.min(3, column - arenaStart - 1);
        boss.viewRightTiles = Math.min(3, map.size.columns - column - 2);
      } else {
        boss.patrolLeftTiles = Math.min(3, column - arenaStart - 1);
        boss.patrolRightTiles = Math.min(3, map.size.columns - column - 2);
      }
      objects.push(boss);
      placedBoss = true;
    }
  }
  if (!placedBoss) {
    const goalTemplate = archetype(donor, "goal") ?? { id: "goal", type: "goal" as const, x: 0, y: 0 };
    const cell = supportedCell(map, map.size.columns - 2)!;
    if (claim(cell.x, cell.y)) objects.push(cloneObject(goalTemplate, "goal_1", cell.x, cell.y));
  }

  if (collectibleTemplate) {
    let collectibleIndex = 0;
    for (const landing of route) {
      for (let column = landing.startColumn; column <= landing.endColumn; column += 1) {
        if (column < PLATFORMER_FLAT_START_COLUMNS || column % COLLECTIBLE_SPACING_COLUMNS !== 0) {
          continue;
        }
        const onOneWay = collisionAt(map, column, landing.surfaceRow) === "one_way";
        const cell = onOneWay
          ? { x: column, y: landing.surfaceRow - 1 }
          : supportedCell(map, column);
        if (!cell || !claim(cell.x, cell.y)) continue;
        collectibleIndex += 1;
        objects.push(cloneObject(
          collectibleTemplate,
          `collectible_${collectibleIndex}`,
          cell.x,
          cell.y,
        ));
      }
    }
  }

  const flyingTemplate = archetype(donor, "flying_object");
  if (flyingTemplate && map.camera.rows <= 64) {
    const x = Math.max(PLATFORMER_FLAT_START_COLUMNS, Math.floor(map.size.columns / 3));
    const flying = cloneObject(
      flyingTemplate,
      "flying_1",
      x,
      Math.min(flyingTemplate.y, map.size.rows - 1),
    );
    if (flying.motion?.travel.type === "viewport_arc") {
      flying.motion.travel.entryRow = Math.min(flying.motion.travel.entryRow, map.camera.rows - 1);
      flying.motion.travel.exitRow = Math.min(flying.motion.travel.exitRow, map.camera.rows - 1);
    }
    objects.push(flying);
  }
  return objects;
}

function validateObjectSupports(map: PlatformerMapSpec) {
  for (const object of map.objects) {
    if (object.type === "flying_object") continue;
    const supportRow = object.y + 1;
    const support = collisionAt(map, object.x, supportRow);
    if (support !== "solid" && support !== "one_way") {
      throw new PlatformerGenerationError(
        `Generated ${object.type} ${object.id} has no support at ${object.x},${supportRow}.`,
      );
    }
    if (collisionAt(map, object.x, object.y) !== "none") {
      throw new PlatformerGenerationError(
        `Generated ${object.type} ${object.id} overlaps terrain at ${object.x},${object.y}.`,
      );
    }
  }
}

function buildCandidate(
  options: GeneratePlatformerMapOptions,
  width: number,
  attempt: number,
) {
  const random = randomSource(`${String(options.seed)}:${attempt}`);
  const donor = options.donor;
  const rows = makeTerrain(donor, width, options.length, random);
  const map: PlatformerMapSpec = {
    schemaVersion: donor.schemaVersion,
    id: options.id ?? `generated-${donor.id}-${options.length}-${seedNumber(options.seed).toString(16)}`,
    revision: 1,
    runtime: donor.runtime,
    tileSize: donor.tileSize,
    size: { columns: width, rows: donor.size.rows },
    camera: structuredClone(donor.camera),
    // Solid stair lips are authored against the catalog jump envelope.
    // Donor gravity (space is 0.5) makes the reachability BFS reject those lips.
    physics: { ...structuredClone(donor.physics), gravityScale: 1 },
    rules: structuredClone(donor.rules),
    presentation: structuredClone(donor.presentation),
    legend: structuredClone(donor.legend),
    layers: [{ id: "terrain", rows }],
    objects: [],
  };
  map.objects = placeObjects(map, donor, random);
  return map;
}

export function generatePlatformerMap(
  options: GeneratePlatformerMapOptions,
): GeneratedPlatformerMap {
  const width = PLATFORMER_GENERATED_WIDTHS[options.length];
  if (!width) throw new PlatformerGenerationError(`Unsupported platformer length: ${options.length}.`);
  const effectivePhysics = options.physics ?? CATALOG_PLATFORMER_GAME_PHYSICS;
  const attempts = Math.max(0, Math.min(options.maxAttempts ?? MAX_GENERATION_ATTEMPTS, MAX_GENERATION_ATTEMPTS));
  let lastReason = "no candidates were attempted";

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const map = buildCandidate(options, width, attempt);
      validateObjectSupports(map);
      if (!oneWayPlatformsAreJumpable(map)) {
        lastReason = "one-way platforms exceed the jump envelope";
        continue;
      }
      const protectedReachability = validatePlatformerReachability(
        map,
        CATALOG_PLATFORMER_GAME_PHYSICS,
      );
      if (!protectedReachability.reachable) {
        lastReason = `protected envelope: ${protectedReachability.reason}`;
        continue;
      }
      const effectiveReachability = validatePlatformerReachability(map, effectivePhysics);
      if (!effectiveReachability.reachable) {
        lastReason = `effective physics: ${effectiveReachability.reason}`;
        continue;
      }
      return generatedPlatformerMapSchema.parse(map);
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error);
    }
  }
  throw new PlatformerGenerationError(
    `Platformer generation exhausted ${attempts} attempts for donor ${options.donor.id} (${options.length}): ${lastReason}.`,
  );
}
