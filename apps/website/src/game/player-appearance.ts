import type {
  HairColor,
  PlayerAssetId,
  SkinTone,
} from "@/lib/game-contract";

const MASK_SHADE_VALUES = [0, 85, 170, 255] as const;

const SKIN_RAMPS: Record<SkinTone, readonly string[]> = {
  skin_01: ["#9b5b44", "#c57a5b", "#e9a37c", "#ffd0a4"],
  skin_02: ["#86503e", "#ad6c52", "#d78f6c", "#f0b38a"],
  skin_03: ["#744535", "#975c45", "#bf795a", "#dd9b73"],
  skin_04: ["#462a2e", "#6b413b", "#965e4c", "#c38464"],
  skin_05: ["#352329", "#553735", "#7d5145", "#aa7358"],
  skin_06: ["#261c20", "#432f2f", "#694a3f", "#98705a"],
};

const HAIR_RAMPS: Record<HairColor, readonly string[]> = {
  hair_01: ["#151820", "#252a35", "#3a4050", "#596170"],
  hair_02: ["#2c1b18", "#452820", "#61382a", "#81503a"],
  hair_03: ["#4a261b", "#713927", "#975038", "#c46f4a"],
  hair_04: ["#4b1f1a", "#752b20", "#a33f2c", "#d26341"],
  hair_05: ["#672516", "#9a381f", "#cc552c", "#f07b42"],
  hair_06: ["#6d4b21", "#9c7130", "#d3a64a", "#f0cf72"],
  hair_07: ["#6e6870", "#9a9297", "#c8c0bc", "#eee4d8"],
  hair_08: ["#31343a", "#51565f", "#777e87", "#aab0b6"],
};

function rgb(hex: string) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ] as const;
}

function applyMask(
  output: ImageData,
  mask: ImageData,
  ramp: readonly string[],
) {
  const colors = ramp.map(rgb);
  for (let index = 0; index < mask.data.length; index += 4) {
    if (mask.data[index + 3] === 0) continue;
    const shadeIndex = MASK_SHADE_VALUES.indexOf(
      mask.data[index] as (typeof MASK_SHADE_VALUES)[number],
    );
    const color = colors[shadeIndex];
    if (!color) continue;
    output.data[index] = color[0];
    output.data[index + 1] = color[1];
    output.data[index + 2] = color[2];
  }
}

function imageData(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

export function loadSpriteImage(url: string) {
  return new Promise<HTMLImageElement | undefined>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(undefined);
    image.src = url;
  });
}

export function isCustomizableHumanAsset(playerAssetId: PlayerAssetId) {
  return playerAssetId.includes("_human_") || playerAssetId.includes("_girl_");
}

export function recolorHumanSprite(
  sprite: HTMLImageElement,
  skinMask: HTMLImageElement,
  hairMask: HTMLImageElement,
  skinTone: SkinTone,
  hairColor: HairColor,
) {
  const canvas = document.createElement("canvas");
  canvas.width = sprite.naturalWidth;
  canvas.height = sprite.naturalHeight;
  const context = canvas.getContext("2d");
  const skinMaskData = imageData(skinMask);
  const hairMaskData = imageData(hairMask);
  if (!context || !skinMaskData || !hairMaskData) return sprite;

  context.drawImage(sprite, 0, 0);
  const output = context.getImageData(0, 0, canvas.width, canvas.height);
  applyMask(output, skinMaskData, SKIN_RAMPS[skinTone]);
  applyMask(output, hairMaskData, HAIR_RAMPS[hairColor]);
  context.putImageData(output, 0, 0);
  return canvas;
}
