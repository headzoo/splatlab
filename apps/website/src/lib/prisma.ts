import { PrismaNeon } from "@prisma/adapter-neon";

import { PrismaClient } from "@/generated/prisma/client";

declare global {
  var splatLabPrisma: PrismaClient | undefined;
}

export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

export function getPrisma() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for persistent database access.");
  }

  if (!globalThis.splatLabPrisma) {
    const adapter = new PrismaNeon({ connectionString });
    globalThis.splatLabPrisma = new PrismaClient({ adapter });
  }

  return globalThis.splatLabPrisma;
}
