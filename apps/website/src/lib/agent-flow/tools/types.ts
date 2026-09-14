import type { CooperSpecChange } from "../../game-objects";
import type { GamePhysicsDocument } from "../../game-physics";
import type { ContentModerator } from "../moderation";
import type { ModelToolDefinition } from "../model-client";
import type { AgentFlowRunStore } from "../run-store";

export type ToolExecutionContext = Readonly<{
  ownerId: string;
  gameId: string;
  /** The kid's own words for this turn, recorded as patch provenance. */
  prompt: string;
  store: AgentFlowRunStore;
  /** For tool text that is persisted and shown outside the chat, such as the game's name. */
  moderator: ContentModerator;
  signal?: AbortSignal;
}>;

export type ToolExecutionResult = Readonly<{
  /** Serialized back to the model as the function call's output. */
  output: unknown;
  /** Set only when the call wrote to the game. */
  gameRevision?: number;
  physicsDocument?: GamePhysicsDocument;
  specChange?: CooperSpecChange;
  /** Set only when the call renamed the game. */
  gameTitle?: string;
}>;

export type AgentTool = Readonly<{
  id: string;
  definition: ModelToolDefinition;
  execute(args: unknown, context: ToolExecutionContext): Promise<ToolExecutionResult>;
}>;
