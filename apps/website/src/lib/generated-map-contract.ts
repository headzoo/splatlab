import { z } from "zod";

import type { PlatformerMapSpec } from "@/game/platformer/types";
import type { MazeMapSpec } from "@/game/top-down/types";

export const MAP_STYLES = ["ready_made", "generated"] as const;
export const MAP_LENGTHS = ["short", "medium", "long"] as const;
export const GENERATED_PLATFORMER_SOURCE_PREFIX = "custom-platformer-gen-";
export const GENERATED_MAZE_SOURCE_PREFIX = "custom-maze-gen-";

const id = z.string().trim().min(1).max(100);
const coordinate = z.number().int().min(0);
const terrainSymbol = z.string().min(1).max(1);
const MAX_GENERATED_LEGEND_ENTRIES = 16;
const MAX_GENERATED_ART_BORROWS = 16;
const MAX_GENERATED_HUD_ENTRIES = 16;
const MAX_GENERATED_SPRITE_OVERRIDES = 512;
export const platformerMotionSchema = z.object({
  version: z.literal(1),
  lifecycle: z.object({
    trigger: z.literal("camera_reaches_spawn"),
    repeat: z.enum(["once", "interval"]),
    intervalMs: z.number().int().min(500).max(60_000).optional(),
    count: z.number().int().min(2).max(20).optional(),
  }).strict().optional(),
  travel: z.discriminatedUnion("type", [
    z.object({ type: z.literal("controlled") }).strict(),
    z.object({ type: z.literal("stationary") }).strict(),
    z.object({ type: z.literal("behavior") }).strict(),
    z.object({ type: z.literal("ramming"), chargeDelayMs: z.number().int().min(0).max(10_000), distanceTiles: z.number().min(1).max(64) }).strict(),
    z.object({ type: z.literal("circle"), gridSizeTiles: z.number().int().min(3).max(25).refine((value) => value % 2 === 1), direction: z.enum(["clockwise", "counterclockwise"]), durationMs: z.number().int().min(1000).max(60_000) }).strict(),
    z.object({ type: z.literal("viewport_arc"), entryEdge: z.enum(["left", "right"]), exitEdge: z.enum(["left", "right"]), entryRow: z.number().int().min(0).max(63), exitRow: z.number().int().min(0).max(63), archDirection: z.enum(["up", "down"]), archHeightTiles: z.number().min(0.5).max(12), durationMs: z.number().int().min(500).max(30_000), offscreenPaddingTiles: z.number().int().min(0).max(4) }).strict(),
  ]),
  visual: z.discriminatedUnion("type", [
    z.object({ type: z.literal("none") }).strict(),
    z.object({ type: z.literal("bob"), heightTiles: z.number().min(0.05).max(1), periodMs: z.number().int().min(250).max(10_000) }).strict(),
    z.object({ type: z.literal("peck"), distanceTiles: z.number().min(0.05).max(0.5), periodMs: z.number().int().min(250).max(5_000) }).strict(),
  ]),
}).strict();

const platformerObjectSchema = z.object({
  id,
  type: z.enum(["player_spawn", "collectible", "extra_life", "platform_spring", "checkpoint", "goal", "enemy_spawn", "flying_object"]),
  x: coordinate,
  y: coordinate,
  pointValue: z.number().int().min(0).max(999).optional(),
  role: z.enum(["enemy", "boss"]).optional(),
  viewMusicCue: id.optional(),
  assetId: id.optional(),
  launchSpeedPxPerSecond: z.number().finite().min(800).max(1600).optional(),
  behavior: z.enum(["patroller", "chaser"]).optional(),
  direction: z.enum(["left", "right"]).optional(),
  patrolLeftTiles: z.number().int().min(0).max(64).optional(),
  patrolRightTiles: z.number().int().min(0).max(64).optional(),
  viewLeftTiles: z.number().int().min(0).max(64).optional(),
  viewRightTiles: z.number().int().min(0).max(64).optional(),
  speedPxPerSecond: z.number().int().min(16).max(640).optional(),
  defeatMode: z.enum(["stomp", "weapon", "both"]).optional(),
  hitsToDefeat: z.number().int().min(1).max(99).optional(),
  rangedAttack: z.discriminatedUnion("type", [
    z.object({ type: z.literal("fireball"), projectileAssetId: id, rangeTiles: z.number().min(1).max(64), cooldownMs: z.number().int().min(1).max(60_000), sizeScale: z.number().min(0.1).max(8).optional() }).strict(),
    z.object({ type: z.literal("lobbed_projectile"), projectileAssetId: id, rangeTiles: z.number().min(1).max(64), cooldownMs: z.number().int().min(1).max(60_000), arcHeightTiles: z.number().min(0.5).max(12) }).strict(),
    z.object({ type: z.literal("laser_beam"), rangeTiles: z.number().min(1).max(64), cooldownMs: z.number().int().min(1).max(60_000), chargeMs: z.number().int().min(1).max(60_000), durationMs: z.number().int().min(1).max(60_000) }).strict(),
  ]).optional(),
  motion: platformerMotionSchema.optional(),
}).strict();

