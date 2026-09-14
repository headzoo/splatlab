import { FlowContractError } from "../contract";
import { AGENT_TOOL_IDS, isAgentToolId, type AgentToolId } from "./allowlist";
import {
  addGameObjectsTool,
  readGameObjectsTool,
  removeGameObjectsTool,
} from "./game-object-tools";
import {
  setEnemyAppearanceTool,
  setLevelArtTool,
  setPlayerCharacterTool,
  setStartingLivesTool,
} from "./game-look-tools";
import { patchGamePhysicsTool, readGamePhysicsTool } from "./game-physics-tools";
import {
  readGameTool,
  renameGameTool,
  setGameTypeTool,
  setPlayerAppearanceTool,
} from "./game-detail-tools";
import {
  addLevelTool,
  moveLevelTool,
  removeLevelTool,
  renameLevelTool,
  setActiveLevelTool,
} from "./game-level-tools";
import type { AgentTool } from "./types";

const TOOLS: ReadonlyMap<AgentToolId, AgentTool> = new Map([
  [readGamePhysicsTool.id as AgentToolId, readGamePhysicsTool],
  [patchGamePhysicsTool.id as AgentToolId, patchGamePhysicsTool],
  [readGameObjectsTool.id as AgentToolId, readGameObjectsTool],
  [addGameObjectsTool.id as AgentToolId, addGameObjectsTool],
  [removeGameObjectsTool.id as AgentToolId, removeGameObjectsTool],
  [setStartingLivesTool.id as AgentToolId, setStartingLivesTool],
  [setPlayerCharacterTool.id as AgentToolId, setPlayerCharacterTool],
  [setEnemyAppearanceTool.id as AgentToolId, setEnemyAppearanceTool],
  [setLevelArtTool.id as AgentToolId, setLevelArtTool],
  [readGameTool.id as AgentToolId, readGameTool],
  [renameGameTool.id as AgentToolId, renameGameTool],
  [setGameTypeTool.id as AgentToolId, setGameTypeTool],
  [setPlayerAppearanceTool.id as AgentToolId, setPlayerAppearanceTool],
  [addLevelTool.id as AgentToolId, addLevelTool],
  [renameLevelTool.id as AgentToolId, renameLevelTool],
  [removeLevelTool.id as AgentToolId, removeLevelTool],
  [moveLevelTool.id as AgentToolId, moveLevelTool],
  [setActiveLevelTool.id as AgentToolId, setActiveLevelTool],
]);

export function getAgentTool(id: string): AgentTool {
  const tool = isAgentToolId(id) ? TOOLS.get(id) : undefined;
  if (!tool) throw new FlowContractError(`Unknown agent tool "${id}"`);
  return tool;
}

export { AGENT_TOOL_IDS, isAgentToolId, type AgentToolId };
export type { AgentTool, ToolExecutionContext, ToolExecutionResult } from "./types";
