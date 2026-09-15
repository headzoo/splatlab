"use client";

import { GamePlayer, type GamePlayerContentProps } from "@/game/game-player";
import type {
  GameDocument,
  PublicGameDocument,
} from "@/lib/game-contract";

type PublicGamePlayerProps = GamePlayerContentProps & {
  gameId: string;
  gameTitle: string;
  initialSpec: PublicGameDocument;
};

export function PublicGamePlayer({
  gameId,
  gameTitle,
  initialSpec,
  maps,
  mazes,
  physics,
  weapon,
}: PublicGamePlayerProps) {
  // Builder-only fields are created locally after hydration. They are never
  // part of the public server-component payload.
  const playableSpec: GameDocument = {
    ...initialSpec,
    setupStep: "complete",
    builderSetupHistory: [],
    builderChatHistory: [],
  };

  return (
    <GamePlayer
      spec={playableSpec}
      maps={maps}
      mazes={mazes}
      physics={physics}
      weapon={weapon}
      playAllLevels
      savedGameId={gameId}
      startOverlayTitle={gameTitle}
    />
  );
}
