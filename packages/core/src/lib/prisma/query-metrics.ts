import { container } from "@sapphire/framework";
import { dbQueryDuration, dbSlowQueriesTotal } from "@lumi/observability";
import { resolveDbSlowQueryThresholdMs } from "#lib/env.js";

const SlowQueryThresholdMs = resolveDbSlowQueryThresholdMs();

/**
 * Records the query-duration histogram and, above `SlowQueryThresholdMs`,
 * the slow-query counter + a diagnostic log line. Kept out of client.ts,
 * which constructs a real `pg.Pool`/`PrismaClient` at module load, so this
 * can be unit-tested without that side effect.
 */
export function recordQueryMetrics(
  model: string | undefined,
  operation: string,
  elapsedMs: number,
): void {
  // `model` is undefined for $queryRaw/$executeRaw - bucket those under
  // "raw" rather than letting the label go missing.
  const modelLabel = model ?? "raw";
  dbQueryDuration.observe({ model: modelLabel, operation }, elapsedMs / 1000);

  if (elapsedMs > SlowQueryThresholdMs) {
    dbSlowQueriesTotal.inc({ model: modelLabel, operation });
    container.logger?.warn(
      `[Prisma Diagnostic] Query exceeded ${SlowQueryThresholdMs}ms: ${modelLabel}.${operation} took ${Math.round(elapsedMs)}ms`,
    );
  }
}
