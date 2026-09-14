import {
  describeLevel,
  resolveActivePlatformerLevel,
  type ActivePlatformerLevel,
} from "../../game-objects";
import {
  applyCooperSpecChange,
  toSpecChange,
  type CooperSpecChange,
} from "../../cooper-spec-change";
import type { GameDocument } from "../../game-contract";
import { getGame } from "../../games";
import type { ToolExecutionContext, ToolExecutionResult } from "./types";

type NotFound = { status: "not_found" };
type NotPlatformer = { status: "not_platformer" };
type GameLoaded = { status: "loaded"; spec: GameDocument; title: string };
type Loaded = GameLoaded & { level: ActivePlatformerLevel };

/**
 * For the tools that work on any game, such as renaming it or managing its
 * levels. Tools that read or write level contents want `loadLevel` instead.
 */
export async function loadGame(
  context: ToolExecutionContext,
): Promise<NotFound | GameLoaded> {
  const game = await getGame(context.ownerId, context.gameId);
  if (!game) return { status: "not_found" };
  return { status: "loaded", spec: game.spec, title: game.title };
}

export async function loadLevel(
  context: ToolExecutionContext,
): Promise<NotFound | NotPlatformer | Loaded> {
  const game = await loadGame(context);
  if (game.status !== "loaded") return game;
  const level = resolveActivePlatformerLevel(game.spec);
  if (!level) return { status: "not_platformer" };
  return { ...game, level };
}

export function toolError(reason: string): ToolExecutionResult {
  return { output: { ok: false, reason } };
}

export function loadError(status: "not_found" | "not_platformer"): ToolExecutionResult {
  return toolError(
    status === "not_found"
      ? "This game could not be found."
      : "This game is a maze, and Cooper can only change a platformer this way.",
  );
}

export function readArray<Value>(args: unknown, key: string): Value[] {
  if (!args || typeof args !== "object" || Array.isArray(args)) return [];
  const value = (args as Record<string, unknown>)[key];
  return Array.isArray(value) ? (value as Value[]) : [];
}

export function readString(args: unknown, key: string): string {
  if (!args || typeof args !== "object" || Array.isArray(args)) return "";
  const value = (args as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

/** Left as-is when it is not a number, so the planner reports what arrived. */
export function readValue(args: unknown, key: string): unknown {
  if (!args || typeof args !== "object" || Array.isArray(args)) return undefined;
  return (args as Record<string, unknown>)[key];
}

/** The kind counts as they stand after a write, so Cooper can report totals. */
function countsAfter(spec: GameDocument, change: CooperSpecChange) {
  const level = resolveActivePlatformerLevel(applyCooperSpecChange(spec, change));
  return level ? describeLevel(level).counts : {};
}

export async function persist(
  context: ToolExecutionContext,
  spec: GameDocument,
  change: CooperSpecChange,
  output: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const applied = await context.store.applySpecChange({
    ownerId: context.ownerId,
    gameId: context.gameId,
    change: toSpecChange(change),
  });
  if (applied.status !== "updated") return toolError("This game could not be found.");

  return {
    output: { ok: true, ...output, counts: countsAfter(spec, change) },
    gameRevision: applied.gameRevision,
    specChange: applied.change,
  };
}
