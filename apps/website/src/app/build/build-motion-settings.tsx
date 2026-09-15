"use client";

import type { MotionSpec } from "@/game/motion";
import {
  BODY_MOTION_OPTIONS,
  defaultBobVisual,
  defaultCircleTravel,
  defaultEnemyMotion,
  defaultPeckVisual,
  defaultRammingTravel,
  ENEMY_TRAVEL_OPTIONS,
} from "@/game/platformer/motion-defaults";

import styles from "./build.module.css";

type BuildMotionSettingsProps = {
  motion: MotionSpec | undefined;
  onChange: (motion: MotionSpec) => void;
};

export function BuildMotionSettings({ motion, onChange }: BuildMotionSettingsProps) {
  const current = motion ?? defaultEnemyMotion();
  const travelType = current.travel.type;
  const visualType = current.visual.type;

  const setTravelType = (type: typeof ENEMY_TRAVEL_OPTIONS[number]["value"]) => {
    const base = { ...current, travel: current.travel };
    switch (type) {
      case "stationary":
        onChange({ ...base, travel: { type: "stationary" } });
        return;
      case "behavior":
        onChange({ ...base, travel: { type: "behavior" } });
        return;
      case "ramming":
        onChange({ ...base, travel: defaultRammingTravel() });
        return;
      case "circle":
        onChange({ ...base, travel: defaultCircleTravel() });
        return;
    }
  };

  const setVisualType = (type: typeof BODY_MOTION_OPTIONS[number]["value"]) => {
    const base = { ...current };
    if (type === "none") {
      onChange({ ...base, visual: { type: "none" } });
      return;
    }
    if (type === "bob") {
      onChange({ ...base, visual: defaultBobVisual() });
      return;
    }
    onChange({ ...base, visual: defaultPeckVisual() });
  };

  return (
    <>
      <fieldset className={styles.objectControlGroup}>
        <legend>Travel</legend>
        <select
          className={styles.objectSelect}
          onChange={(event) => setTravelType(event.target.value as typeof ENEMY_TRAVEL_OPTIONS[number]["value"])}
          value={travelType === "viewport_arc" || travelType === "controlled" ? "behavior" : travelType}
        >
          {ENEMY_TRAVEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </fieldset>
      <fieldset className={styles.objectControlGroup}>
        <legend>Body motion</legend>
        <div className={styles.objectSegmentedGrid}>
          {BODY_MOTION_OPTIONS.map((option) => {
            const selected = option.value === visualType;
            return (
              <button
                aria-pressed={selected}
                className={styles.objectOptionButton}
                key={option.value}
                onClick={() => setVisualType(option.value)}
                type="button"
              >
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
    </>
  );
}
