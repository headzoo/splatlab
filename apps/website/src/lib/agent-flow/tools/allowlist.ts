/** Closed allowlist. An authored flow may only reference these tool ids. */
export const AGENT_TOOL_IDS = [
  "read_game_physics",
  "patch_game_physics",
  "read_game_objects",
  "add_game_objects",
  "remove_game_objects",
  "set_starting_lives",
  "set_player_character",
  "set_enemy_appearance",
  "set_level_art",
  "read_game",
  "rename_game",
  "set_game_type",
  "set_player_appearance",
  "add_level",
  "rename_level",
  "remove_level",
  "move_level",
  "set_active_level",
  "reroll_map",
] as const;

export type AgentToolId = (typeof AGENT_TOOL_IDS)[number];

export function isAgentToolId(value: unknown): value is AgentToolId {
  return typeof value === "string" && AGENT_TOOL_IDS.includes(value as AgentToolId);
}
