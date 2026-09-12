"use client";

import type {
  GamePreviewKind,
  GameTheme,
  PlayerCharacter,
} from "@/lib/game-contract";

import { useBuildSetup } from "./build-setup";
import styles from "./build.module.css";

const gameTypeLabels: Record<GamePreviewKind, string> = {
  platformer: "Platformer",
  maze: "Maze",
};

const themeChoices = [
  { value: "green_hills", label: "Green Hills", icon: "🌄" },
  { value: "graveyard", label: "Graveyard", icon: "🪦" },
  { value: "space", label: "Space", icon: "🪐" },
  { value: "dragon_world", label: "Dragon World", icon: "🐉" },
] as const satisfies ReadonlyArray<{
  value: GameTheme;
  label: string;
  icon: string;
}>;

const characterLabels: Record<PlayerCharacter, string> = {
  cooper: "Cooper",
  human: "Human",
  ghost: "Ghost",
  robot: "Robot",
};

const gameObjects = [
  { label: "Platforms", icon: "🟫" },
  { label: "Coins", icon: "🪙" },
  { label: "Enemies", icon: "🟢" },
  { label: "Boxes", icon: "📦" },
  { label: "Spikes", icon: "▲▲" },
  { label: "Power-ups", icon: "⭐" },
] as const;

export function BuildInspector() {
  const { selections } = useBuildSetup();
  const selectedTheme = themeChoices.find(
    (theme) => theme.value === selections.theme,
  );

  return (
    <div className={styles.inspectorGrid} aria-label="Current game settings">
      <section className={styles.settingsCard} aria-labelledby="settings-title">
        <header>
          <h3 id="settings-title">🎮 Game Settings</h3>
          <span>Live</span>
        </header>
        <dl>
          <div>
            <dt>Type</dt>
            <dd>
              {selections.gameType
                ? gameTypeLabels[selections.gameType]
                : "Choose a type"}
            </dd>
          </div>
          <div>
            <dt>Theme</dt>
            <dd>{selectedTheme?.label ?? "Choose a theme"}</dd>
          </div>
          <div>
            <dt>Hero</dt>
            <dd>
              {selections.character === "human" && selections.humanGender
                ? `Human · ${selections.humanGender === "boy" ? "Boy" : "Girl"}`
                : selections.character
                  ? characterLabels[selections.character]
                  : "Choose a hero"}
            </dd>
          </div>
        </dl>
      </section>

      <section className={styles.worldCard} aria-labelledby="world-title">
        <header>
          <h3 id="world-title">🌳 Level &amp; World</h3>
        </header>
        <div className={styles.worldName}>
          <span className={styles.worldThumb}>
            {selectedTheme?.icon ?? "◇"}
          </span>
          <strong>{selectedTheme?.label ?? "Choose a theme"}</strong>
          <button type="button" disabled>
            Change
          </button>
        </div>
        <div className={styles.worldChoices} aria-label="Available themes">
          {themeChoices.map((theme) => (
            <span
              className={theme.value === selections.theme ? styles.activeWorld : ""}
              title={theme.label}
              key={theme.value}
            >
              {theme.icon}
            </span>
          ))}
        </div>
      </section>

      <section className={styles.objectsCard} aria-labelledby="objects-title">
        <header>
          <h3 id="objects-title">◆ Game Objects</h3>
        </header>
        <div className={styles.objectGrid}>
          {gameObjects.map((object) => (
            <span key={object.label}>
              <b aria-hidden="true">{object.icon}</b>
              {object.label}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
