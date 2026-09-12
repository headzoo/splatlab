"use client";

import { PlatformerGame } from "@/game/platformer/platformer-game";
import type {
  PlatformerMapSpec,
  PlatformerPhysicsSpec,
  WeaponSpec,
} from "@/game/platformer/types";
import { MazeGame } from "@/game/top-down/maze-game";
import type { MazeMapSpec } from "@/game/top-down/types";
import {
  activePlayerAssetId,
  type GameDocument,
} from "@/lib/game-contract";

export type CampaignMap = {
  source: GameDocument["platformerMapSource"];
  label: string;
  map: PlatformerMapSpec;
};

export type MazeMap = {
  source: GameDocument["mazeMapSource"];
  label: string;
  map: MazeMapSpec;
};

export type GamePlayerContentProps = {
  maps: CampaignMap[];
  mazes: MazeMap[];
  physics: PlatformerPhysicsSpec;
  weapon: WeaponSpec;
};

type GamePlayerProps = GamePlayerContentProps & {
  spec: GameDocument;
  onPlatformerComplete?: () => void;
};

export function campaignMapIndex(spec: GameDocument, maps: CampaignMap[]) {
  const index = maps.findIndex(
    (candidate) => candidate.source === spec.platformerMapSource,
  );
  return index < 0 ? 0 : index;
}

export function mazeMapIndex(spec: GameDocument, maps: MazeMap[]) {
  const index = maps.findIndex(
    (candidate) => candidate.source === spec.mazeMapSource,
  );
  return index < 0 ? 0 : index;
}

export function GamePlayer({
  spec,
  maps,
  mazes,
  physics,
  weapon,
  onPlatformerComplete,
}: GamePlayerProps) {
  const current = maps[campaignMapIndex(spec, maps)];
  const currentMaze = mazes[mazeMapIndex(spec, mazes)];
  const playerAssetId = activePlayerAssetId(spec);

  if (!current || !currentMaze) return null;

  return spec.previewKind === "maze" ? (
    <MazeGame
      key={`${currentMaze.map.id}:${currentMaze.map.revision}:${playerAssetId}:${spec.skinTone}:${spec.hairColor}`}
      map={currentMaze.map}
      playerAssetId={playerAssetId}
      skinTone={spec.skinTone}
      hairColor={spec.hairColor}
    />
  ) : (
    <PlatformerGame
      key={`${current.map.id}:${current.map.revision}:${playerAssetId}:${spec.skinTone}:${spec.hairColor}`}
      map={current.map}
      physics={physics}
      weapon={weapon}
      playerAssetId={playerAssetId}
      skinTone={spec.skinTone}
      hairColor={spec.hairColor}
      autoPlay
      onComplete={onPlatformerComplete}
    />
  );
}
