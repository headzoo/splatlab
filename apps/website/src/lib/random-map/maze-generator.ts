import type { MazeMapObject, MazeMapSpec } from "@/game/top-down/types";
import {
  generatedMazeMapSchema,
  type GeneratedMazeMap,
} from "@/lib/generated-map-contract";

import type { RandomSource } from "./random-source";
import { shuffled } from "./random-source";

export type MazeMapLength = "short" | "medium" | "long";

export const MAZE_GENERATED_DIMENSIONS: Readonly<
  Record<MazeMapLength, { width: number; height: number }>
> = {
  short: { width: 21, height: 15 },
  medium: { width: 31, height: 21 },
  long: { width: 41, height: 29 },
};

type Cell = { x: number; y: number };
type Search = {
  distances: Map<string, number>;
  previous: Map<string, string | null>;
};

export type GenerateMazeMapOptions = {
  donor: MazeMapSpec;
  length: MazeMapLength;
  id: string;
  random: RandomSource;
};

export class MazeGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MazeGenerationError";
  }
}

const cellKey = ({ x, y }: Cell) => `${x},${y}`;
const parseCell = (key: string): Cell => {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
};

function carveMaze(width: number, height: number, random: RandomSource) {
  const grid = Array.from({ length: height }, () => Array(width).fill("#"));
  const start = { x: 1, y: 1 };
  const visited = new Set([cellKey(start)]);
  const stack = [start];
  grid[start.y][start.x] = ".";

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const candidates = shuffled([
      { x: current.x + 2, y: current.y },
      { x: current.x - 2, y: current.y },
      { x: current.x, y: current.y + 2 },
      { x: current.x, y: current.y - 2 },
    ], random).filter((cell) => (
      cell.x > 0
      && cell.x < width - 1
      && cell.y > 0
      && cell.y < height - 1
      && !visited.has(cellKey(cell))
    ));

    const next = candidates[0];
    if (!next) {
      stack.pop();
      continue;
    }
    grid[(current.y + next.y) / 2][(current.x + next.x) / 2] = ".";
    grid[next.y][next.x] = ".";
    visited.add(cellKey(next));
    stack.push(next);
  }
  return grid.map((row) => row.join(""));
}

function searchFloor(tiles: readonly string[], start: Cell): Search {
  const startKey = cellKey(start);
  const distances = new Map<string, number>([[startKey, 0]]);
  const previous = new Map<string, string | null>([[startKey, null]]);
  const queue = [start];

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const currentKey = cellKey(current);
    for (const next of [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ]) {
      const nextKey = cellKey(next);
      if (tiles[next.y]?.[next.x] !== "." || distances.has(nextKey)) continue;
      distances.set(nextKey, distances.get(currentKey)! + 1);
      previous.set(nextKey, currentKey);
      queue.push(next);
    }
  }
  return { distances, previous };
}

function pathTo(search: Search, destination: Cell) {
  const path = new Set<string>();
  let key: string | null | undefined = cellKey(destination);
  while (key) {
    path.add(key);
    key = search.previous.get(key);
  }
  return path;
}

function cloneObject(source: MazeMapObject, id: string, cell: Cell): MazeMapObject {
  const clone = structuredClone(source);
  clone.id = id;
  clone.x = cell.x;
  clone.y = cell.y;
  return clone;
}

function requiredArchetype(donor: MazeMapSpec, type: "key" | "exit") {
  const object = donor.objects.find((candidate) => candidate.type === type);
  if (!object) {
    throw new MazeGenerationError(`Maze donor ${donor.id} has no ${type} archetype.`);
  }
  return object;
}

