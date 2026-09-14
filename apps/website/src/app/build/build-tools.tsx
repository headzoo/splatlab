"use client";

import type { CSSProperties } from "react";

import {
  ART_WORLDS,
  levelArtAssetId,
  worldArtAssetId,
} from "@/game/platformer/art-catalog";
import {
  togglePlatformerPaletteTool,
  type PlatformerEditTool,
} from "@/game/platformer/map-editing";
import {
  platformerObjectSpriteFrame,
  type PlatformerArtPresentation,
} from "@/game/platformer/object-sprites";
import type { ArtWorldId, PlatformerObjectKind } from "@/lib/game-contract";

import styles from "./build.module.css";

type BuildToolsProps = {
  activeTool: PlatformerEditTool;
  /** The composed level's presentation, so borrowed art reaches the buttons. */
  presentation: PlatformerArtPresentation;
  disabled: boolean;
  disabledMessage?: string;
  /** The world the terrain and object buttons paint from. */
  objectArtWorld: ArtWorldId;
  playerAssetId: string;
  terrainArtWorld: ArtWorldId;
  onObjectArtWorldChange: (world: ArtWorldId) => void;
  onTerrainArtWorldChange: (world: ArtWorldId) => void;
  onToolChange: (tool: PlatformerEditTool) => void;
};

type ToolDefinition = {
  value: PlatformerEditTool;
  label: string;
  description: string;
};

const TERRAIN_TOOLS: readonly TerrainToolDefinition[] = [
  { value: "ground", label: "Ground", description: "Add solid ground blocks" },
  { value: "platform", label: "Platform", description: "Add solid platform blocks" },
  { value: "obstacle", label: "Obstacle", description: "Add solid obstacle blocks" },
  { value: "hazard", label: "Hazard", description: "Add dangerous hazard blocks" },
];

type ObjectToolDefinition = ToolDefinition & { value: PlatformerObjectKind };

const OBJECT_TOOLS: readonly ObjectToolDefinition[] = [
  { value: "spawn", label: "Spawn", description: "Choose where the hero starts" },
  { value: "coin", label: "Coin", description: "Add a collectible coin" },
  { value: "extra_life", label: "Extra life", description: "Add an extra life" },
  { value: "platform_spring", label: "Platform spring", description: "Launch the hero high while preserving their direction" },
  { value: "enemy", label: "Enemy", description: "Add a basic enemy" },
  { value: "boss", label: "Boss", description: "Add a boss" },
  { value: "flying_object", label: "Flying object", description: "Add a flying object" },
  { value: "checkpoint", label: "Checkpoint", description: "Add a checkpoint" },
  { value: "goal", label: "Goal", description: "Add a level goal" },
];

const TOOL_INSTRUCTIONS: Record<PlatformerEditTool, string> = {
  select: "Click items to add them. Click again to unselect. Drag to move. Click empty space to clear.",
  move: "Drag the map to move around your level.",
  erase: "Click or drag across the map to erase blocks.",
  ground: "Click or drag across the map to add ground blocks.",
  platform: "Click or drag across the map to add platform blocks.",
  obstacle: "Click or drag across the map to add obstacle blocks.",
  hazard: "Click or drag across the map to add hazard blocks.",
  spawn: "Click or drag across the map to set the hero spawn.",
  coin: "Click or drag across the map to add coins.",
  extra_life: "Click or drag across the map to add extra lives.",
  platform_spring: "Click or drag across the map to add springs that launch the hero in their incoming direction.",
  enemy: "Click or drag across the map to add enemies.",
  boss: "Click or drag across the map to add bosses.",
  flying_object: "Click or drag across the map to add flying objects.",
  checkpoint: "Click or drag across the map to add checkpoints.",
  goal: "Click or drag across the map to add goals.",
};

type TerrainToolDefinition = ToolDefinition & {
  value: "ground" | "platform" | "obstacle" | "hazard";
};

/**
 * Painting from the level's own world means "whatever this level wears", which
 * keeps Cooper's level-wide borrows showing on the buttons. Any other world is
 * a deliberate pick and overrides them.
 */
function paintWorld(
  presentation: PlatformerArtPresentation,
  world: ArtWorldId,
): ArtWorldId | undefined {
  return world === presentation.backgroundId ? undefined : world;
}

function terrainSwatchStyle(
  presentation: PlatformerArtPresentation,
  tool: TerrainToolDefinition["value"],
  world: ArtWorldId,
): CSSProperties {
  const chosen = paintWorld(presentation, world);
  const assetId = chosen
    ? worldArtAssetId(chosen, tool)
    : levelArtAssetId(presentation, tool);
  return {
    "--tool-swatch-image": `url(/game-assets/sprites/${assetId}.png)`,
  } as CSSProperties;
}

/**
 * Points the swatch at the sprite this object would be placed with, plus the
 * sheet geometry the stylesheet needs to crop out its first frame.
 */
