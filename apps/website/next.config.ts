import type { NextConfig } from "next";

const gameRuntimeFiles = [
  "../game/audio/*/*.wav",
  "../game/backgrounds/background_neutral_green_hills_*.png",
  "../game/backgrounds/background_ice_world_*.png",
  "../game/sprites/short_sword_v1.png",
  "../game/sprites/space_cooper_01.png",
  "../game/sprites/space_cooper_01_attack.png",
  "../game/sprites/space_cooper_01_defeated.png",
  "../game/sprites/*_cooper_01.png",
  "../game/sprites/*_human_01.png",
  "../game/sprites/*_girl_01.png",
  "../game/sprites/*_ghost_01.png",
  "../game/sprites/*_robot_01.png",
  "../game/sprite-masks/*_human_01-skin-mask.png",
  "../game/sprite-masks/*_human_01-hair-mask.png",
  "../game/sprite-masks/*_girl_01-skin-mask.png",
  "../game/sprite-masks/*_girl_01-hair-mask.png",
  "../game/sprites/*_maze_floor_01.png",
  "../game/sprites/*_maze_wall_01.png",
  "../game/sprites/*_maze_obstacle_01.png",
  "../game/sprites/*_maze_key_01.png",
  "../game/sprites/*_maze_door_01.png",
  "../game/sprites/haunted_graveyard_flaming_pumpkin_01.png",
  "../game/sprites/dragons_emberkeep_fireball_01.png",
  "../game/sprites/neutral_ghost_01.png",
  "../game/sprites/neutral_robot_01.png",
  "../game/sprites/neutral_zombie_01.png",
  "../game/sprites/neutral_green_hills_boss_01.png",
  "../game/sprites/neutral_green_hills_flying_cooper_01.png",
  "../game/sprites/neutral_green_hills_platformer_ground_01.png",
  "../game/sprites/neutral_green_hills_platformer_hazard_01.png",
  "../game/sprites/neutral_green_hills_platformer_obstacle_01.png",
  "../game/sprites/neutral_green_hills_platformer_platform_01.png",
  "../game/sprites/ice_world_platformer_*.png",
  "../game/sprites/ice_world_boss_01*.png",
  "../game/sprites/ice_world_crystal_projectile_01.png",
  "../game/sprites/shared_game_over_01.png",
  "../game/sprites/shared_platformer_easter_egg_01.png",
  "../game/sprites/shared_victory_burst_01.png",
  "../game/sprites/space_platformer_checkpoint_01.png",
  "../game/sprites/space_platformer_coin_01.png",
  "../game/sprites/space_platformer_goal_01.png",
  "../game/sprites/space_platformer_hud_coins_01.png",
  "../game/sprites/space_platformer_hud_lives_01.png",
];

export const videoRouteTracingFiles = ["./node_modules/ffmpeg-static/**"];

export const mediaEmbedContentSecurityPolicy =
  "default-src 'none'; base-uri 'none'; form-action 'none'; img-src https: data:; media-src https: blob:; style-src 'unsafe-inline'; frame-ancestors *";

export const mediaEmbedRouteHeaders: Array<{
  source: string;
  headers: Array<{ key: string; value: string }>;
}> = [
  {
    source: "/media/:mediaId/embed",
    headers: [
      {
        key: "Content-Security-Policy",
        value: mediaEmbedContentSecurityPolicy,
      },
    ],
  },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["ffmpeg-static"],
  experimental: {
    useTypeScriptCli: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
      {
        protocol: "https",
        hostname: "*.blob.vercel-storage.com",
      },
    ],
  },
  outputFileTracingIncludes: {
    "/game-assets/*": gameRuntimeFiles,
    "/api/media/video": videoRouteTracingFiles,
  },
  headers: async () => [...mediaEmbedRouteHeaders],
};

export default nextConfig;
