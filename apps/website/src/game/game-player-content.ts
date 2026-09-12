import levelOne from "../../../game/maps/level-1.json";
import levelTwo from "../../../game/maps/level-2.json";
import levelThree from "../../../game/maps/level-3.json";
import levelFour from "../../../game/maps/level-4.json";
import mazeGreenHills from "../../../game/maps/maze_green_hills_01.json";
import mazeSpace from "../../../game/maps/maze_space_01.json";
import mazeGraveyard from "../../../game/maps/maze_graveyard_01.json";
import mazeDragonWorld from "../../../game/maps/maze_dragon_world_01.json";
import platformerPhysics from "../../../game/game-physics/platformer_small_01.json";
import shortSword from "../../../game/weapon-specs/short_sword_v1.json";

import type { GamePlayerContentProps } from "./game-player";
import type {
  PlatformerMapSpec,
  PlatformerPhysicsSpec,
  WeaponSpec,
} from "./platformer/types";
import type { MazeMapSpec } from "./top-down/types";

export const GAME_PLAYER_CONTENT = {
  maps: [
    { source: "level-1.json", label: "Green Hills", map: levelOne as unknown as PlatformerMapSpec },
    { source: "level-3.json", label: "Graveyard", map: levelThree as unknown as PlatformerMapSpec },
    { source: "level-2.json", label: "Space", map: levelTwo as unknown as PlatformerMapSpec },
    { source: "level-4.json", label: "Dragon World", map: levelFour as unknown as PlatformerMapSpec },
  ],
  mazes: [
    { source: "maze_green_hills_01.json", label: "Green Hills", map: mazeGreenHills as unknown as MazeMapSpec },
    { source: "maze_space_01.json", label: "Space", map: mazeSpace as unknown as MazeMapSpec },
    { source: "maze_graveyard_01.json", label: "Graveyard", map: mazeGraveyard as unknown as MazeMapSpec },
    { source: "maze_dragon_world_01.json", label: "Dragon World", map: mazeDragonWorld as unknown as MazeMapSpec },
  ],
  physics: platformerPhysics as unknown as PlatformerPhysicsSpec,
  weapon: shortSword as unknown as WeaponSpec,
} satisfies GamePlayerContentProps;
