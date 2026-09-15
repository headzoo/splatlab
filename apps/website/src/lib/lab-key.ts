import {
  createHmac,
  randomBytes,
  randomInt,
  scrypt,
  timingSafeEqual,
} from "node:crypto";

const RANDOM_BLOCK_COUNT = 4;
const DECIMAL_BLOCK_SIZE = 1_000_000;
const DECIMAL_BLOCK_PATTERN = "\\d{6}";
const CHECKSUM_DOMAIN = "splat-lab-key-checksum:v2:";
const LAB_KEY_PATTERN = new RegExp(
  `^(?:${DECIMAL_BLOCK_PATTERN}-){${RANDOM_BLOCK_COUNT}}${DECIMAL_BLOCK_PATTERN}$`,
);
const LEGACY_LAB_KEY_PATTERN = /^[A-Z]+-[A-Z]+-[A-Z]+-\d{2}$/;
const SCRYPT_PREFIX = "scrypt-v1";
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

function decimalBlock(value: number): string {
  return value.toString().padStart(6, "0");
}

function checksumPayload(labKey: string): string | null {
  if (!LAB_KEY_PATTERN.test(labKey)) return null;
  return labKey.split("-").slice(0, RANDOM_BLOCK_COUNT).join("-");
}

export function createLabKeyChecksum(
  payload: string,
  checksumSecret: string,
): string {
  if (!checksumSecret) {
    throw new Error("A Lab Key checksum secret is required.");
  }

  const digest = createHmac("sha256", checksumSecret)
    .update(`${CHECKSUM_DOMAIN}${payload}`)
    .digest();
  return decimalBlock(digest.readUIntBE(0, 6) % DECIMAL_BLOCK_SIZE);
}

export function hasValidLabKeyChecksum(
  labKey: string,
  checksumSecret: string,
): boolean {
  const payload = checksumPayload(labKey);
  if (!payload) return false;

  const supplied = labKey.slice(-6);
  const expected = createLabKeyChecksum(payload, checksumSecret);
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export function isChecksummedLabKey(labKey: string): boolean {
  return LAB_KEY_PATTERN.test(labKey);
}

export function generateLabKey(checksumSecret: string): string {
  const payload = Array.from({ length: RANDOM_BLOCK_COUNT }, () =>
    decimalBlock(randomInt(DECIMAL_BLOCK_SIZE)),
  ).join("-");
  return `${payload}-${createLabKeyChecksum(payload, checksumSecret)}`;
}

export function normalizeLabKey(input: string): string | null {
  const normalized = input
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/[\s_\u2010-\u2015\u2212]+/g, "-");

  return LAB_KEY_PATTERN.test(normalized) || LEGACY_LAB_KEY_PATTERN.test(normalized)
    ? normalized
    : null;
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

export const LAB_KEY_EXAMPLE = "482917-063541-829304-771625-038451";
