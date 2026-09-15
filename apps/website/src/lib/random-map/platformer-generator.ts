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
export const PLATFORMER_GENERATOR_VERSION = 4;
export const HIGH_CLIMB_TILES = 7;
export const HIGH_SECTION_COUNTS: Readonly<Record<PlatformerMapLength, number>> = {
  short: 1,
  medium: 2,
  long: 3,
};
const MAX_PEAK_RISE = 10;
const APPROACH_COLUMNS = 2;
const MAX_SECTION_WIDTH: Readonly<Record<PlatformerMapLength, number>> = {
  short: 20,
  medium: 22,
  long: 24,
};
const MIN_HAZARD_RANGE_COLUMNS = 4;
const MIN_ARENA_CONNECTOR_COLUMNS = 4;
const MIN_ASCENT_STAIR_SEGMENTS = 3;
const COMPLEX_CLUSTER_COUNTS: Readonly<Record<PlatformerMapLength, number>> = {
  short: 1,
  medium: 2,
  long: 3,
};
const MIN_PLATFORM_TILES_ABOVE_FLOOR = 4;
const MIN_OBSTACLE_TILES_ABOVE_FLOOR = 6;

export type HighSectionSegment = {
  kind: "stair" | "landing";
  run: number;
  height: number;
  gapBefore: boolean;
};

export type HighSectionPlan = {
  peakRise: number;
  ascent: HighSectionSegment[];
  peak: { width: number };
  descent: {
    kind: "walkOff" | "stairs";
    segments: HighSectionSegment[];
    tailGround: number;
  };
};
const COLLECTIBLE_SPACING_COLUMNS = 2;
const ENEMY_COUNTS: Readonly<Record<PlatformerMapLength, number>> = {
  short: 3,
  medium: 5,
  long: 7,
};

const MAX_GENERATION_ATTEMPTS = 48;
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

function segmentColumns(segment: HighSectionSegment) {
  return segment.gapBefore ? segment.run + 1 : segment.run;
}

export function highSectionPlanWidth(plan: HighSectionPlan) {
  const descentColumns = plan.descent.kind === "walkOff"
    ? plan.descent.tailGround
    : plan.descent.segments.reduce((total, segment) => total + segmentColumns(segment), 0)
      + plan.descent.tailGround;
  return APPROACH_COLUMNS
    + plan.ascent.reduce((total, segment) => total + segmentColumns(segment), 0)
    + plan.peak.width
    + descentColumns;
}

function buildSegmentChain(
  random: RandomSource,
  fromHeight: number,
  toHeight: number,
  direction: "up" | "down",
): HighSectionSegment[] {
  const segments: HighSectionSegment[] = [];
  let height = fromHeight;
  const maxRise = PLATFORMER_LEVEL_DESIGN.maximumDirectRiseTiles;

  while (direction === "up" ? height < toHeight : height > toHeight) {
    const remaining = Math.abs(toHeight - height);
    const step = remaining === 1
      ? 1
      : random.pick([2, 2, 2, 1] as const);
    const delta = Math.min(step, remaining);
    height += direction === "up" ? delta : -delta;
    const run = direction === "up"
      ? random.pick([2, 2, 2, 3, 1] as const)
      : random.pick([2, 2, 3, 1] as const);
    const stairSegments = segments.filter((segment) => segment.kind === "stair").length;
    const kind = (
      direction === "up"
      && height < toHeight
      && stairSegments >= 2
      && random.next() < 0.16
    ) ? "landing" as const : "stair" as const;
    segments.push({
      kind,
      run,
      height,
      gapBefore: run === 1 && delta === maxRise,
    });
  }
  return segments;
}

function ascentStairSegments(plan: HighSectionPlan) {
  return plan.ascent.filter((segment) => segment.kind === "stair").length;
}

