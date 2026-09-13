import { FlowContractError } from "../contract";
import { AGENT_TOOL_IDS, isAgentToolId, type AgentToolId } from "./allowlist";
import { patchGamePhysicsTool, readGamePhysicsTool } from "./game-physics-tools";
import type { AgentTool } from "./types";

const TOOLS: ReadonlyMap<AgentToolId, AgentTool> = new Map([
  [readGamePhysicsTool.id as AgentToolId, readGamePhysicsTool],
  [patchGamePhysicsTool.id as AgentToolId, patchGamePhysicsTool],
]);

export function getAgentTool(id: string): AgentTool {
  const tool = isAgentToolId(id) ? TOOLS.get(id) : undefined;
  if (!tool) throw new FlowContractError(`Unknown agent tool "${id}"`);
  return tool;
}

export { AGENT_TOOL_IDS, isAgentToolId, type AgentToolId };
export type { AgentTool, ToolExecutionContext, ToolExecutionResult } from "./types";
