import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { container } from "@sapphire/framework";
import { Stopwatch } from "@sapphire/stopwatch";
import { pgPoolSize, pgPoolUsed, pgPoolWaiting } from "@lumi/observability";

import {
  getPostgresAppName,
  getPostgresReplicaUrl,
  getPostgresUrl,
  resolvePgPoolSize,
} from "#lib/env.js";

const POOL_MAX = resolvePgPoolSize();

const primaryUrl = getPostgresUrl();
const appName = getPostgresAppName();

const pool = new Pool({
  connectionString: primaryUrl,
  max: POOL_MAX,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  application_name: appName,
});

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

export const prisma = createPrismaClient(adapter);

/**
 * Optional read-only client for cross-guild scans.
 *
 * Deliberately NOT blanket read routing. This codebase reads its own writes all
 * over the place - set a config, invalidate, read it back - so sending every
 * read to a replica would turn replication lag into a diffuse correctness bug.
 * Callers opt in, and only where staleness is provably harmless: sweeps that
 * re-arm jobs or decay counters converge on the next run regardless.
 *
 * Falls back to the primary when POSTGRES_REPLICA_URL is unset, so nothing has
 * to branch on whether a replica exists.
 */
const replicaUrl = getPostgresReplicaUrl();

const replicaPool = replicaUrl
  ? new Pool({
      connectionString: replicaUrl,
      max: POOL_MAX,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      application_name: `${appName}-replica`,
    })
  : null;

export const prismaReader = replicaPool
  ? createPrismaClient(new PrismaPg(replicaPool))
  : prisma;

export const hasReadReplica = replicaPool !== null;

/** Drain both pools on shutdown; neither is closed anywhere else. */
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

export * from "@prisma/client";
