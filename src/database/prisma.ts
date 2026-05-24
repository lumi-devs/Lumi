import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
const adapter = new PrismaPg(pool);

/**
 * Standard Prisma Client with Postgres adapter.
 * We avoid custom extensions like .fetch() or .set() to remain idiomatic
 * and prefer centralized setting managers.
 */
export const prisma = new PrismaClient({ adapter });

export * from "@prisma/client";
