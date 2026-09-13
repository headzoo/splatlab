"use client";

import type { CSSProperties, ReactNode } from "react";

import type { PlatformerEditTool } from "@/game/platformer/map-editing";

import styles from "./build.module.css";

type BuildToolsProps = {
  activeTool: PlatformerEditTool;
  backgroundId: string;
  disabled: boolean;
  objectEditCount: number;
  terrainEditCount: number;
  onToolChange: (tool: PlatformerEditTool) => void;
};

type ToolDefinition = {
  value: PlatformerEditTool;
  label: string;
  description: string;
  icon?: ReactNode;
};

const TERRAIN_TOOLS: readonly ToolDefinition[] = [
  { value: "ground", label: "Ground", description: "Add solid ground blocks" },
  { value: "platform", label: "Platform", description: "Add solid platform blocks" },
  { value: "obstacle", label: "Obstacle", description: "Add solid obstacle blocks" },
  { value: "hazard", label: "Hazard", description: "Add dangerous hazard blocks" },
];

const OBJECT_TOOLS: readonly ToolDefinition[] = [
  { value: "spawn", label: "Spawn", description: "Choose where the hero starts", icon: "S" },
  { value: "coin", label: "Coin", description: "Add a collectible coin", icon: "◉" },
  { value: "extra_life", label: "Extra life", description: "Add an extra life", icon: "★" },
  { value: "enemy", label: "Enemy", description: "Add a basic enemy", icon: "E" },
  { value: "boss", label: "Boss", description: "Add a boss", icon: "B" },
  { value: "flying_object", label: "Flying object", description: "Add a flying object", icon: "F" },
  { value: "checkpoint", label: "Checkpoint", description: "Add a checkpoint", icon: "⚑" },
  { value: "goal", label: "Goal", description: "Add a level goal", icon: "⚐" },
];

const TERRAIN_ASSET_PREFIXES: Record<string, string> = {
  neutral_green_hills_01: "neutral_green_hills",
  space_orbital_outpost_01: "space",
  haunted_graveyard_01: "haunted_graveyard",
  dragons_emberkeep_01: "dragons_emberkeep",
};

const TOOL_INSTRUCTIONS: Record<PlatformerEditTool, string> = {
  select: "Click a block to select it.",
  move: "Drag the map to move around your level.",
  erase: "Click or drag across the map to erase blocks.",
  ground: "Click or drag across the map to add ground blocks.",
  platform: "Click or drag across the map to add platform blocks.",
  obstacle: "Click or drag across the map to add obstacle blocks.",
  hazard: "Click or drag across the map to add hazard blocks.",
  spawn: "Click the map to set the hero spawn.",
  coin: "Click the map to add a coin.",
  extra_life: "Click the map to add an extra life.",
  enemy: "Click the map to add an enemy.",
  boss: "Click the map to add a boss.",
  flying_object: "Click the map to add a flying object.",
  checkpoint: "Click the map to add a checkpoint.",
  goal: "Click the map to add a goal.",
};

function terrainSwatchStyle(
  backgroundId: string,
  tool: PlatformerEditTool,
): CSSProperties | undefined {
  if (!TERRAIN_TOOLS.some((candidate) => candidate.value === tool)) return undefined;
  const prefix = TERRAIN_ASSET_PREFIXES[backgroundId] ?? "neutral_green_hills";
  return {
    "--tool-swatch-image": `url(/game-assets/sprites/${prefix}_platformer_${tool}_01.png)`,
  } as CSSProperties;
}

function ToolButton({
  activeTool,
  backgroundId,
  disabled,
  onToolChange,
  tool,
}: BuildToolsProps & { tool: ToolDefinition }) {
  const isTerrain = TERRAIN_TOOLS.some(
    (candidate) => candidate.value === tool.value,
  );
  return (
    <button
      className={styles.mapTool}
      type="button"
      aria-pressed={activeTool === tool.value}
      disabled={disabled}
      title={tool.description}
      onClick={() => onToolChange(tool.value)}
    >
      <span
        className={`${styles.toolSwatch} ${
          isTerrain ? styles.terrainSwatch : styles.objectSwatch
        } ${tool.value === "hazard" ? styles.hazardSwatch : ""}`}
        style={terrainSwatchStyle(backgroundId, tool.value)}
        aria-hidden="true"
      >
        {tool.icon}
      </span>
      <span>{tool.label}</span>
    </button>
  );
}

export function BuildTools(props: BuildToolsProps) {
  const disabledMessage = "Choose Platformer above to add blocks to a map.";

  return (
    <div className={styles.buildTools} aria-label="Map build tools">
      <section
        className={`${styles.buildToolSection} ${styles.terrainToolSection}`}
        aria-labelledby="terrain-tools-title"
      >
        <header>
          <h3 id="terrain-tools-title">Terrain</h3>
          <span>{props.terrainEditCount} changed</span>
        </header>
        <div className={styles.mapToolGrid} role="group" aria-label="Terrain tools">
          {TERRAIN_TOOLS.map((tool) => (
            <ToolButton {...props} tool={tool} key={tool.value} />
          ))}
        </div>
      </section>

      <section
        className={`${styles.buildToolSection} ${styles.objectToolSection}`}
        aria-labelledby="object-tools-title"
      >
        <header>
          <h3 id="object-tools-title">Objects</h3>
          <span>{props.objectEditCount} changed</span>
        </header>
        <div className={styles.mapToolGrid} role="group" aria-label="Object tools">
          {OBJECT_TOOLS.map((tool) => (
            <ToolButton {...props} tool={tool} key={tool.value} />
          ))}
        </div>
      </section>

      <p className={styles.toolInstructions} role="status">
        {props.disabled ? disabledMessage : TOOL_INSTRUCTIONS[props.activeTool]}
      </p>
    </div>
  );
}
