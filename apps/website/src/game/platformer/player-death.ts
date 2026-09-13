import type { PlayerAssetId } from "@/lib/game-contract";

const DEFEATED_FRAME_LABELS = [
  "defeated_left_1",
  "defeated_left_2",
  "defeated_left_3",
  "defeated_left_4",
  "defeated_right_1",
  "defeated_right_2",
  "defeated_right_3",
  "defeated_right_4",
] as const;

export type PlayerDefeatedEventSheet = {
  event: "defeated";
  imageAssetId:
    | "space_cooper_01_defeated"
    | "space_human_01_defeated"
    | "space_ghost_01_defeated"
    | "space_robot_01_defeated";
  columns: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  frameLabels: readonly string[];
  anchor: { x: number; y: number };
  fps: number;
  loop: false;
};

function defeatedEventSheet(
  imageAssetId: PlayerDefeatedEventSheet["imageAssetId"],
): PlayerDefeatedEventSheet {
  return {
    event: "defeated",
    imageAssetId,
    columns: 4,
    rows: 2,
    frameWidth: 64,
    frameHeight: 64,
    frameLabels: DEFEATED_FRAME_LABELS,
    anchor: { x: 32, y: 56 },
    fps: 10,
    loop: false,
  };
}

const PLAYER_DEFEATED_ASSET_IDS = {
  neutral_cooper_01: "space_cooper_01_defeated",
  haunted_cooper_01: "space_cooper_01_defeated",
  space_cooper_01: "space_cooper_01_defeated",
  dragon_cooper_01: "space_cooper_01_defeated",
  neutral_human_01: "space_human_01_defeated",
  haunted_human_01: "space_human_01_defeated",
  space_human_01: "space_human_01_defeated",
  dragon_human_01: "space_human_01_defeated",
  neutral_ghost_01: "space_ghost_01_defeated",
  haunted_ghost_01: "space_ghost_01_defeated",
  space_ghost_01: "space_ghost_01_defeated",
  dragon_ghost_01: "space_ghost_01_defeated",
  neutral_robot_01: "space_robot_01_defeated",
  haunted_robot_01: "space_robot_01_defeated",
  space_robot_01: "space_robot_01_defeated",
  neutral_girl_01: null,
  haunted_girl_01: null,
  space_girl_01: null,
  dragon_girl_01: null,
} as const satisfies Record<
  PlayerAssetId,
  PlayerDefeatedEventSheet["imageAssetId"] | null
>;

export function playerDefeatedEventSheet(
  playerAssetId: PlayerAssetId,
): PlayerDefeatedEventSheet | null {
  const imageAssetId = PLAYER_DEFEATED_ASSET_IDS[playerAssetId];
  return imageAssetId ? defeatedEventSheet(imageAssetId) : null;
}

export function directionalDefeatedFrameIndexes(
  eventSheet: PlayerDefeatedEventSheet,
  direction: "left" | "right",
) {
  const prefix = `${eventSheet.event}_${direction}_`;
  const indexes = eventSheet.frameLabels.flatMap((label, index) =>
    label.startsWith(prefix) ? [index] : [],
  );
  return indexes.length
    ? indexes
    : eventSheet.frameLabels.map((_label, index) => index);
}

export function playerDefeatedEventVisual(
  playerAssetId: PlayerAssetId,
  direction: "left" | "right",
  elapsedMilliseconds: number,
) {
  const eventSheet = playerDefeatedEventSheet(playerAssetId);
  if (!eventSheet) return null;
  const frameIndexes = directionalDefeatedFrameIndexes(eventSheet, direction);
  if (!frameIndexes.length) return null;
  const sequenceFrameIndex = Math.min(
    frameIndexes.length - 1,
    Math.floor(
      Math.max(0, elapsedMilliseconds) / (1000 / eventSheet.fps),
    ),
  );
  return {
    eventSheet,
    frameIndex: frameIndexes[sequenceFrameIndex],
    sequenceFrameIndex,
  };
}
