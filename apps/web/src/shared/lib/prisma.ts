import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { env } from "@/shared/config/env";

require("fs").writeFileSync("prisma-debug.log", "PRISMA MODULE LOADED. env.DIRECT_DATABASE_URL: " + env.DIRECT_DATABASE_URL + "\n", { flag: "a" });


const globalForPrisma = globalThis as {
  prisma?: PrismaClient;
};

export function getPrisma() {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const connectionString = env.DIRECT_DATABASE_URL ?? env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("A direct database URL is required to use Prisma-backed features.");
  }

  const adapter = new PrismaPg(connectionString);

  const prisma = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
  }

  return prisma;
}
