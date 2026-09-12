import type { EnemyState, PlatformerMapObject } from "./types";

const BOSS_FRAME_ANCHOR_Y = 120;

export type BossHealthBar = {
  x: number;
  y: number;
  width: number;
  height: number;
  lineWidth: number;
  remainingHealth: number;
  maximumHealth: number;
};

export function resolveBossHealthBar(
  enemy: EnemyState,
  object: PlatformerMapObject | undefined,
  tileSize: number,
): BossHealthBar | null {
  if (enemy.role !== "boss" || enemy.defeated) return null;

  const maximumHealth = Math.max(1, object?.hitsToDefeat ?? enemy.hitsRemaining);
  const remainingHealth = Math.max(0, Math.min(maximumHealth, enemy.hitsRemaining));
  const scale = tileSize / 64;
  const frameWidth = 128 * scale;
  const drawY = enemy.y - BOSS_FRAME_ANCHOR_Y * scale;
  const width = Math.max(tileSize * 1.35, frameWidth * 0.78);

  return {
    x: enemy.x - width / 2,
    y: drawY - Math.max(5, tileSize * 0.16),
    width,
    height: Math.max(4, tileSize * 0.12),
    lineWidth: Math.max(1, tileSize * 0.035),
    remainingHealth,
    maximumHealth,
  };
}

export function drawBossHealthBar(
  context: CanvasRenderingContext2D,
  enemy: EnemyState,
  object: PlatformerMapObject | undefined,
  tileSize: number,
) {
  const bar = resolveBossHealthBar(enemy, object, tileSize);
  if (!bar) return false;

  context.save();
  context.fillStyle = "rgb(20 11 34 / 88%)";
  context.strokeStyle = "#fff2a8";
  context.lineWidth = bar.lineWidth;
  context.fillRect(bar.x, bar.y, bar.width, bar.height);
  context.strokeRect(bar.x, bar.y, bar.width, bar.height);
  context.fillStyle = "#f14f67";
  context.fillRect(
    bar.x + bar.lineWidth,
    bar.y + bar.lineWidth,
    Math.max(
      0,
      (bar.width - bar.lineWidth * 2) * bar.remainingHealth / bar.maximumHealth,
    ),
    Math.max(0, bar.height - bar.lineWidth * 2),
  );
  context.fillStyle = "#fff";
  context.font = `800 ${Math.max(8, Math.floor(tileSize * 0.2))}px ui-monospace, monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(
    `${bar.remainingHealth}/${bar.maximumHealth}`,
    enemy.x,
    bar.y - tileSize * 0.11,
  );
  context.restore();
  return true;
}