export const generatedPlatformerMapSchema = z.object({
  schemaVersion: z.number().int().positive(),
  id,
  revision: z.number().int().nonnegative(),
  runtime: z.literal("platformer_v1"),
  tileSize: z.literal(64),
  size: z.object({ columns: z.number().int().min(1).max(256), rows: z.number().int().min(1).max(64) }).strict(),
  camera: z.object({ columns: z.number().int().min(1).max(64), rows: z.number().int().min(1).max(64) }).strict(),
  physics: z.object({ gravityScale: z.number().finite().min(0).max(10), groundTractionScale: z.number().finite().min(0).max(10).optional() }).strict(),
  rules: z.object({ respawnDelaySeconds: z.number().finite().min(0).max(60), startingLives: z.number().int().min(1).max(99).optional() }).strict(),
  presentation: z.object({
    backgroundId: id,
    artBorrows: z.record(id.max(40), id).optional(),
    victoryEffectId: id.optional(),
    gameOverEffectId: id.optional(),
    hud: z.array(z.object({
      id,
      type: z.enum(["lives", "coins"]),
      column: coordinate,
      row: coordinate,
    }).strict()).max(MAX_GENERATED_HUD_ENTRIES).optional(),
  }).strict(),
  legend: z.record(terrainSymbol, z.object({ visualSlot: z.enum(["empty", "ground", "platform", "obstacle", "hazard"]), collision: z.enum(["none", "solid", "one_way", "hazard"]) }).strict()),
  layers: z.array(z.object({
    id,
    rows: z.array(z.string().max(256)).min(1).max(64),
    spriteOverrides: z.array(z.object({ x: coordinate, y: coordinate, assetId: id.optional(), animationStartFrame: z.number().int().min(0).max(255).optional() }).strict()).max(MAX_GENERATED_SPRITE_OVERRIDES).optional(),
  }).strict()).min(1).max(8),
  objects: z.array(platformerObjectSchema).max(1000),
}).strict().superRefine((map, ctx) => {
  if (map.camera.columns > map.size.columns || map.camera.rows > map.size.rows) {
    ctx.addIssue({ code: "custom", path: ["camera"], message: "Camera dimensions must fit map dimensions." });
  }
  if (Object.keys(map.legend).length > MAX_GENERATED_LEGEND_ENTRIES) {
    ctx.addIssue({ code: "custom", path: ["legend"], message: "Generated maps may contain at most 16 terrain symbols." });
  }
  if (Object.keys(map.presentation.artBorrows ?? {}).length > MAX_GENERATED_ART_BORROWS) {
    ctx.addIssue({ code: "custom", path: ["presentation", "artBorrows"], message: "Generated maps may contain at most 16 art borrows." });
  }
  const hudIds = (map.presentation.hud ?? []).map((entry) => entry.id);
  if (new Set(hudIds).size !== hudIds.length) ctx.addIssue({ code: "custom", path: ["presentation", "hud"], message: "HUD IDs must be unique." });
  for (const [index, entry] of (map.presentation.hud ?? []).entries()) {
    if (entry.column >= map.camera.columns || entry.row >= map.camera.rows) {
      ctx.addIssue({ code: "custom", path: ["presentation", "hud", index], message: "HUD entries must fit the camera." });
    }
  }
  for (const [layerIndex, layer] of map.layers.entries()) {
    if (layer.rows.length !== map.size.rows || layer.rows.some((row) => row.length !== map.size.columns)) {
      ctx.addIssue({ code: "custom", path: ["layers", layerIndex, "rows"], message: "Layer rows must exactly match map dimensions." });
    }
    for (const [rowIndex, row] of layer.rows.entries()) {
      for (const symbol of row) {
        if (!Object.hasOwn(map.legend, symbol)) ctx.addIssue({ code: "custom", path: ["layers", layerIndex, "rows", rowIndex], message: "Terrain symbols must exist in the legend." });
      }
    }
    for (const [overrideIndex, override] of (layer.spriteOverrides ?? []).entries()) {
      if (override.x >= map.size.columns || override.y >= map.size.rows) {
        ctx.addIssue({ code: "custom", path: ["layers", layerIndex, "spriteOverrides", overrideIndex], message: "Sprite overrides must be inside map bounds." });
      }
    }
  }
  const layerIds = map.layers.map((layer) => layer.id);
  if (new Set(layerIds).size !== layerIds.length) ctx.addIssue({ code: "custom", path: ["layers"], message: "Layer IDs must be unique." });
  const ids = map.objects.map((object) => object.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["objects"], message: "Object IDs must be unique." });
  if (map.objects.filter((object) => object.type === "player_spawn").length !== 1) ctx.addIssue({ code: "custom", path: ["objects"], message: "A generated platformer needs exactly one player spawn." });
  const bosses = map.objects.filter((object) => object.type === "enemy_spawn" && object.role === "boss");
  const goals = map.objects.filter((object) => object.type === "goal");
  if (bosses.length > 1) ctx.addIssue({ code: "custom", path: ["objects"], message: "A generated platformer may contain at most one boss." });
  if (goals.length === 0 && bosses.length === 0) ctx.addIssue({ code: "custom", path: ["objects"], message: "A generated platformer needs a goal or boss objective." });
  for (const [index, object] of map.objects.entries()) {
    if (object.x >= map.size.columns || object.y >= map.size.rows) {
      ctx.addIssue({ code: "custom", path: ["objects", index], message: "Objects must be inside map bounds." });
    }
    if (object.type === "player_spawn" && (object.speedPxPerSecond === undefined || object.motion?.travel.type !== "controlled")) {
      ctx.addIssue({ code: "custom", path: ["objects", index], message: "Player spawns require a speed and controlled motion." });
    }
    if (object.type === "collectible" && object.pointValue === undefined) {
      ctx.addIssue({ code: "custom", path: ["objects", index], message: "Collectibles require a point value." });
    }
    if (object.type === "platform_spring" && object.launchSpeedPxPerSecond === undefined) {
      ctx.addIssue({ code: "custom", path: ["objects", index], message: "Platform springs require a launch speed." });
    }
    if (object.type === "enemy_spawn" && (
      object.role === undefined || object.assetId === undefined || object.behavior === undefined
      || object.direction === undefined || object.speedPxPerSecond === undefined
      || object.defeatMode === undefined || object.pointValue === undefined
    )) ctx.addIssue({ code: "custom", path: ["objects", index], message: "Enemy spawns require runtime behavior, asset, direction, speed, score, and defeat fields." });
    if (object.type === "enemy_spawn" && object.role === "boss" && object.hitsToDefeat === undefined) {
      ctx.addIssue({ code: "custom", path: ["objects", index], message: "Bosses require a defeat hit count." });
    }
    if (object.type === "flying_object" && (object.assetId === undefined || object.motion?.travel.type !== "viewport_arc")) {
      ctx.addIssue({ code: "custom", path: ["objects", index], message: "Flying objects require an asset and viewport-arc motion." });
    }
    if (object.motion?.travel.type === "viewport_arc") {
      if (object.motion.travel.entryEdge === object.motion.travel.exitEdge) ctx.addIssue({ code: "custom", path: ["objects", index, "motion", "travel"], message: "Viewport arc edges must be opposite." });
      if (object.motion.travel.entryRow >= map.camera.rows || object.motion.travel.exitRow >= map.camera.rows) ctx.addIssue({ code: "custom", path: ["objects", index, "motion", "travel"], message: "Viewport arc rows must fit the camera." });
    }
    if (object.motion?.travel.type === "circle") {
      const radius = (object.motion.travel.gridSizeTiles - 1) / 2;
      if (object.x < radius || object.y < radius || object.x + radius >= map.size.columns || object.y + radius >= map.size.rows) ctx.addIssue({ code: "custom", path: ["objects", index, "motion", "travel"], message: "Circle travel must fit the map." });
    }
  }
});

