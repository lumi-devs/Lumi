import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { serverConfig } from "./env";

let pool: Pool | null = null;
let prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (prisma) return prisma;

  pool = new Pool({
    connectionString: serverConfig().databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter });
  return prisma;
}

export type { Prisma } from "@prisma/client";
