import {
  createHmac,
  randomBytes,
  randomInt,
  scrypt,
  timingSafeEqual,
} from "node:crypto";

const FOODS = [
  "BAGEL",
  "BEANS",
  "BISCUIT",
  "BROWNIE",
  "BURRITO",
  "CHEESE",
  "CHERRY",
  "COOKIE",
  "CUPCAKE",
  "DONUT",
  "DUMPLING",
  "FALAFEL",
  "GRAPE",
  "JELLY",
  "KIWI",
  "LEMON",
  "MARSHMALLOW",
  "MELON",
  "MOCHI",
  "MUFFIN",
  "NACHO",
  "NOODLE",
  "PANCAKE",
  "PEACH",
  "PEANUT",
  "PICKLE",
  "PIZZA",
  "POPCORN",
  "PRETZEL",
  "PUDDING",
  "TACO",
  "TOAST",
  "WAFFLE",
] as const;

const WONDERS = [
  "BUBBLE",
  "CASTLE",
  "COMET",
  "DISCO",
  "DRAGON",
  "GALAXY",
  "GLITTER",
  "JETPACK",
  "LASER",
  "LIGHTNING",
  "MAGIC",
  "MOON",
  "NEBULA",
  "NINJA",
  "ORBIT",
  "PLANET",
  "PORTAL",
  "RAINBOW",
  "ROBOT",
  "ROCKET",
  "SATURN",
  "SPARKLE",
  "STAR",
  "SUNSHINE",
  "THUNDER",
  "TREASURE",
  "VOLCANO",
  "WIZARD",
] as const;

const CREATURES = [
  "AXOLOTL",
  "BADGER",
  "BEAVER",
  "BUNNY",
  "CHICKEN",
  "DOLPHIN",
  "DUCK",
  "FALCON",
  "FERRET",
  "FLAMINGO",
  "FOX",
  "FROG",
  "GECKO",
  "GOAT",
  "HAMSTER",
  "HEDGEHOG",
  "HIPPO",
  "IGUANA",
  "KOALA",
  "LEMUR",
  "LLAMA",
  "MOOSE",
  "NARWHAL",
  "OCTOPUS",
  "OTTER",
  "PANDA",
  "PENGUIN",
  "PONY",
  "PUFFIN",
  "RABBIT",
  "SEAL",
  "SLOTH",
  "TURTLE",
  "WALRUS",
] as const;

const LAB_KEY_PATTERN = /^[A-Z]+-[A-Z]+-[A-Z]+-\d{2}$/;
const SCRYPT_PREFIX = "scrypt-v1";
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

function pick<T>(values: readonly T[]): T {
  return values[randomInt(values.length)];
}

export function generateLabKey(): string {
  const number = randomInt(100).toString().padStart(2, "0");
  return `${pick(FOODS)}-${pick(WONDERS)}-${pick(CREATURES)}-${number}`;
}

export function normalizeLabKey(input: string): string | null {
  const normalized = input
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/[\s_\u2010-\u2015\u2212]+/g, "-");

  return LAB_KEY_PATTERN.test(normalized) ? normalized : null;
}

export function createLabKeyLookup(labKey: string, pepper: string): string {
  return createHmac("sha256", pepper)
    .update(`splat-lab-key:v1:${labKey}`)
    .digest("hex");
}

function deriveKey(labKey: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      labKey,
      salt,
      SCRYPT_KEY_LENGTH,
      {
        N: SCRYPT_COST,
        r: SCRYPT_BLOCK_SIZE,
        p: SCRYPT_PARALLELIZATION,
        maxmem: SCRYPT_MAX_MEMORY,
      },
      (error, key) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(key);
      },
    );
  });
}

export async function hashLabKey(labKey: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await deriveKey(labKey, salt);

  return [
    SCRYPT_PREFIX,
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join("$");
}

export async function verifyLabKey(
  labKey: string,
  storedHash: string,
): Promise<boolean> {
  const [prefix, cost, blockSize, parallelization, encodedSalt, encodedHash] =
    storedHash.split("$");

  if (
    prefix !== SCRYPT_PREFIX ||
    Number(cost) !== SCRYPT_COST ||
    Number(blockSize) !== SCRYPT_BLOCK_SIZE ||
    Number(parallelization) !== SCRYPT_PARALLELIZATION ||
    !encodedSalt ||
    !encodedHash
  ) {
    return false;
  }

  try {
    const expected = Buffer.from(encodedHash, "base64url");
    const actual = await deriveKey(
      labKey,
      Buffer.from(encodedSalt, "base64url"),
    );

    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export const LAB_KEY_EXAMPLE = "TACO-MOON-FROG-82";
