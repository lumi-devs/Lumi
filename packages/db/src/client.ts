import { PrismaClient } from "../generated/client/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import type { Logger } from "@lumi/foundation";
import { dbQueryDuration, pgPoolSize, pgPoolUsed, pgPoolWaiting } from "@lumi/observability";

export interface DatabaseOptions {
  url: string;
  replicaUrl?: string | undefined;
  appName?: string | undefined;
  poolSize?: number | undefined;
  logger: Logger;
}

function instrument(base: PrismaClient, role: "primary" | "replica") {
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const start = performance.now();
          try {
            return await query(args);
          } finally {
            dbQueryDuration.observe(
              { model, operation, role },
              (performance.now() - start) / 1_000,
            );
          }
        },
      },
    },
  });
}

function createPool(
  options: DatabaseOptions,
  url: string,
  role: "primary" | "replica",
  timers: Array<ReturnType<typeof setInterval>>,
): Pool {
  // Mass scale: higher default pool size to handle many concurrent replicas
  const defaultPoolSize = 25;
  const max = role === "primary" ? (options.poolSize ?? defaultPoolSize) : Math.max(5, Math.floor((options.poolSize ?? defaultPoolSize) / 2));
  const pool = new Pool({
    connectionString: url,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: `${options.appName ?? "lumi"}-${role}`,
    // Prisma 7 + adapter-pg: keep connections alive for reuse
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });
  pgPoolSize.set({ role }, max);

  const timer = setInterval(() => {
    pgPoolUsed.set({ role }, pool.totalCount - pool.idleCount);
    pgPoolWaiting.set({ role }, pool.waitingCount);
  }, 10_000);
  timer.unref();
  timers.push(timer);

  return pool;
}

export interface DatabaseHandle {
  readonly prisma: ReturnType<typeof instrument>;
  readonly reader: ReturnType<typeof instrument>;
  ping(role?: "primary" | "replica"): Promise<number>;
  close(): Promise<void>;
}

export function createDatabase(options: DatabaseOptions): DatabaseHandle {
  const timers: Array<ReturnType<typeof setInterval>> = [];
  const primaryPool = createPool(options, options.url, "primary", timers);
  const primary = instrument(new PrismaClient({ adapter: new PrismaPg(primaryPool) }), "primary");

  const replicaPool = options.replicaUrl
    ? createPool(options, options.replicaUrl, "replica", timers)
    : null;
  const reader = replicaPool
    ? instrument(new PrismaClient({ adapter: new PrismaPg(replicaPool) }), "replica")
    : primary;

  options.logger.info(
    { replica: replicaPool !== null, poolSize: options.poolSize ?? 10 },
    "database configured",
  );

  return {
    prisma: primary,
    reader,
    async ping(role = "primary") {
      const start = performance.now();
      const client = role === "replica" ? reader : primary;
      await client.$queryRaw`SELECT 1`;
      return performance.now() - start;
    },
    async close() {
      for (const timer of timers.splice(0)) clearInterval(timer);
      await primary.$disconnect().catch(() => undefined);
      if (reader !== primary) await reader.$disconnect().catch(() => undefined);
      await primaryPool.end().catch(() => undefined);
      await replicaPool?.end().catch(() => undefined);
    },
  };
}

export type DatabaseClient = DatabaseHandle["prisma"];
