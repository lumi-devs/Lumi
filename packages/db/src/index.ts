import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const connectionString =
  process.env.DATABASE_URL ??
  process.env.DIRECT_POSTGRES_URL ??
  process.env.POSTGRES_URL ??
  "postgresql://lumi:lumi@127.0.0.1:5432/lumi";

const pool = new Pool({ connectionString });

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
}

export async function disconnectDatabase(): Promise<void> {

  try {
    await prisma.$disconnect();
  } catch (error) {
    console.error("prisma disconnect failed", { error });
  }
  try {
    await pool.end();
  } catch (error) {
    console.error("postgres pool shutdown failed", { error });
  }
}

export type { Prisma, PrismaClient } from "@prisma/client";
