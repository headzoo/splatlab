import { betterAuth } from "better-auth";
import { memoryAdapter, type MemoryDB } from "better-auth/adapters/memory";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { anonymous } from "better-auth/plugins";

import { UNSET_DISPLAY_NAME } from "./display-name";
import { labKeyPlugin } from "./lab-key-plugin";
import { getPrisma } from "./prisma";

declare global {
  var splatLabAuthMemory: MemoryDB | undefined;
}

const databaseUrl = process.env.DATABASE_URL;
const isProduction = process.env.NODE_ENV === "production";
const isProductionBuild =
  process.env.NEXT_PHASE === "phase-production-build";
const baseURL =
  process.env.BETTER_AUTH_URL ??
  (!isProduction ? "http://localhost:3000" : undefined);
const trustedOrigins = [
  ...(baseURL ? [baseURL] : []),
  ...(!isProduction
    ? ["http://localhost:3000", "http://127.0.0.1:3000"]
    : []),
  ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? []),
];

function requiredSecret(
  name:
    | "BETTER_AUTH_SECRET"
    | "LAB_KEY_CHECKSUM_SECRET"
    | "LAB_KEY_PEPPER",
) {
  const value = process.env[name];

  if (value) {
    return value;
  }

  if (isProduction && !isProductionBuild) {
    throw new Error(`${name} is required in production.`);
  }

  return `local-development-only-${name.toLowerCase()}-change-me`;
}

function createDatabaseAdapter() {
  if (databaseUrl) {
    return prismaAdapter(getPrisma(), {
      provider: "postgresql",
    });
  }

  if (isProduction && !isProductionBuild) {
    throw new Error("DATABASE_URL is required in production.");
  }

  globalThis.splatLabAuthMemory ??= {
    user: [],
    session: [],
    account: [],
    verification: [],
    rateLimit: [],
    labWorkspace: [],
  };
  globalThis.splatLabAuthMemory.labWorkspace ??= [];
  globalThis.splatLabAuthMemory.rateLimit ??= [];
  return memoryAdapter(globalThis.splatLabAuthMemory);
}

export const auth = betterAuth({
  appName: "Splat Lab!",
  ...(baseURL ? { baseURL } : {}),
  trustedOrigins,
  secret: requiredSecret("BETTER_AUTH_SECRET"),
  database: createDatabaseAdapter(),
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    storage: databaseUrl ? "database" : "memory",
  },
  plugins: [
    anonymous({
      generateName: () => UNSET_DISPLAY_NAME,
    }),
    labKeyPlugin({
      checksumSecret: requiredSecret("LAB_KEY_CHECKSUM_SECRET"),
      pepper: requiredSecret("LAB_KEY_PEPPER"),
    }),
  ],
});
