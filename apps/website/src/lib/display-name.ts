export const UNSET_DISPLAY_NAME = "Lab Creator";

const TITLES = [
  "Professor",
  "Captain",
  "Doctor",
  "Admiral",
  "Chef",
  "Mayor",
  "Agent",
  "Sheriff",
  "Coach",
  "Duchess",
  "Baron",
  "Scout",
  "Ranger",
  "Wizard",
  "Sir",
  "Lady",
  "Inspector",
  "Pilot",
  "Detective",
  "Knight",
  "Major",
  "Princess",
  "Count",
  "General",
] as const;

const NOUNS = [
  "Underpants",
  "Zebra",
  "Pickle",
  "Noodle",
  "Waffle",
  "Wombat",
  "Nimbus",
  "Pretzel",
  "Pancake",
  "Cupcake",
  "Banana",
  "Marshmallow",
  "Jellybean",
  "Biscuit",
  "Donut",
  "Pudding",
  "Popcorn",
  "Muffin",
  "Nacho",
  "Peanut",
  "Mochi",
  "Cookie",
  "Dumpling",
  "Axolotl",
  "Narwhal",
  "Otter",
  "Puffin",
  "Sloth",
  "Hedgehog",
  "Llama",
  "Koala",
  "Panda",
  "Penguin",
  "Flamingo",
  "Gecko",
  "Badger",
  "Walrus",
] as const;

export const DISPLAY_NAME_AVATARS = [
  { id: "lab-name-01", src: "/brand/lab-names/01.png" },
  { id: "lab-name-02", src: "/brand/lab-names/02.png" },
  { id: "lab-name-03", src: "/brand/lab-names/03.png" },
  { id: "lab-name-04", src: "/brand/lab-names/04.png" },
  { id: "lab-name-05", src: "/brand/lab-names/05.png" },
  { id: "lab-name-06", src: "/brand/lab-names/06.png" },
  { id: "lab-name-07", src: "/brand/lab-names/07.png" },
  { id: "lab-name-08", src: "/brand/lab-names/08.png" },
] as const;

export type DisplayNameAvatarId = (typeof DISPLAY_NAME_AVATARS)[number]["id"];

const TITLE_SET = new Set<string>(TITLES);
const NOUN_SET = new Set<string>(NOUNS);
const AVATAR_IDS = new Set<string>(
  DISPLAY_NAME_AVATARS.map((avatar) => avatar.id),
);

function randomIndex(length: number): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % length;
}

function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    const current = copy[index];
    copy[index] = copy[swapIndex];
    copy[swapIndex] = current;
  }

  return copy;
}

export function hasChosenDisplayName(name: string | null | undefined): boolean {
  return Boolean(name && name !== UNSET_DISPLAY_NAME);
}

export function isValidGeneratedDisplayName(name: string): boolean {
  const parts = name.split(" ");

  return (
    parts.length === 2 &&
    TITLE_SET.has(parts[0]) &&
    NOUN_SET.has(parts[1])
  );
}

export function isValidDisplayNameAvatarId(
  image: string,
): image is DisplayNameAvatarId {
  return AVATAR_IDS.has(image);
}

export function displayNameAvatarSrc(image: string | null | undefined): string | null {
  const avatar = DISPLAY_NAME_AVATARS.find((candidate) => candidate.id === image);
  return avatar?.src ?? null;
}

export function buildDisplayNameOptions(count = 8): string[] {
  if (count < 1) {
    return [];
  }

  const titles = shuffled(TITLES);
  const nouns = shuffled(NOUNS);
  const names: string[] = [];
  const used = new Set<string>();
  const pairCount = Math.min(titles.length, nouns.length);

  for (let index = 0; names.length < count && index < pairCount; index += 1) {
    const name = `${titles[index]} ${nouns[index]}`;

    if (!used.has(name)) {
      used.add(name);
      names.push(name);
    }
  }

  if (names.length < count) {
    throw new Error("Could not generate enough Lab names.");
  }

  return names;
}
