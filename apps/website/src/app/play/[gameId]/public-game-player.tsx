"use client";

import { GamePlayer, type GamePlayerContentProps } from "@/game/game-player";
import type { GameDocument } from "@/lib/game-contract";

type PublicGamePlayerProps = GamePlayerContentProps & {
  initialSpec: GameDocument;
};

export function PublicGamePlayer({
  initialSpec,
  maps,
  mazes,
  physics,
  weapon,
}: PublicGamePlayerProps) {
  return (
    <GamePlayer
      spec={initialSpec}
      maps={maps}
      mazes={mazes}
      physics={physics}
      weapon={weapon}
      playAllLevels
    />
  );
}
