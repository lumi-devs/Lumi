import { container } from "#src/lib/Services.js";
import { dbQueryDuration, dbSlowQueriesTotal } from "#src/observability/Index.ts";
import { resolveDbSlowQueryThresholdMs } from "#src/lib/Env.js";

const SlowQueryThresholdMs = resolveDbSlowQueryThresholdMs();

export function recordQueryMetrics(
  model: string | undefined,
  operation: string,
  elapsedMs: number,
): void {

  const modelLabel = model ?? "raw";
  dbQueryDuration.observe({ model: modelLabel, operation }, elapsedMs / 1000);

  if (elapsedMs > SlowQueryThresholdMs) {
    dbSlowQueriesTotal.inc({ model: modelLabel, operation });
    container.logger?.warn(
      `[Prisma Diagnostic] Query exceeded ${SlowQueryThresholdMs}ms: ${modelLabel}.${operation} took ${Math.round(elapsedMs)}ms`,
    );
  }
}
