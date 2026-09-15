import {
  HAIR_COLORS,
  HUMAN_GENDERS,
  PLAYER_CHARACTERS,
  SKIN_TONES,
  type HairColor,
  type HumanGender,
  type PlayerCharacter,
  type SkinTone,
} from "@/lib/game-contract";

export type HeroChoice = {
  value: PlayerCharacter;
  label: string;
  tone: string;
  tagline?: string;
};

const HERO_PRESENTATION = {
  cooper: { label: "Cooper", tone: "yellow" },
  rupert: {
    label: "Rupert",
    tone: "teal",
    tagline: "I'll be there in ten.",
  },
  jamie: {
    label: "Jamie",
    tone: "amber",
    tagline: "Frames houses by day. Frames trades by night.",
  },
  vix: {
    label: "Vix",
    tone: "neon",
    tagline: "Wasn't here.",
  },
  leenie: {
    label: "Leenie",
    tone: "coral",
  },
  lango: {
    label: "Lango",
    tone: "midnight",
    tagline: "If it doesn't exist, I'll build it.",
  },
  human: { label: "Human", tone: "blue" },
  ghost: { label: "Ghost", tone: "purple" },
  robot: { label: "Robot", tone: "slate" },
} as const satisfies Record<PlayerCharacter, Omit<HeroChoice, "value">>;

export const HERO_CHOICES: readonly HeroChoice[] = PLAYER_CHARACTERS.map((value) => ({
  value,
  ...HERO_PRESENTATION[value],
}));

export function heroLabel(character: PlayerCharacter): string {
  return HERO_PRESENTATION[character].label;
}

export const HUMAN_GENDER_CHOICES = [
  { value: "boy", label: "Boy", tone: "blue" },
  { value: "girl", label: "Girl", tone: "coral" },
] as const satisfies ReadonlyArray<{
  value: HumanGender;
  label: string;
  tone: string;
}>;

export const SKIN_TONE_CHOICES = [
  { value: "skin_01", label: "Skin tone 1", color: "#ffd0a4" },
  { value: "skin_02", label: "Skin tone 2", color: "#f0b38a" },
  { value: "skin_03", label: "Skin tone 3", color: "#dd9b73" },
  { value: "skin_04", label: "Skin tone 4", color: "#c38464" },
  { value: "skin_05", label: "Skin tone 5", color: "#aa7358" },
  { value: "skin_06", label: "Skin tone 6", color: "#98705a" },
] as const satisfies ReadonlyArray<{
  value: SkinTone;
  label: string;
  color: string;
}>;

export const HAIR_COLOR_CHOICES = [
  { value: "hair_01", label: "Black hair", color: "#252a35" },
  { value: "hair_02", label: "Dark brown hair", color: "#452820" },
  { value: "hair_03", label: "Brown hair", color: "#713927" },
  { value: "hair_04", label: "Auburn hair", color: "#a33f2c" },
  { value: "hair_05", label: "Red hair", color: "#cc552c" },
  { value: "hair_06", label: "Blond hair", color: "#d3a64a" },
  { value: "hair_07", label: "Platinum hair", color: "#c8c0bc" },
  { value: "hair_08", label: "Gray hair", color: "#777e87" },
] as const satisfies ReadonlyArray<{
  value: HairColor;
  label: string;
  color: string;
}>;

/** Enum lists Cooper can echo back when describing hero appearance options. */
export const HERO_OPTION_ENUMS = {
  characters: PLAYER_CHARACTERS,
  genders: HUMAN_GENDERS,
  skinTones: SKIN_TONES,
  hairColors: HAIR_COLORS,
} as const;
