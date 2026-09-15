import assert from "node:assert/strict";
import test from "node:test";
import { isDeepStrictEqual } from "node:util";

import dragon from "../../../../game/maps/maze_dragon_world_01.json";
import greenHills from "../../../../game/maps/maze_green_hills_01.json";
import graveyard from "../../../../game/maps/maze_graveyard_01.json";
import small from "../../../../game/maps/maze_small_01.json";
import space from "../../../../game/maps/maze_space_01.json";
import type { MazeMapObject, MazeMapSpec } from "@/game/top-down/types";
import { generatedMazeMapSchema } from "@/lib/generated-map-contract";

import {
  generateMazeMap,
  MAZE_GENERATED_DIMENSIONS,
  type MazeMapLength,
} from "./maze-generator";
import { createSeededRandomSource } from "./random-source";

const donors = [small, greenHills, dragon, space, graveyard] as unknown as MazeMapSpec[];
const lengths = ["short", "medium", "long"] as const;

const keyOf = (x: number, y: number) => `${x},${y}`;

function floorSearch(map: MazeMapSpec, start: { x: number; y: number }) {
  const distances = new Map<string, number>([[keyOf(start.x, start.y), 0]]);
  const previous = new Map<string, string | null>([[keyOf(start.x, start.y), null]]);
  const queue = [start];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const currentKey = keyOf(current.x, current.y);
    for (const next of [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ]) {
      const key = keyOf(next.x, next.y);
      if (map.tiles[next.y]?.[next.x] !== "." || distances.has(key)) continue;
      distances.set(key, distances.get(currentKey)! + 1);
      previous.set(key, currentKey);
      queue.push(next);
    }
  }
  return { distances, previous };
}

function path(previous: Map<string, string | null>, destination: MazeMapObject) {
  const result = new Set<string>();
  let key: string | null | undefined = keyOf(destination.x, destination.y);
  while (key) {
    result.add(key);
    key = previous.get(key);
  }
  return result;
}

function mechanics(object: MazeMapObject) {
  const clone = structuredClone(object) as MazeMapObject;
  clone.id = "";
  clone.x = 0;
  clone.y = 0;
  return clone;
}

test("all donors, lengths, and seeds produce strict connected objective maps", () => {
  for (const donor of donors) {
    for (const length of lengths) {
      for (const seed of [0, 1, 2, 7, 19, 41, 99, 255, 1024, 65_535]) {
        const before = structuredClone(donor);
        const map = generateMazeMap({
          donor,
          length,
          id: `generated-${donor.id}-${length}-${seed}`,
          random: createSeededRandomSource(seed),
        });
        const dimensions = MAZE_GENERATED_DIMENSIONS[length];

        assert.equal(generatedMazeMapSchema.safeParse(map).success, true);
        assert.deepEqual(donor, before, "generation must not mutate its donor");
        assert.equal(map.width, dimensions.width);
        assert.equal(map.height, dimensions.height);
        assert.equal(map.tileSize, donor.tileSize);
        assert.deepEqual(map.camera, donor.camera);
        assert.deepEqual(map.legend, donor.legend);
        assert.deepEqual(map.presentation, donor.presentation);
        assert.ok(map.tiles[0].split("").every((tile) => tile === "#"));
        assert.ok(map.tiles.at(-1)!.split("").every((tile) => tile === "#"));
        assert.ok(map.tiles.every((row) => row.length === map.width));
        assert.ok(map.tiles.every((row) => row[0] === "#" && row.at(-1) === "#"));

        const floorCount = map.tiles.reduce(
          (total, row) => total + [...row].filter((tile) => tile === ".").length,
          0,
        );
        const fromStart = floorSearch(map, { x: 1, y: 1 });
        assert.equal(fromStart.distances.size, floorCount, "all floor must be connected");

        const ids = map.objects.map((object) => object.id);
        const cells = map.objects.map((object) => keyOf(object.x, object.y));
        assert.equal(new Set(ids).size, ids.length);
        assert.equal(new Set(cells).size, cells.length);
        assert.ok(map.objects.every((object) => map.tiles[object.y]?.[object.x] === "."));

        const spawns = map.objects.filter((object) => object.type === "player_spawn");
        assert.equal(
          spawns.length,
          donor.objects.filter((object) => object.type === "player_spawn").length,
        );
        const key = map.objects.find((object) => object.type === "key")!;
        const exit = map.objects.find((object) => object.type === "exit")!;
        assert.ok(key);
        assert.ok(exit);
        assert.equal(exit.requires, key.id);
        assert.ok(fromStart.distances.has(keyOf(key.x, key.y)));
        const fromKey = floorSearch(map, key);
        assert.ok(fromKey.distances.has(keyOf(exit.x, exit.y)));

        const protectedPath = new Set([
          ...path(fromStart.previous, key),
          ...path(fromKey.previous, exit),
        ]);
        for (const object of map.objects) {
          if (["enemy_spawn", "hazard", "obstacle"].includes(object.type)) {
            assert.equal(protectedPath.has(keyOf(object.x, object.y)), false, object.id);
            const donorMechanics = donor.objects
              .filter((candidate) => candidate.type === object.type)
              .map(mechanics);
            assert.ok(
              donorMechanics.some((candidate) => isDeepStrictEqual(candidate, mechanics(object))),
              `${object.id} did not preserve a donor archetype`,
            );
          }
        }
      }
    }
  }
});

test("enemy and hazard populations scale by requested length", () => {
  const donor = space as unknown as MazeMapSpec;
  const counts = Object.fromEntries(lengths.map((length) => {
    const map = generateMazeMap({
      donor,
      length,
      id: `scale-${length}`,
      random: createSeededRandomSource(12),
    });
    return [length, {
      enemies: map.objects.filter((object) => object.type === "enemy_spawn").length,
      hazards: map.objects.filter((object) => object.type === "hazard").length,
    }];
  })) as Record<MazeMapLength, { enemies: number; hazards: number }>;
  assert.deepEqual(counts.short, { enemies: 1, hazards: 2 });
  assert.deepEqual(counts.medium, { enemies: 2, hazards: 4 });
  assert.deepEqual(counts.long, { enemies: 3, hazards: 6 });
});

test("injected random sources are reproducible and generate diverse layouts", () => {
  const donor = greenHills as unknown as MazeMapSpec;
  const make = (seed: number | string) => generateMazeMap({
    donor,
    length: "long",
    id: "stable-map-id",
    random: createSeededRandomSource(seed),
  });
  assert.deepEqual(make("repeat"), make("repeat"));
  const layouts = new Set(
    Array.from({ length: 16 }, (_, seed) => make(seed).tiles.join("\n")),
  );
  assert.ok(layouts.size >= 12, `expected diverse layouts, received ${layouts.size}`);
});
