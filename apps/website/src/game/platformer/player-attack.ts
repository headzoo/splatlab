import type { PlayerAssetId } from "@/lib/game-contract";
import type { WeaponSpec } from "./types";

const ATTACK_FRAME_LABELS = [
  "attack_left_1",
  "attack_left_2",
  "attack_left_3",
  "attack_left_4",
  "attack_right_1",
  "attack_right_2",
  "attack_right_3",
  "attack_right_4",
] as const;

export type PlayerAttackEventSheet = {
  event: "attack";
  imageAssetId: "space_cooper_01_attack" | "space_human_01_attack";
  columns: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  frameLabels: readonly string[];
  anchor: { x: number; y: number };
  fps: number;
  loop: false;
};

function attackEventSheet(
  imageAssetId: PlayerAttackEventSheet["imageAssetId"],
): PlayerAttackEventSheet {
  return {
    event: "attack",
    imageAssetId,
    columns: 4,
    rows: 2,
    frameWidth: 64,
    frameHeight: 64,
    frameLabels: ATTACK_FRAME_LABELS,
    anchor: { x: 32, y: 56 },
    fps: 12,
    loop: false,
  };
}

const PLAYER_ATTACK_ASSET_IDS = {
  neutral_cooper_01: null,
  haunted_cooper_01: null,
  space_cooper_01: "space_cooper_01_attack",
  dragon_cooper_01: null,
  ice_world_cooper_01: null,
  neutral_human_01: null,
  haunted_human_01: null,
  space_human_01: "space_human_01_attack",
  dragon_human_01: null,
  ice_world_human_01: null,
  neutral_ghost_01: null,
  haunted_ghost_01: null,
  space_ghost_01: null,
  dragon_ghost_01: null,
  ice_world_ghost_01: null,
  neutral_robot_01: null,
  haunted_robot_01: null,
  space_robot_01: null,
  ice_world_robot_01: null,
  neutral_girl_01: null,
  haunted_girl_01: null,
  space_girl_01: null,
  dragon_girl_01: null,
  ice_world_girl_01: null,
} as const satisfies Record<
  PlayerAssetId,
  PlayerAttackEventSheet["imageAssetId"] | null
>;

export function playerAttackEventSheet(
  playerAssetId: PlayerAssetId,
): PlayerAttackEventSheet | null {
  const imageAssetId = PLAYER_ATTACK_ASSET_IDS[playerAssetId];
  return imageAssetId ? attackEventSheet(imageAssetId) : null;
}

export function directionalAttackFrameIndexes(
  eventSheet: PlayerAttackEventSheet,
  direction: "left" | "right",
) {
  const prefix = `${eventSheet.event}_${direction}_`;
  return eventSheet.frameLabels.flatMap((label, index) =>
    label.startsWith(prefix) ? [index] : [],
  );
}

export function playerAttackEventVisual(
  playerAssetId: PlayerAssetId,
  direction: "left" | "right",
  elapsedMilliseconds: number,
) {
  const eventSheet = playerAttackEventSheet(playerAssetId);
  if (!eventSheet) return null;
  const frameIndexes = directionalAttackFrameIndexes(eventSheet, direction);
  if (!frameIndexes.length) return null;
  const sequenceFrameIndex = Math.min(
    frameIndexes.length - 1,
    Math.floor(Math.max(0, elapsedMilliseconds) / (1000 / eventSheet.fps)),
  );
  return {
    eventSheet,
    frameIndex: frameIndexes[sequenceFrameIndex],
    sequenceFrameIndex,
  };
}

export function playerWeaponAttackPose(
  weapon: WeaponSpec,
  playerAssetId: PlayerAssetId,
  direction: "left" | "right",
  frame: number,
) {
  const characterVisual = weapon.visual.characters[playerAssetId]
    ?? weapon.visual.characters.space_cooper_01
    ?? Object.values(weapon.visual.characters)[0];
  const poses = characterVisual?.directions[direction];
  if (!poses?.length) return null;
  return poses[Math.min(Math.max(0, frame), poses.length - 1)];
}
