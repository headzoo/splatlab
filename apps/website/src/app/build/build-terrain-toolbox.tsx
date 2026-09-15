"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";

import {
  hazardSheetForAssetId,
  levelArtAssetId,
} from "@/game/platformer/art-catalog";
import {
  platformerTerrainKindAt,
  type PlatformerTerrainSettingsChange,
} from "@/game/platformer/map-editing";
import type { PlatformerMapSpec } from "@/game/platformer/types";

import styles from "./build.module.css";

type BuildTerrainToolboxProps = {
  cell: { x: number; y: number };
  map: PlatformerMapSpec;
  animationStartFrame: number;
  onChange: (change: PlatformerTerrainSettingsChange) => void;
  onClose: () => void;
};

function hazardFrameCountForCell(map: PlatformerMapSpec, x: number, y: number) {
  const terrain = map.layers.find((layer) => layer.id === "terrain");
  const overrideAssetId = terrain?.spriteOverrides?.find(
    (override) => override.x === x && override.y === y,
  )?.assetId;
  const sheet = hazardSheetForAssetId(overrideAssetId)
    ?? hazardSheetForAssetId(levelArtAssetId(map.presentation, "hazard"));
  return sheet?.frames ?? 4;
}

export function BuildTerrainToolbox({
  cell,
  map,
  animationStartFrame,
  onChange,
  onClose,
}: BuildTerrainToolboxProps) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const kind = platformerTerrainKindAt(map, cell.x, cell.y);
  const title = kind === "hazard" ? "Hazard" : kind.split("_").map(
    (word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`,
  ).join(" ");
  const maxFrames = hazardFrameCountForCell(map, cell.x, cell.y);
  const frame = Math.min(Math.max(1, animationStartFrame), maxFrames);

  const startDrag = (event: PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!bounds) return;
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const drag = (event: PointerEvent<HTMLElement>) => {
    const active = dragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const panel = event.currentTarget.parentElement;
    const width = panel?.offsetWidth ?? 320;
    const height = panel?.offsetHeight ?? 260;
    setPosition({
      x: Math.max(8, Math.min(window.innerWidth - width - 8, event.clientX - active.offsetX)),
      y: Math.max(8, Math.min(window.innerHeight - height - 8, event.clientY - active.offsetY)),
    });
  };
  const stopDrag = (event: PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const positionStyle = position
    ? ({
        left: position.x,
        top: position.y,
        right: "auto",
        maxHeight: `calc(100svh - ${position.y}px - 8px)`,
      } satisfies CSSProperties)
    : undefined;

  return (
    <section
      className={styles.objectToolbox}
      style={positionStyle}
      role="dialog"
      aria-modal="false"
      aria-labelledby="terrain-toolbox-title"
    >
      <header
        className={styles.objectToolboxHandle}
        onPointerDown={startDrag}
        onPointerMove={drag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <div>
          <span>Terrain settings</span>
          <h3 id="terrain-toolbox-title">{title}</h3>
        </div>
        <button type="button" onClick={onClose} aria-label="Close terrain settings">×</button>
      </header>

      <div className={styles.objectToolboxBody}>
        <dl className={styles.objectSummary}>
          <div><dt>Cell</dt><dd>Column {cell.x + 1}, row {cell.y + 1}</dd></div>
        </dl>
        <div className={styles.objectSettingsFields}>
          <fieldset className={styles.objectControlGroup}>
            <legend>Animation first frame</legend>
            <div className={styles.objectStepperRow}>
              <button
                aria-label="Earlier animation frame"
                className={styles.objectStepperButton}
                disabled={frame <= 1}
                onClick={() => onChange({ animationStartFrame: frame - 1 })}
                type="button"
              >
                −
              </button>
              <span className={styles.objectStepperValue}>{frame} / {maxFrames}</span>
              <button
                aria-label="Later animation frame"
                className={styles.objectStepperButton}
                disabled={frame >= maxFrames}
                onClick={() => onChange({ animationStartFrame: frame + 1 })}
                type="button"
              >
                +
              </button>
            </div>
          </fieldset>
        </div>
      </div>
    </section>
  );
}