function trimHighSectionPlan(plan: HighSectionPlan, maxWidth: number): HighSectionPlan {
  const trimmed: HighSectionPlan = structuredClone(plan);
  while (highSectionPlanWidth(trimmed) > maxWidth) {
    const landingIndex = trimmed.ascent.findLastIndex((segment) => segment.kind === "landing");
    if (landingIndex >= 0) {
      trimmed.ascent.splice(landingIndex, 1);
      continue;
    }
    if (trimmed.descent.tailGround > 2) {
      trimmed.descent.tailGround -= 1;
      continue;
    }
    if (trimmed.descent.segments.length > 0) {
      trimmed.descent.segments.pop();
      continue;
    }
    if (trimmed.ascent.length > MIN_ASCENT_STAIR_SEGMENTS) {
      trimmed.ascent.pop();
      continue;
    }
    if (trimmed.peak.width > 4) {
      trimmed.peak.width -= 1;
      continue;
    }
    break;
  }
  while (ascentStairSegments(trimmed) < MIN_ASCENT_STAIR_SEGMENTS) {
    const landingIndex = trimmed.ascent.findIndex((segment) => segment.kind === "landing");
    if (landingIndex >= 0) {
      trimmed.ascent[landingIndex] = { ...trimmed.ascent[landingIndex], kind: "stair" };
      continue;
    }
    break;
  }
  return trimmed;
}

function buildFallbackHighSectionPlan(
  bottom: number,
  isFinalSection: boolean,
): HighSectionPlan {
  const peakRise = Math.min(8, bottom - 1);
  return {
    peakRise,
    ascent: [
      { kind: "stair", run: 2, height: 2, gapBefore: false },
      { kind: "stair", run: 2, height: 4, gapBefore: false },
      { kind: "stair", run: 2, height: 6, gapBefore: false },
    ],
    peak: { width: 4 },
    descent: {
      kind: "walkOff",
      segments: [],
      tailGround: isFinalSection ? 4 : 5,
    },
  };
}

export function buildHighSectionPlan(
  random: RandomSource,
  bottom: number,
  length: PlatformerMapLength,
  options?: { isFinalSection?: boolean; maxPeakRise?: number },
): HighSectionPlan {
  const isFinalSection = options?.isFinalSection ?? false;
  const peakCap = Math.min(
    options?.maxPeakRise ?? MAX_PEAK_RISE,
    isFinalSection ? 8 : MAX_PEAK_RISE,
    bottom - 1,
  );
  const peakRise = random.integer(HIGH_CLIMB_TILES, peakCap);
  const ascent = buildSegmentChain(random, 0, peakRise, "up");
  const useStairDescent = isFinalSection ? false : random.next() >= 0.35;
  const plan = trimHighSectionPlan({
    peakRise,
    ascent,
    peak: { width: random.integer(4, 6) },
    descent: useStairDescent
      ? {
          kind: "stairs",
          segments: buildSegmentChain(random, peakRise, 0, "down"),
          tailGround: random.integer(2, 4),
        }
      : {
          kind: "walkOff",
          segments: [],
          tailGround: random.integer(isFinalSection ? 3 : 4, isFinalSection ? 5 : 6),
        },
  }, MAX_SECTION_WIDTH[length]);
  return plan;
}

function slotBounds(
  width: number,
  length: PlatformerMapLength,
  index: number,
  count: number,
) {
  const arenaStart = width - PLATFORMER_FINAL_ARENA_COLUMNS;
  const playable = arenaStart - PLATFORMER_FLAT_START_COLUMNS;
  const slotStart = PLATFORMER_FLAT_START_COLUMNS + Math.floor(index * playable / count);
  const slotEnd = PLATFORMER_FLAT_START_COLUMNS + Math.floor((index + 1) * playable / count);
  const reserveAfter = index < count - 1
    ? MIN_HAZARD_RANGE_COLUMNS
    : MIN_ARENA_CONNECTOR_COLUMNS;
  return {
    slotStart,
    slotEnd,
    maxSectionWidth: Math.min(
      MAX_SECTION_WIDTH[length],
      Math.max(APPROACH_COLUMNS + 6, slotEnd - slotStart - reserveAfter),
    ),
  };
}