function placeObjects(
  donor: MazeMapSpec,
  tiles: readonly string[],
  length: MazeMapLength,
  random: RandomSource,
) {
  const start = { x: 1, y: 1 };
  const fromStart = searchFloor(tiles, start);
  const floorCells = [...fromStart.distances.keys()].map(parseCell);
  const spawns = donor.objects.filter((object) => object.type === "player_spawn");
  if (spawns.length === 0) {
    throw new MazeGenerationError(`Maze donor ${donor.id} has no player spawn archetype.`);
  }

  const occupied = new Set<string>();
  const objects: MazeMapObject[] = [];
  const nearby = [...floorCells].sort((left, right) => (
    fromStart.distances.get(cellKey(left))! - fromStart.distances.get(cellKey(right))!
  ));
  spawns.forEach((spawn, index) => {
    const cell = nearby.find((candidate) => !occupied.has(cellKey(candidate)));
    if (!cell) throw new MazeGenerationError("Generated maze lacks enough spawn cells.");
    occupied.add(cellKey(cell));
    objects.push(cloneObject(spawn, `spawn_${index + 1}`, cell));
  });

  const exitCell = floorCells.reduce((farthest, cell) => (
    fromStart.distances.get(cellKey(cell))! > fromStart.distances.get(cellKey(farthest))!
      ? cell
      : farthest
  ), start);
  const fromExit = searchFloor(tiles, exitCell);
  const maximumStartDistance = fromStart.distances.get(cellKey(exitCell))!;
  const keyCandidates = floorCells.filter((cell) => (
    !occupied.has(cellKey(cell))
    && cellKey(cell) !== cellKey(exitCell)
    && fromStart.distances.get(cellKey(cell))! >= Math.floor(maximumStartDistance * 0.4)
  ));
  const keyCell = keyCandidates.reduce((best, cell) => {
    const score = fromStart.distances.get(cellKey(cell))!
      + fromExit.distances.get(cellKey(cell))!;
    const bestScore = fromStart.distances.get(cellKey(best))!
      + fromExit.distances.get(cellKey(best))!;
    return score > bestScore ? cell : best;
  }, keyCandidates[0] ?? start);

  const key = cloneObject(requiredArchetype(donor, "key"), "key_1", keyCell);
  const exit = cloneObject(requiredArchetype(donor, "exit"), "exit_1", exitCell);
  key.requires = undefined;
  exit.requires = key.id;
  objects.push(key, exit);
  occupied.add(cellKey(keyCell));
  occupied.add(cellKey(exitCell));

  const fromKey = searchFloor(tiles, keyCell);
  const protectedCells = new Set([
    ...pathTo(fromStart, keyCell),
    ...pathTo(fromKey, exitCell),
    ...floorCells
      .filter((cell) => fromStart.distances.get(cellKey(cell))! <= Math.max(3, spawns.length))
      .map(cellKey),
  ]);
  const available = shuffled(
    floorCells.filter((cell) => (
      !occupied.has(cellKey(cell)) && !protectedCells.has(cellKey(cell))
    )),
    random,
  );

  const scale = length === "short" ? 1 : length === "medium" ? 2 : 3;
  const placements: Array<{ type: "enemy_spawn" | "hazard" | "obstacle"; scale: number }> = [
    { type: "enemy_spawn", scale },
    { type: "hazard", scale },
    { type: "obstacle", scale: 1 },
  ];
  for (const placement of placements) {
    const templates = donor.objects.filter((object) => object.type === placement.type);
    const count = templates.length * placement.scale;
    for (let index = 0; index < count; index += 1) {
      const cell = available.pop();
      if (!cell) break;
      const template = templates[index % templates.length];
      objects.push(cloneObject(template, `${placement.type}_${index + 1}`, cell));
      occupied.add(cellKey(cell));
    }
  }
  return objects;
}

export function generateMazeMap(options: GenerateMazeMapOptions): GeneratedMazeMap {
  const dimensions = MAZE_GENERATED_DIMENSIONS[options.length];
  if (!dimensions) throw new MazeGenerationError(`Unsupported maze length: ${options.length}.`);
  if (
    options.donor.camera.columns > dimensions.width
    || options.donor.camera.rows > dimensions.height
  ) {
    throw new MazeGenerationError(
      `Maze donor ${options.donor.id} camera does not fit a ${options.length} generated map.`,
    );
  }

  const tiles = carveMaze(dimensions.width, dimensions.height, options.random);
  const map: MazeMapSpec = {
    schemaVersion: options.donor.schemaVersion,
    id: options.id,
    revision: 1,
    runtime: options.donor.runtime,
    tileSize: options.donor.tileSize,
    width: dimensions.width,
    height: dimensions.height,
    camera: structuredClone(options.donor.camera),
    legend: structuredClone(options.donor.legend),
    presentation: structuredClone(options.donor.presentation),
    tiles,
    objects: placeObjects(options.donor, tiles, options.length, options.random),
  };
  return generatedMazeMapSchema.parse(map);
}
