import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { pgPoolSize, pgPoolUsed, pgPoolWaiting } from "#src/observability/Index.ts";
import { recordQueryMetrics } from "#src/lib/prisma/QueryMetrics.js";

import {
  getPostgresAppName,
  getPostgresReplicaUrl,
  getPostgresUrl,
  resolvePgPoolSize,
} from "#src/lib/Env.js";

const PoolMax = resolvePgPoolSize();

const primaryUrl = getPostgresUrl();
const appName = getPostgresAppName();

const pool = new Pool({
  connectionString: primaryUrl,
  max: PoolMax,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  application_name: appName,
});

pool.query("SELECT 1").catch(() => undefined);

const adapter = new PrismaPg(pool);

pgPoolSize.set(pool.options.max ?? 10);
const poolStatsTimer = setInterval(() => {
  pgPoolSize.set(pool.options.max ?? 10);
  pgPoolUsed.set(pool.totalCount - pool.idleCount);
  pgPoolWaiting.set(pool.waitingCount);
}, 10_000);
poolStatsTimer.unref();

const createPrismaClient = (clientAdapter: PrismaPg) => {
  const baseClient = new PrismaClient({ adapter: clientAdapter });

  return baseClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ operation, model, args, query }) {
          const start = performance.now();
          const result = await query(args);
          recordQueryMetrics(model, operation, performance.now() - start);
          return result;
        },
      },
    },
  });
};

export const prisma = createPrismaClient(adapter);

const replicaUrl = getPostgresReplicaUrl();

const replicaPool = replicaUrl
  ? new Pool({
      connectionString: replicaUrl,
      max: PoolMax,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      application_name: `${appName}-replica`,
    })
  : null;

export const prismaReader = replicaPool
  ? createPrismaClient(new PrismaPg(replicaPool))
  : prisma;

export async function disconnectDatabase(): Promise<void> {
  poolStatsTimer.close();
  await prisma.$disconnect().catch(() => undefined);
  if (replicaPool) {
    await prismaReader.$disconnect().catch(() => undefined);
    await replicaPool.end().catch(() => undefined);
  }
  await pool.end().catch(() => undefined);
}

export type DatabaseClient = typeof prisma;

