import { isCustomizableHumanAsset, loadSpriteImage } from "./player-appearance";
import type { PlayerAssetId } from "@/lib/game-contract";

/**
 * How many images a game will fetch before it can draw a frame.
 *
 * The loading bar is only honest if this matches what the preload effect
 * actually asks for, so the conditional appearance masks are counted here
 * rather than guessed at by the overlay.
 */
export function spritePreloadTotal({
  sheetCount,
  playerAssetId,
  extraSheets = 0,
}: {
  sheetCount: number;
  playerAssetId: PlayerAssetId;
  extraSheets?: number;
}) {
  const maskCount = isCustomizableHumanAsset(playerAssetId) ? 2 : 0;
  return sheetCount + maskCount + extraSheets;
}

/**
 * Wraps `loadSpriteImage` so every finished download nudges the loading bar.
 *
 * The fraction is clamped because a body can pull in an extra sheet the count
 * did not anticipate, and a bar that overshoots looks broken.
 */
export function createSpritePreloader(
  total: number,
  onProgress: (fraction: number) => void,
  load: (url: string) => Promise<HTMLImageElement | undefined> = loadSpriteImage,
) {
  const denominator = Math.max(1, total);
  let loaded = 0;

  return async (url: string) => {
    const image = await load(url);
    loaded += 1;
    onProgress(Math.min(1, loaded / denominator));
    return image;
  };
}
