"use client";

import { useMemo, type ReactNode } from "react";

import {
  applyPlatformerObjectEdits,
  applyPlatformerRules,
  applyPlatformerTerrainEdits,
  type PlatformerEditTool,
  type PlatformerObjectPlacement,
  type PlatformerTerrainStrokeCell,
} from "@/game/platformer/map-editing";
import { PlatformerGame } from "@/game/platformer/platformer-game";
import type {
  PlatformerMapSpec,
  PlatformerPhysicsSpec,
  WeaponSpec,
} from "@/game/platformer/types";
import { MazeGame } from "@/game/top-down/maze-game";
import type { MazeMapSpec } from "@/game/top-down/types";
import type { GameThumbnailCapture } from "./canvas-screenshot";
import {
  activePlayerAssetId,
  type GameDocument,
} from "@/lib/game-contract";
import { effectivePlatformerGamePhysics } from "@/lib/game-physics";
import { gameCampaignMaps, gameMazeMaps } from "./game-levels";

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
  controlRowLeading?: ReactNode;
  hidePlatformerEditorLabels?: boolean;
  onThumbnailCaptureReady?: (capture: GameThumbnailCapture | null) => void;
  onUpdateThumbnail?: () => Promise<void>;
  platformerEditor?: {
    tool: PlatformerEditTool;
    onToolChange: (tool: PlatformerEditTool) => void;
    onTerrainStroke: (stroke: readonly PlatformerTerrainStrokeCell[]) => void;
    onObjectPlace: (placement: PlatformerObjectPlacement) => void;
    selectedObjectId: string | null;
    onObjectSelect: (objectId: string | null) => void;
  };
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
  controlRowLeading,
  hidePlatformerEditorLabels,
  onThumbnailCaptureReady,
  onUpdateThumbnail,
  platformerEditor,
}: GamePlayerProps) {
  const campaignMaps = useMemo(() => gameCampaignMaps(spec, maps), [maps, spec]);
  const availableMazes = useMemo(() => gameMazeMaps(spec, mazes), [mazes, spec]);
  const current = campaignMaps[campaignMapIndex(spec, campaignMaps)];
  const currentMaze = availableMazes[mazeMapIndex(spec, availableMazes)];
  const playerAssetId = activePlayerAssetId(spec);
  // Cooper's saved physics fork wins over the read-only catalog document.
  const activePhysics = effectivePlatformerGamePhysics(spec.physicsDocument, physics);
  const platformerMap = useMemo(
    () =>
      current
        ? applyPlatformerRules(
            applyPlatformerObjectEdits(
              applyPlatformerTerrainEdits(
                current.map,
                current.source,
                spec.platformerTerrainEdits,
              ),
              current.source,
              spec.platformerObjectEdits,
              spec.platformerObjectRemovals,
              spec.platformerObjectSettings,
            ),
            spec.startingLives,
          )
        : null,
    [
      current,
      spec.platformerObjectEdits,
      spec.platformerObjectRemovals,
      spec.platformerObjectSettings,
      spec.platformerTerrainEdits,
      spec.startingLives,
    ],
  );

  if (!current || !currentMaze || !platformerMap) return null;

  return spec.previewKind === "maze" ? (
    <MazeGame
      key={`${currentMaze.map.id}:${currentMaze.map.revision}:${playerAssetId}:${spec.skinTone}:${spec.hairColor}`}
      map={currentMaze.map}
      playerAssetId={playerAssetId}
      skinTone={spec.skinTone}
      hairColor={spec.hairColor}
      controlRowLeading={controlRowLeading}
      onThumbnailCaptureReady={onThumbnailCaptureReady}
      onUpdateThumbnail={onUpdateThumbnail}
    />
  ) : (
    <PlatformerGame
      key={`${current.map.id}:${current.map.revision}:${playerAssetId}:${spec.skinTone}:${spec.hairColor}:${activePhysics.id}@${activePhysics.revision}`}
      map={platformerMap}
      physics={activePhysics}
      weapon={weapon}
      playerAssetId={playerAssetId}
      skinTone={spec.skinTone}
      hairColor={spec.hairColor}
      controlRowLeading={controlRowLeading}
      autoPlay={!platformerEditor}
      hideEditorLabels={hidePlatformerEditorLabels}
      onThumbnailCaptureReady={onThumbnailCaptureReady}
      onUpdateThumbnail={onUpdateThumbnail}
      editorTool={platformerEditor?.tool}
      onEditorToolChange={platformerEditor?.onToolChange}
      onTerrainStroke={platformerEditor?.onTerrainStroke}
      onObjectPlace={platformerEditor?.onObjectPlace}
      selectedObjectId={platformerEditor?.selectedObjectId}
      onObjectSelect={platformerEditor?.onObjectSelect}
      onComplete={onPlatformerComplete}
    />
  );
}
