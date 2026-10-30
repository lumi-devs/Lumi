import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { serverConfig } from "./env";

type PrismaGlobal = typeof globalThis & {
  __lumiDashboardPrisma?: PrismaClient;
  __lumiDashboardPool?: Pool;
};

const globalForPrisma = globalThis as PrismaGlobal;

export function getPrisma(): PrismaClient {
  if (globalForPrisma.__lumiDashboardPrisma) {
    return globalForPrisma.__lumiDashboardPrisma;
  }

  const pool = new Pool({ connectionString: serverConfig().databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  globalForPrisma.__lumiDashboardPool = pool;
  globalForPrisma.__lumiDashboardPrisma = prisma;
  return prisma;
}

export type { Prisma } from "@prisma/client";
