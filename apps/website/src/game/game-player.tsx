"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";

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
import {
  campaignMapIndex,
  FIRST_LEVEL_INDEX,
  gameCampaignMaps,
  gameMazeMaps,
  levelCompletionMessage,
  levelProgressLabel,
  mazeMapIndex,
} from "./game-levels";
import { nextCampaignMapIndex } from "./platformer/campaign";

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
  // Shared play runs the whole level list; the builder stays on the level it
  // is editing.
  playAllLevels?: boolean;
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

export function GamePlayer({
  spec,
  maps,
  mazes,
  physics,
  weapon,
  playAllLevels = false,
  onPlatformerComplete,
  controlRowLeading,
  hidePlatformerEditorLabels,
  onThumbnailCaptureReady,
  onUpdateThumbnail,
  platformerEditor,
}: GamePlayerProps) {
  const campaignMaps = useMemo(() => gameCampaignMaps(spec, maps), [maps, spec]);
  const availableMazes = useMemo(() => gameMazeMaps(spec, mazes), [mazes, spec]);
  const [reachedLevelIndex, setReachedLevelIndex] = useState(FIRST_LEVEL_INDEX);
  const reachedLevelIn = (levelCount: number) =>
    Math.min(reachedLevelIndex, Math.max(levelCount - 1, 0));
  const mapIndex = playAllLevels
    ? reachedLevelIn(campaignMaps.length)
    : campaignMapIndex(spec, campaignMaps);
  const mazeIndex = playAllLevels
    ? reachedLevelIn(availableMazes.length)
    : mazeMapIndex(spec, availableMazes);
  const current = campaignMaps[mapIndex];
  const currentMaze = availableMazes[mazeIndex];
  const isMaze = spec.previewKind === "maze";
  const levelIndex = isMaze ? mazeIndex : mapIndex;
  const levelCount = isMaze ? availableMazes.length : campaignMaps.length;
  // Lives follow the player from level to level; coins start over because each
  // level counts its own.
  const [carriedLives, setCarriedLives] = useState<number | null>(null);
  const advanceLevel = useCallback((livesRemaining?: number) => {
    if (!playAllLevels) return;
    const next = nextCampaignMapIndex(levelIndex, levelCount);
    if (next === null) return;
    setReachedLevelIndex(next);
    if (livesRemaining !== undefined) setCarriedLives(livesRemaining);
  }, [levelCount, levelIndex, playAllLevels]);
  const handlePlatformerComplete = useCallback((livesRemaining: number) => {
    advanceLevel(livesRemaining);
    onPlatformerComplete?.();
  }, [advanceLevel, onPlatformerComplete]);
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
            carriedLives ?? spec.startingLives,
          )
        : null,
    [
      carriedLives,
      current,
      spec.platformerObjectEdits,
      spec.platformerObjectRemovals,
      spec.platformerObjectSettings,
      spec.platformerTerrainEdits,
      spec.startingLives,
    ],
  );

  if (!current || !currentMaze || !platformerMap) return null;

  const levelLabel = playAllLevels
    ? levelProgressLabel(levelIndex, levelCount, isMaze ? currentMaze.label : current.label)
    : undefined;
  const completionMessage = (levelMessage: string) => playAllLevels
    ? levelCompletionMessage(levelIndex, levelCount, levelMessage)
    : undefined;

  return isMaze ? (
    <MazeGame
      key={`${currentMaze.map.id}:${currentMaze.map.revision}:${playerAssetId}:${spec.skinTone}:${spec.hairColor}`}
      map={currentMaze.map}
      playerAssetId={playerAssetId}
      skinTone={spec.skinTone}
      hairColor={spec.hairColor}
      controlRowLeading={controlRowLeading}
      levelLabel={levelLabel}
      completionMessage={completionMessage("Maze complete!")}
      onThumbnailCaptureReady={onThumbnailCaptureReady}
      onUpdateThumbnail={onUpdateThumbnail}
      onComplete={advanceLevel}
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
      levelLabel={levelLabel}
      completionMessage={completionMessage("Level complete!")}
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
      onComplete={handlePlatformerComplete}
    />
  );
}
