"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";

import {
  BOSS_CHARACTERS,
  ENEMY_CHARACTERS,
} from "@/game/platformer/character-catalog";
import {
  platformerObjectKind,
  type PlatformerObjectSettingsChange,
} from "@/game/platformer/map-editing";
import type { PlatformerMapObject } from "@/game/platformer/types";

import styles from "./build.module.css";

type BuildObjectToolboxProps = {
  backgroundId: string;
  object: PlatformerMapObject;
  onChange: (change: PlatformerObjectSettingsChange) => void;
  onClose: () => void;
};

export function BuildObjectToolbox({
  backgroundId,
  object,
  onChange,
  onClose,
}: BuildObjectToolboxProps) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const isEnemy = object.type === "enemy_spawn";
  const kind = platformerObjectKind(object);
  const title = kind.split("_").map(
    (word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`,
  ).join(" ");
  const characterOptions = (object.role === "boss" ? BOSS_CHARACTERS : ENEMY_CHARACTERS)[backgroundId]
    ?? ENEMY_CHARACTERS.neutral_green_hills_01;
  const assetId = object.assetId ?? characterOptions[0]?.value ?? "neutral_ghost_01";
  const behavior = object.behavior ?? "patroller";
  const direction = object.direction ?? "left";
  const emitChange = (change: Partial<PlatformerObjectSettingsChange>) => {
    onChange({ assetId, behavior, direction, ...change });
  };
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
    ? ({ left: position.x, top: position.y, right: "auto" } satisfies CSSProperties)
    : undefined;

  return (
    <section
      className={styles.objectToolbox}
      style={positionStyle}
      role="dialog"
      aria-modal="false"
      aria-labelledby="object-toolbox-title"
    >
      <header
        className={styles.objectToolboxHandle}
        onPointerDown={startDrag}
        onPointerMove={drag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <div>
          <span>Object settings</span>
          <h3 id="object-toolbox-title">{title}</h3>
        </div>
        <button type="button" onClick={onClose} aria-label="Close object settings">×</button>
      </header>

      <div className={styles.objectToolboxBody}>
        <dl className={styles.objectSummary}>
          <div><dt>Object</dt><dd>{object.id}</dd></div>
          <div><dt>Position</dt><dd>Column {Math.floor(object.x) + 1}, row {Math.floor(object.y) + 1}</dd></div>
        </dl>

        {isEnemy ? (
          <div className={styles.objectSettingsFields}>
            <label>
              <span>Character</span>
              <select value={assetId} onChange={(event) => emitChange({ assetId: event.target.value })}>
                {characterOptions.map((option) => (
                  <option value={option.value} key={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Behavior</span>
              <select value={behavior} onChange={(event) => emitChange({ behavior: event.target.value as "patroller" | "chaser" })}>
                <option value="patroller">Patrolling</option>
                <option value="chaser">Chasing</option>
              </select>
            </label>
            <label>
              <span>Starting direction</span>
              <select value={direction} onChange={(event) => emitChange({ direction: event.target.value as "left" | "right" })}>
                <option value="left">Moving left</option>
                <option value="right">Moving right</option>
              </select>
            </label>
          </div>
        ) : (
          <p className={styles.objectSettingsEmpty}>This object has no additional settings.</p>
        )}
      </div>
    </section>
  );
}
