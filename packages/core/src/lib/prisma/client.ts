import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { container } from "@sapphire/framework";
import { Stopwatch } from "@sapphire/stopwatch";
import { pgPoolSize, pgPoolUsed, pgPoolWaiting } from "@lumi/observability";

const POOL_MAX = Number(process.env.POSTGRES_POOL_MAX ?? 10);

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  max: Number.isFinite(POOL_MAX) && POOL_MAX > 0 ? POOL_MAX : 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const adapter = new PrismaPg(pool);

pgPoolSize.set(pool.options.max ?? 10);
const poolStatsTimer = setInterval(() => {
  pgPoolSize.set(pool.options.max ?? 10);
  pgPoolUsed.set(pool.totalCount - pool.idleCount);
  pgPoolWaiting.set(pool.waitingCount);
}, 10_000);
poolStatsTimer.unref();

const createPrismaClient = () => {
  const baseClient = new PrismaClient({ adapter });

  return baseClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ operation, model, args, query }) {
          const sw = new Stopwatch();
          const result = await query(args);
          sw.stop();

          if (sw.duration > 1000) {
            container.logger?.warn(
              `[Prisma Diagnostic] Query exceeded 1000ms: ${model}.${operation} took ${sw}`,
            );
          }

          return result;
        },
      },
    },
  });
};

export const prisma = createPrismaClient();

export type DatabaseClient = typeof prisma;

export * from "@prisma/client";
