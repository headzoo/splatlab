/**
 * Every image a maze can draw, and the backdrop colour each theme wears.
 *
 * Mazes ship no background art, so a theme's colour is the entire backdrop:
 * the canvas fills with it and the loading screen sits on top of it.
 */
export const assetUrl = (path: string) => `/game-assets/${path}`;

export type MazeVisualSlot = "floor" | "wall" | "obstacle" | "key" | "door";
type ThemePrefix = "green" | "haunted" | "space" | "dragons";
export type MazeImageKey =
  | `${ThemePrefix}${Capitalize<MazeVisualSlot>}`
  | "enemy"
  | "hazard";

export const MAZE_IMAGE_URLS: Record<MazeImageKey, string> = {
  greenFloor: assetUrl("sprites/neutral_green_hills_maze_floor_01.png"),
  greenWall: assetUrl("sprites/neutral_green_hills_maze_wall_01.png"),
  greenObstacle: assetUrl("sprites/neutral_green_hills_maze_obstacle_01.png"),
  greenKey: assetUrl("sprites/neutral_green_hills_maze_key_01.png"),
  greenDoor: assetUrl("sprites/neutral_green_hills_maze_door_01.png"),
  hauntedFloor: assetUrl("sprites/haunted_graveyard_maze_floor_01.png"),
  hauntedWall: assetUrl("sprites/haunted_graveyard_maze_wall_01.png"),
  hauntedObstacle: assetUrl("sprites/haunted_graveyard_maze_obstacle_01.png"),
  hauntedKey: assetUrl("sprites/haunted_graveyard_maze_key_01.png"),
  hauntedDoor: assetUrl("sprites/haunted_graveyard_maze_door_01.png"),
  spaceFloor: assetUrl("sprites/space_maze_floor_01.png"),
  spaceWall: assetUrl("sprites/space_maze_wall_01.png"),
  spaceObstacle: assetUrl("sprites/space_maze_obstacle_01.png"),
  spaceKey: assetUrl("sprites/space_maze_key_01.png"),
  spaceDoor: assetUrl("sprites/space_maze_door_01.png"),
  dragonsFloor: assetUrl("sprites/dragons_emberkeep_maze_floor_01.png"),
  dragonsWall: assetUrl("sprites/dragons_emberkeep_maze_wall_01.png"),
  dragonsObstacle: assetUrl("sprites/dragons_emberkeep_maze_obstacle_01.png"),
  dragonsKey: assetUrl("sprites/dragons_emberkeep_maze_key_01.png"),
  dragonsDoor: assetUrl("sprites/dragons_emberkeep_maze_door_01.png"),
  enemy: assetUrl("sprites/neutral_ghost_01.png"),
  hazard: assetUrl("sprites/shared_hole_hazard_01.png"),
};

export type MazeVisualProfile = Record<MazeVisualSlot, MazeImageKey> & {
  color: string;
};

function visualProfile(prefix: ThemePrefix, color: string): MazeVisualProfile {
  return {
    color,
    floor: `${prefix}Floor`,
    wall: `${prefix}Wall`,
    obstacle: `${prefix}Obstacle`,
    key: `${prefix}Key`,
    door: `${prefix}Door`,
  };
}

const GREEN_MAZE_VISUALS = visualProfile("green", "#8fcf68");

const MAZE_VISUALS: Record<string, MazeVisualProfile> = {
  maze_green_hills_01: GREEN_MAZE_VISUALS,
  maze_graveyard_01: visualProfile("haunted", "#322842"),
  maze_space_01: visualProfile("space", "#111936"),
  maze_dragon_world_01: visualProfile("dragons", "#472731"),
};

export function resolveMazeVisuals(mapId: string): MazeVisualProfile {
  return MAZE_VISUALS[mapId] ?? GREEN_MAZE_VISUALS;
}

/**
 * What the loading screen shows while a maze's sprites download. Mazes have no
 * furthest background layer to fall back on, only their theme colour.
 */
export function mazeLoadingBackdrop(mapId: string) {
  return { color: resolveMazeVisuals(mapId).color, imageUrl: undefined };
}