function sectionEndLimit(
  width: number,
  length: PlatformerMapLength,
  index: number,
  count: number,
) {
  const arenaStart = width - PLATFORMER_FINAL_ARENA_COLUMNS;
  const { slotEnd } = slotBounds(width, length, index, count);
  return index < count - 1
    ? slotEnd
    : arenaStart - MIN_ARENA_CONNECTOR_COLUMNS;
}

function highSectionLayout(
  width: number,
  length: PlatformerMapLength,
  plans: HighSectionPlan[],
) {
  const count = plans.length;
  const starts: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const { slotStart, slotEnd, maxSectionWidth } = slotBounds(width, length, index, count);
    const sectionWidth = Math.min(highSectionPlanWidth(plans[index]), maxSectionWidth);
    const sectionLimit = sectionEndLimit(width, length, index, count);
    const minimumStart = slotStart + (index === 0 ? MIN_HAZARD_RANGE_COLUMNS : 0);
    let pitPad = slotEnd - slotStart - sectionWidth >= MIN_HAZARD_RANGE_COLUMNS
      ? Math.min(MIN_HAZARD_RANGE_COLUMNS, slotEnd - slotStart - sectionWidth)
      : 0;
    let start = Math.max(slotStart + pitPad, minimumStart);
    while (start + sectionWidth > sectionLimit && start > minimumStart) {
      start -= 1;
    }
    if (start + sectionWidth <= Math.min(sectionLimit, slotEnd)) {
      starts.push(start);
    }
  }
  return starts;
}

