import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { container } from "@sapphire/framework";
import { Stopwatch } from "@sapphire/stopwatch";
import { pgPoolSize, pgPoolUsed, pgPoolWaiting } from "@lumi/observability";

// Pooling-mode decision (settled before the `worker` role fans out):
// **transaction** pooling, not session. Our access pattern is compatible:
//   - Every `$transaction` (incl. the interactive callback form, e.g.
//     ModerationRepository.createModerationCase) is a short single BEGIN..COMMIT.
//     Transaction-mode PgBouncer pins one server backend for the transaction's
//     duration, so interactive transactions are safe — they never span pooled
//     backends.
//   - We hold no cross-transaction session state: cross-worker mutual exclusion
//     is Redis-backed (acquireRedisLock), not pg advisory locks, and nothing
//     LISTEN/NOTIFYs or `SET`s on this pool.
//   - The pg adapter issues unnamed (extended-protocol) statements, so there is
//     no prepared-statement cache to corrupt across backends — the classic
//     Prisma+PgBouncer footgun. Keep it that way; if Prisma ever starts naming
//     statements, append `?pgbouncer=true` to POSTGRES_URL.
//
// Per-process client-connection cap. Behind a transaction-pooled PgBouncer this
// is how many PgBouncer client slots a single process holds — keep it small so N
// workers stay under PgBouncer's `max_client_conn`. PgBouncer's
// `default_pool_size` is what actually caps real Postgres backends.
const POOL_MAX = Number(process.env.POSTGRES_POOL_MAX ?? 10);

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  max: Number.isFinite(POOL_MAX) && POOL_MAX > 0 ? POOL_MAX : 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const adapter = new PrismaPg(pool);

// Feed the pg-pool gauges (saturation alert). pg exposes totalCount/idleCount/
// waitingCount; used = total - idle. unref so it never holds the process open.
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
            // Guard: container.logger may not be set during early bootstrap.
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