const mazeObjectSchema = z.object({
  id,
  type: z.enum(["player_spawn", "key", "exit", "enemy_spawn", "hazard", "obstacle"]),
  x: coordinate,
  y: coordinate,
  slot: z.number().int().min(0).max(99).optional(),
  requires: id.optional(),
  assetId: id.optional(),
  direction: z.enum(["down", "left", "right", "up"]).optional(),
  speed: z.number().int().min(20).max(480).optional(),
  behavior: z.enum(["chaser", "wanderer"]).optional(),
  detectionRadius: z.number().finite().min(0).max(10_000).optional(),
  wanderRadiusTiles: z.number().finite().min(0).max(128).optional(),
  contactDamage: z.number().int().min(0).max(999).optional(),
  target: z.literal("nearest_player").optional(),
  effect: z.literal("damage").optional(),
  damage: z.number().int().min(0).max(999).optional(),
  animationStartFrame: z.number().int().min(0).optional(),
  collision: z.literal("solid").optional(),
  motion: platformerMotionSchema.optional(),
}).strict();

export const generatedMazeMapSchema = z.object({
  schemaVersion: z.number().int().positive(),
  id,
  revision: z.number().int().nonnegative(),
  runtime: z.literal("top_down_v1"),
  tileSize: z.literal(64),
  width: z.number().int().min(1).max(128),
  height: z.number().int().min(1).max(128),
  camera: z.object({ columns: z.number().int().min(1).max(64), rows: z.number().int().min(1).max(64) }).strict(),
  legend: z.object({ "#": z.literal("solid_wall"), ".": z.literal("floor") }).strict(),
  presentation: z.object({ mazeThemeId: id, victoryEffectId: id.nullable().optional() }).strict(),
  tiles: z.array(z.string().max(128)).min(1).max(128),
  objects: z.array(mazeObjectSchema).max(1000),
}).strict().superRefine((map, ctx) => {
  if (map.camera.columns > map.width || map.camera.rows > map.height) ctx.addIssue({ code: "custom", path: ["camera"], message: "Camera dimensions must fit map dimensions." });
  if (map.tiles.length !== map.height || map.tiles.some((row) => row.length !== map.width || [...row].some((symbol) => !Object.hasOwn(map.legend, symbol)))) ctx.addIssue({ code: "custom", path: ["tiles"], message: "Maze tiles must exactly match dimensions and legend." });
  const ids = map.objects.map((object) => object.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["objects"], message: "Object IDs must be unique." });
  const spawns = map.objects.filter((object) => object.type === "player_spawn");
  const keys = map.objects.filter((object) => object.type === "key");
  const exits = map.objects.filter((object) => object.type === "exit");
  if (spawns.length < 1) ctx.addIssue({ code: "custom", path: ["objects"], message: "A generated maze needs at least one player spawn." });
  if (keys.length !== 1 || exits.length !== 1 || exits[0]?.requires !== keys[0]?.id) ctx.addIssue({ code: "custom", path: ["objects"], message: "A generated maze needs one key and one exit that requires that key." });
  const slots = spawns.map((spawn) => spawn.slot);
  if (slots.some((slot) => slot === undefined) || new Set(slots).size !== slots.length) ctx.addIssue({ code: "custom", path: ["objects"], message: "Player spawns require unique slots." });
  const occupiedCells = map.objects.map((object) => `${object.x},${object.y}`);
  if (new Set(occupiedCells).size !== occupiedCells.length) ctx.addIssue({ code: "custom", path: ["objects"], message: "Maze objects must occupy unique cells." });
  for (const [index, object] of map.objects.entries()) {
    if (object.x >= map.width || object.y >= map.height) {
      ctx.addIssue({ code: "custom", path: ["objects", index], message: "Objects must be inside map bounds." });
      continue;
    }
    if (map.tiles[object.y]?.[object.x] !== ".") ctx.addIssue({ code: "custom", path: ["objects", index], message: "Maze objects must be on floor cells." });
    if (object.type === "player_spawn" && object.speed === undefined) ctx.addIssue({ code: "custom", path: ["objects", index], message: "Player spawns require a speed." });
    if (object.type === "enemy_spawn" && (
      object.assetId === undefined || object.behavior === undefined || object.direction === undefined
      || object.speed === undefined || object.contactDamage === undefined || object.target === undefined
    )) ctx.addIssue({ code: "custom", path: ["objects", index], message: "Enemy spawns require runtime behavior, asset, direction, speed, damage, and target fields." });
    if (object.type === "hazard" && (object.effect !== "damage" || object.damage === undefined)) ctx.addIssue({ code: "custom", path: ["objects", index], message: "Hazards require a damage effect and amount." });
    if (object.type === "obstacle" && object.collision !== "solid") ctx.addIssue({ code: "custom", path: ["objects", index], message: "Obstacles require solid collision." });
  }
});

export type GeneratedPlatformerMap = z.infer<typeof generatedPlatformerMapSchema> & PlatformerMapSpec;
export type GeneratedMazeMap = z.infer<typeof generatedMazeMapSchema> & MazeMapSpec;