function climbRanges(
  width: number,
  starts: number[],
  sectionWidths: number[],
) {
  const arenaStart = width - PLATFORMER_FINAL_ARENA_COLUMNS;
  const ranges: Array<[number, number]> = [];
  let cursor = PLATFORMER_FLAT_START_COLUMNS;
  for (let index = 0; index < starts.length; index += 1) {
    ranges.push([cursor, starts[index]]);
    cursor = starts[index] + sectionWidths[index];
  }
  ranges.push([cursor, arenaStart]);
  return ranges;
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

function paintPlatformColumn(
  grid: string[][],
  column: number,
  top: number,
  bottom: number,
  symbols: ReturnType<typeof collisionSymbols>,
) {
  clearColumn(grid, column, bottom, symbols.empty);
  grid[top][column] = symbols.platform;
}

function paintHighSectionPlan(
  grid: string[][],
  start: number,
  bottom: number,
  symbols: ReturnType<typeof collisionSymbols>,
  plan: HighSectionPlan,
) {
  const width = grid[0]?.length ?? 0;
  let column = start;
  const paintGround = (count: number) => {
    for (let offset = 0; offset < count && column < width; offset += 1, column += 1) {
      clearColumn(grid, column, bottom, symbols.empty);
      paintGroundColumn(grid, column, bottom, bottom, symbols);
    }
  };
  const paintSegments = (segments: HighSectionSegment[]) => {
    for (const segment of segments) {
      if (segment.gapBefore && column < width) {
        clearColumn(grid, column, bottom, symbols.empty);
        column += 1;
      }
      const top = bottom - segment.height;
      for (let offset = 0; offset < segment.run && column < width; offset += 1, column += 1) {
        if (segment.kind === "stair") {
          paintStairColumn(grid, column, top, bottom, symbols);
        } else {
          paintPlatformColumn(grid, column, top, bottom, symbols);
        }
      }
    }
  };

  paintGround(APPROACH_COLUMNS);
  paintSegments(plan.ascent);
  const peakTop = bottom - plan.peakRise;
  for (let offset = 0; offset < plan.peak.width && column < width; offset += 1, column += 1) {
    paintPlatformColumn(grid, column, peakTop, bottom, symbols);
  }
  if (plan.descent.kind === "stairs") {
    paintSegments(plan.descent.segments);
  }
  paintGround(plan.descent.tailGround);
}

function ensureArenaConnector(
  grid: string[][],
  fromColumn: number,
  arenaStart: number,
  bottom: number,
  symbols: ReturnType<typeof collisionSymbols>,
) {
  for (let column = fromColumn; column < arenaStart; column += 1) {
    clearColumn(grid, column, bottom, symbols.empty);
    paintGroundColumn(grid, column, bottom, bottom, symbols);
  }
}

function rangeUsableEnd(to: number, arenaStart: number) {
  return Math.min(to, arenaStart - MIN_ARENA_CONNECTOR_COLUMNS);
}

function columnIsPlatformable(
  grid: string[][],
  column: number,
  row: number,
  bottom: number,
  symbols: ReturnType<typeof collisionSymbols>,
) {
  if (column < 0 || column >= grid[0].length || row < 0 || row > bottom) return false;
  if (grid[bottom][column] === symbols.hazard) return false;
  return grid[row][column] === symbols.empty;
}

function paintPlatformRun(
  grid: string[][],
  start: number,
  end: number,
  row: number,
  bottom: number,
  symbols: ReturnType<typeof collisionSymbols>,
) {
  for (let column = start; column <= end; column += 1) {
    if (!columnIsPlatformable(grid, column, row, bottom, symbols)) return false;
  }
  for (let column = start; column <= end; column += 1) {
    paintPlatformColumn(grid, column, row, bottom, symbols);
  }
  return true;
}

function paintObstacleCell(
  grid: string[][],
  column: number,
  row: number,
  bottom: number,
  symbols: ReturnType<typeof collisionSymbols>,
) {
  if (!columnIsPlatformable(grid, column, row, bottom, symbols)) return false;
  paintStairColumn(grid, column, row, bottom, symbols);
  return true;
}

function paintLowExtraPlatforms(
  grid: string[][],
  ranges: Array<[number, number]>,
  arenaStart: number,
  bottom: number,
  symbols: ReturnType<typeof collisionSymbols>,
  random: RandomSource,
  lastClimbEnd: number | null,
) {
  const lowRow = bottom - 2;
  const planned: Array<{ start: number; end: number }> = [];
  for (const [from, to] of ranges) {
    const usableTo = rangeUsableEnd(to, arenaStart);
    if (usableTo - from < 8 || random.next() < 0.1) continue;
    const widthTiles = random.integer(3, 5);
    const start = Math.max(from + 1, usableTo - widthTiles - 2);
    const end = start + widthTiles - 1;
    if (end >= usableTo || end - start < 2) continue;
    if (Array.from({ length: end - start + 3 }, (_, offset) => start - 1 + offset)
      .some((column) => grid[bottom][column] === symbols.hazard)) {
      continue;
    }
    planned.push({ start, end });
  }
  if (planned.length === 0) {
    const fallback = ranges
      .map(([from, to]) => ({ from, usableTo: rangeUsableEnd(to, arenaStart) }))
      .filter(({ from, usableTo }) => usableTo - from >= 8)
      .sort((left, right) => (right.usableTo - right.from) - (left.usableTo - left.from))[0];
    if (fallback) {
      const widthTiles = Math.min(5, fallback.usableTo - fallback.from - 3);
      if (widthTiles >= 3) {
        const end = fallback.usableTo - 2;
        planned.push({ start: end - widthTiles + 1, end });
      }
    }
  }
  if (planned.length === 0 && lastClimbEnd !== null) {
    const usableTo = arenaStart - MIN_ARENA_CONNECTOR_COLUMNS;
    const start = lastClimbEnd + 1;
    const widthTiles = Math.min(4, usableTo - start - 1);
    if (widthTiles >= 3) {
      planned.push({ start, end: start + widthTiles - 1 });
    }
  }
  if (planned.length === 0 && ranges[0]) {
    const [from, to] = ranges[0];
    const usableTo = rangeUsableEnd(to, arenaStart);
    if (usableTo - from >= 3) {
      const start = from + 1;
      planned.push({ start, end: Math.min(start + 2, usableTo - 1) });
    }
  }
  if (planned.length === 0) {
    for (const [from, to] of ranges) {
      const usableTo = rangeUsableEnd(to, arenaStart);
      if (usableTo - from < 3) continue;
      const end = usableTo - 1;
      planned.push({ start: Math.max(from + 1, end - 2), end });
      break;
    }
  }
  for (const platform of planned) {
    const stepColumn = platform.start - 1;
    paintObstacleCell(grid, stepColumn, lowRow, bottom, symbols);
    paintPlatformRun(grid, platform.start, platform.end, lowRow, bottom, symbols);
  }
}

function paintComplexPlatformCluster(
  grid: string[][],
  from: number,
  usableTo: number,
  bottom: number,
  symbols: ReturnType<typeof collisionSymbols>,
  random: RandomSource,
) {
  const span = usableTo - from;
  if (span < 12) return false;
  const baseWidth = random.integer(3, 4);
  const start = random.integer(from + 2, usableTo - baseWidth - 4);
  const lowRow = bottom - 3;
  const midRow = bottom - 4;
  const highRow = bottom - 6;
  const useHighTier = random.next() < 0.55;
  const midStart = start + random.integer(0, 1);
  const midWidth = Math.min(baseWidth, random.integer(2, 3));
  const highWidth = random.integer(2, 3);
  const highStart = midStart + random.integer(1, 2);

  if (!paintObstacleCell(grid, start - 1, lowRow, bottom, symbols)) return false;
  if (!paintPlatformRun(grid, start, start + baseWidth - 1, lowRow, bottom, symbols)) return false;
  if (!paintObstacleCell(grid, midStart, midRow, bottom, symbols)) return false;
  if (!paintPlatformRun(grid, midStart, midStart + midWidth - 1, midRow, bottom, symbols)) return false;
  if (useHighTier) {
    if (!paintObstacleCell(grid, highStart, highRow, bottom, symbols)) return false;
    if (!paintPlatformRun(grid, highStart, highStart + highWidth - 1, highRow, bottom, symbols)) {
      return false;
    }
  }
  return true;
}

function pickComplexClusterRanges(
  ranges: Array<[number, number]>,
  length: PlatformerMapLength,
  arenaStart: number,
) {
  const eligible = ranges
    .slice(1)
    .map(([from, to], index) => ({
      from,
      usableTo: rangeUsableEnd(to, arenaStart),
      index: index + 1,
    }))
    .filter(({ from, usableTo }) => usableTo - from >= 14);
  if (eligible.length === 0) return [];
  const chosen: typeof eligible = [];
  const sorted = [...eligible].sort(
    (left, right) => (right.usableTo - right.from) - (left.usableTo - left.from),
  );
  chosen.push(sorted[0]);
  if (length !== "short" && sorted[1]) chosen.push(sorted[1]);
  if (length === "long" && sorted[2] && sorted[2].index !== sorted[0].index) {
    chosen.push(sorted[2]);
  }
  return chosen.slice(0, COMPLEX_CLUSTER_COUNTS[length]);
}

function paintComplexPlatformClusters(
  grid: string[][],
  ranges: Array<[number, number]>,
  length: PlatformerMapLength,
  arenaStart: number,
  bottom: number,
  symbols: ReturnType<typeof collisionSymbols>,
  random: RandomSource,
) {
  for (const { from, usableTo } of pickComplexClusterRanges(ranges, length, arenaStart)) {
    paintComplexPlatformCluster(grid, from, usableTo, bottom, symbols, random);
  }
}

function wideHazardRunCount(
  grid: string[][],
  bottom: number,
  symbols: ReturnType<typeof collisionSymbols>,
) {
  const runs: number[] = [];
  let run = 0;
  for (let column = 0; column < grid[0].length; column += 1) {
    if (grid[bottom][column] === symbols.hazard) run += 1;
    else {
      if (run > 0) runs.push(run);
      run = 0;
    }
  }
  if (run > 0) runs.push(run);
  return runs.filter((width) => width >= 2 && width <= 3).length;
}

function ensureMinimumHazardPits(
  grid: string[][],
  bottom: number,
  symbols: ReturnType<typeof collisionSymbols>,
  length: PlatformerMapLength,
  ranges: Array<[number, number]>,
  arenaStart: number,
) {
  const minimum = length === "long" ? 4 : length === "medium" ? 3 : 1;
  const pitRanges: Array<[number, number]> = ranges.slice(0, -1);
  if (ranges.length > 0) {
    const [from, to] = ranges[ranges.length - 1];
    pitRanges.push([from, rangeUsableEnd(to, arenaStart)]);
  }
  for (const [from, to] of pitRanges) {
    if (wideHazardRunCount(grid, bottom, symbols) >= minimum) return;
    const span = to - from;
    if (span < 4) continue;
    for (let column = from + 1; column + 1 < to - 1; column += 4) {
      if (wideHazardRunCount(grid, bottom, symbols) >= minimum) return;
      if (grid[bottom][column] === symbols.hazard) continue;
      for (let offset = 0; offset < 2; offset += 1) {
        clearColumn(grid, column + offset, bottom, symbols.empty);
        grid[bottom][column + offset] = symbols.hazard;
      }
    }
  }
}

function ensureHazardPits(
  grid: string[][],
  width: number,
  bottom: number,
  symbols: ReturnType<typeof collisionSymbols>,
  random: RandomSource,
  ranges: Array<[number, number]>,
) {
  for (let rangeIndex = 0; rangeIndex < ranges.length; rangeIndex += 1) {
    if (rangeIndex === ranges.length - 1) continue;
    const [from, to] = ranges[rangeIndex];
    const afterClimb = from > PLATFORMER_FLAT_START_COLUMNS;
    const bridgeColumns = afterClimb ? 4 : 0;
    const usableFrom = from + bridgeColumns;
    const usableTo = to - 2;
    const span = usableTo - usableFrom;
    if (span < 4) continue;
    const pitCount = span >= 12 ? 2 : 1;
    for (let index = 0; index < pitCount; index += 1) {
      const pitWidth = span <= 5 ? 2 : random.integer(2, 3);
      const slot = span / pitCount;
      const slotFrom = usableFrom + Math.floor(index * slot);
      const slotTo = usableFrom + Math.floor((index + 1) * slot);
      const minStart = slotFrom;
      const maxStart = slotTo - pitWidth;
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
  forceFallbackClimbs = false,
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

  const sectionCount = HIGH_SECTION_COUNTS[length];
  const maxPeakRise = sectionCount >= 3 ? 8 : MAX_PEAK_RISE;
  const climbPlans = Array.from({ length: sectionCount }, (_, index) => {
    const { slotStart, maxSectionWidth } = slotBounds(width, length, index, sectionCount);
    const minimumStart = slotStart + (index === 0 ? MIN_HAZARD_RANGE_COLUMNS : 0);
    const fitWidth = sectionEndLimit(width, length, index, sectionCount) - minimumStart;
    const plan = forceFallbackClimbs || random.next() < 0.1
      ? buildFallbackHighSectionPlan(bottom, index === sectionCount - 1)
      : buildHighSectionPlan(random, bottom, length, {
          isFinalSection: index === sectionCount - 1,
          maxPeakRise,
        });
    return trimHighSectionPlan(plan, Math.min(maxSectionWidth, fitWidth));
  });
  const climbStarts = highSectionLayout(width, length, climbPlans);
  const paintedPlans = climbStarts.map((start, index) => trimHighSectionPlan(
    climbPlans[index],
    sectionEndLimit(width, length, index, sectionCount) - start,
  ));
  const paintedWidths = paintedPlans.map((plan) => highSectionPlanWidth(plan));
  const ranges = climbRanges(width, climbStarts, paintedWidths);

  const grid = Array.from({ length: rows }, () => Array(width).fill(symbols.empty));
  for (let x = 0; x < width; x += 1) {
    paintGroundColumn(grid, x, surface[x], bottom, symbols);
  }
  ensureHazardPits(grid, width, bottom, symbols, random, ranges);
  ensureMinimumHazardPits(grid, bottom, symbols, length, ranges, arenaStart);
  climbStarts.forEach((start, index) => {
    paintHighSectionPlan(grid, start, bottom, symbols, paintedPlans[index]);
  });
  const lastClimbEnd = climbStarts.length > 0
    ? climbStarts[climbStarts.length - 1] + paintedWidths[climbStarts.length - 1]
    : null;
  if (lastClimbEnd !== null) {
    ensureArenaConnector(grid, lastClimbEnd, arenaStart, bottom, symbols);
  }
  paintLowExtraPlatforms(
    grid,
    ranges,
    arenaStart,
    bottom,
    symbols,
    random,
    lastClimbEnd,
  );
  paintComplexPlatformClusters(grid, ranges, length, arenaStart, bottom, symbols, random);
  return grid.map((row) => row.join(""));
}

function terrainRows(map: PlatformerMapSpec) {
  return map.layers.find((layer) => layer.id === "terrain")?.rows ?? [];
}

function terrainSymbolCount(
  map: PlatformerMapSpec,
  visualSlot: "platform" | "obstacle",
  collision?: "solid" | "one_way",
) {
  const symbol = Object.entries(map.legend).find(([, value]) => (
    value.visualSlot === visualSlot
    && (collision === undefined || value.collision === collision)
  ))?.[0];
  if (!symbol) return 0;
  const floor = map.size.rows - 1;
  let count = 0;
  for (let row = 0; row < floor; row += 1) {
    for (const cell of terrainRows(map)[row] ?? "") {
      if (cell === symbol) count += 1;
    }
  }
  return count;
}

function highClimbRegionCount(map: PlatformerMapSpec) {
  const bottom = map.size.rows - 1;
  const threshold = bottom - HIGH_CLIMB_TILES;
  const arenaStart = map.size.columns - PLATFORMER_FINAL_ARENA_COLUMNS;
  const high: boolean[] = [];
  for (let column = PLATFORMER_FLAT_START_COLUMNS; column < arenaStart; column += 1) {
    let top: number | null = null;
    for (let row = 0; row < map.size.rows; row += 1) {
      const collision = collisionAt(map, column, row);
      if (collision === "solid" || collision === "one_way") {
        top = row;
        break;
      }
    }
    high.push(top !== null && top <= threshold);
  }
  let count = 0;
  for (let index = 0; index < high.length; index += 1) {
    if (high[index] && (index === 0 || !high[index - 1])) count += 1;
  }
  return count;
}

function validateTerrainFeatures(map: PlatformerMapSpec, length: PlatformerMapLength) {
  const platformCount = terrainSymbolCount(map, "platform");
  if (platformCount < MIN_PLATFORM_TILES_ABOVE_FLOOR) {
    return `expected at least ${MIN_PLATFORM_TILES_ABOVE_FLOOR} platform tiles, received ${platformCount}`;
  }
  const obstacleCount = terrainSymbolCount(map, "obstacle", "solid");
  if (obstacleCount < MIN_OBSTACLE_TILES_ABOVE_FLOOR) {
    return `expected at least ${MIN_OBSTACLE_TILES_ABOVE_FLOOR} obstacle tiles, received ${obstacleCount}`;
  }
  const climbs = highClimbRegionCount(map);
  if (climbs < HIGH_SECTION_COUNTS[length]) {
    return `expected ${HIGH_SECTION_COUNTS[length]} high climbs, received ${climbs}`;
  }
  return null;
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
  const forceFallbackClimbs = attempt >= Math.floor(MAX_GENERATION_ATTEMPTS / 2);
  const rows = makeTerrain(donor, width, options.length, random, forceFallbackClimbs);
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

/** @internal Test and debug helper for inspecting failed generation attempts. */
export function buildPlatformerMapCandidate(
  options: GeneratePlatformerMapOptions,
  attempt: number,
) {
  const width = PLATFORMER_GENERATED_WIDTHS[options.length];
  if (!width) throw new PlatformerGenerationError(`Unsupported platformer length: ${options.length}.`);
  return buildCandidate(options, width, attempt);
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
      const terrainIssue = validateTerrainFeatures(map, options.length);
      if (terrainIssue) {
        lastReason = terrainIssue;
        continue;
      }
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
