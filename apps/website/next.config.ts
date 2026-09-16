import type { NextConfig } from "next";

/**
 * Everything `/game-assets` can read off disk at runtime.
 *
 * These are whole directories rather than a per-file list. The previous
 * hand-maintained list had silently drifted from the route's allowlist and was
 * missing 49 served files, including every Space, Dragons, and Graveyard
 * background, so those worlds rendered without art in production while
 * working locally. `game-asset-tracing.test.ts` fails if the two disagree.
 */
export const gameRuntimeFiles = [
  "../game/audio/*/*.ogg",
  "../game/audio/*/*.wav",
  "../game/backgrounds/*.webp",
  "../game/sprites/*.png",
  "../game/sprite-masks/*.png",
];

/**
 * Masters that are authored and checked in but never served, and so must not
 * ride along with the directory globs above: sprite `-source` art is 188 MB
 * against 8 MB of runtime sheets, the background PNGs are 22.6 MB against
 * 3.1 MB of WebP, and the music WAVs are 16.8 MB against 4 MB of Opus. Only
 * the short effect WAVs are still served. Excludes are applied after includes
 * during tracing, so these win.
 */
export const gameRuntimeExcludedFiles = [
  "../game/sprites/*-source.png",
  "../game/backgrounds/*.png",
  "../game/audio/*/gameplay_loop.wav",
  "../game/audio/*/boss_loop.wav",
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
  outputFileTracingExcludes: {
    "/game-assets/*": gameRuntimeExcludedFiles,
  },
  headers: async () => [...mediaEmbedRouteHeaders],
};

export default nextConfig;
