import type { CooperSpecChange } from "../../game-objects";
import type { GamePhysicsDocument } from "../../game-physics";
import type { ModelToolDefinition } from "../model-client";
import type { AgentFlowRunStore } from "../run-store";

export type ToolExecutionContext = Readonly<{
  ownerId: string;
  gameId: string;
  /** The kid's own words for this turn, recorded as patch provenance. */
  prompt: string;
  store: AgentFlowRunStore;
  signal?: AbortSignal;
}>;

export type ToolExecutionResult = Readonly<{
  /** Serialized back to the model as the function call's output. */
  output: unknown;
  /** Set only when the call wrote to the game. */
  gameRevision?: number;
  physicsDocument?: GamePhysicsDocument;
  specChange?: CooperSpecChange;
}>;

export type AgentTool = Readonly<{
  id: string;
  definition: ModelToolDefinition;
  execute(args: unknown, context: ToolExecutionContext): Promise<ToolExecutionResult>;
}>;