function objectSwatchStyle(
  presentation: PlatformerArtPresentation,
  playerAssetId: string,
  tool: PlatformerObjectKind,
  world: ArtWorldId,
): CSSProperties {
  const frame = platformerObjectSpriteFrame(
    presentation,
    tool,
    playerAssetId,
    paintWorld(presentation, world),
  );
  return {
    "--tool-swatch-image": `url(/game-assets/sprites/${frame.assetId}.png)`,
    "--tool-swatch-columns": `${frame.columns}`,
    "--tool-swatch-rows": `${frame.rows}`,
    "--tool-swatch-frame-width": `${frame.frameWidth}`,
    "--tool-swatch-frame-height": `${frame.frameHeight}`,
  } as CSSProperties;
}

type ToolButtonProps = {
  activeTool: PlatformerEditTool;
  disabled: boolean;
  swatchClassName: string;
  swatchStyle: CSSProperties;
  tool: ToolDefinition;
  onToolChange: (tool: PlatformerEditTool) => void;
};

function ToolButton({
  activeTool,
  disabled,
  swatchClassName,
  swatchStyle,
  tool,
  onToolChange,
}: ToolButtonProps) {
  return (
    <button
      className={styles.mapTool}
      type="button"
      aria-pressed={activeTool === tool.value}
      disabled={disabled}
      title={tool.description}
      onClick={(event) => {
        event.stopPropagation();
        onToolChange(togglePlatformerPaletteTool(activeTool, tool.value));
      }}
    >
      <span
        className={`${styles.toolSwatch} ${swatchClassName}`}
        style={swatchStyle}
        aria-hidden="true"
      />
      <span>{tool.label}</span>
    </button>
  );
}

type ArtWorldSelectProps = {
  disabled: boolean;
  label: string;
  value: ArtWorldId;
  onChange: (world: ArtWorldId) => void;
};

/**
 * Picks the world the buttons in this section paint from, so a kid on Green
 * Hills can drop Graveyard spikes and chests into it.
 */
function ArtWorldSelect({ disabled, label, value, onChange }: ArtWorldSelectProps) {
  return (
    <select
      className={styles.toolWorldSelect}
      aria-label={label}
      title={label}
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value as ArtWorldId)}
    >
      {ART_WORLDS.map((world) => (
        <option key={world.id} value={world.id}>{world.name}</option>
      ))}
    </select>
  );
}

export function BuildTools(props: BuildToolsProps) {
  const disabledMessage =
    props.disabledMessage ?? "Choose Platformer above to add blocks to a map.";

  return (
    <div className={styles.buildTools} aria-label="Map build tools">
      <section
        className={`${styles.buildToolSection} ${styles.terrainToolSection}`}
        aria-labelledby="terrain-tools-title"
      >
        <header>
          <h3 id="terrain-tools-title">Terrain</h3>
          <ArtWorldSelect
            disabled={props.disabled}
            label="Terrain sprites"
            value={props.terrainArtWorld}
            onChange={props.onTerrainArtWorldChange}
          />
        </header>
        <div className={styles.mapToolGrid} role="group" aria-label="Terrain tools">
          {TERRAIN_TOOLS.map((tool) => (
            <ToolButton
              activeTool={props.activeTool}
              disabled={props.disabled}
              key={tool.value}
              swatchClassName={`${styles.terrainSwatch} ${
                tool.value === "hazard" ? styles.hazardSwatch : ""
              }`}
              swatchStyle={terrainSwatchStyle(
                props.presentation,
                tool.value,
                props.terrainArtWorld,
              )}
              tool={tool}
              onToolChange={props.onToolChange}
            />
          ))}
        </div>
      </section>

      <section
        className={`${styles.buildToolSection} ${styles.objectToolSection}`}
        aria-labelledby="object-tools-title"
      >
        <header>
          <h3 id="object-tools-title">Objects</h3>
          <ArtWorldSelect
            disabled={props.disabled}
            label="Object sprites"
            value={props.objectArtWorld}
            onChange={props.onObjectArtWorldChange}
          />
        </header>
        <div className={styles.mapToolGrid} role="group" aria-label="Object tools">
          {OBJECT_TOOLS.map((tool) => (
            <ToolButton
              activeTool={props.activeTool}
              disabled={props.disabled}
              key={tool.value}
              swatchClassName={styles.objectSwatch}
              swatchStyle={objectSwatchStyle(
                props.presentation,
                props.playerAssetId,
                tool.value,
                props.objectArtWorld,
              )}
              tool={tool}
              onToolChange={props.onToolChange}
            />
          ))}
        </div>
      </section>

      <p className={styles.toolInstructions} role="status">
        {props.disabled ? disabledMessage : TOOL_INSTRUCTIONS[props.activeTool]}
      </p>
    </div>
  );
}
