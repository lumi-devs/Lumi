// This module must be imported first in shard-client.ts, before any
// instrumented library is pulled in transitively (ESM hoists imports) - see
// packages/observability/src/boot.ts's top-of-file comment.
import { bootstrapTelemetry } from "@lumi/observability";

// Duplicated rather than imported from @lumi/core's isPrimaryShard, so this
// file doesn't itself pull in @lumi/core (and everything it transitively
// imports) before the tracing patch above has run.
function isPrimaryShard(): boolean {
  if (!process.env["SHARDING_MANAGER"]) return true;
  const raw = process.env["SHARDS"];
  if (!raw) return true;
  try {
    const parsed: unknown = JSON.parse(raw);
    const ids = Array.isArray(parsed) ? parsed : [parsed];
    return ids.includes(0);
  } catch {
    return true;
  }
}

bootstrapTelemetry("worker", { exposeHttp: isPrimaryShard() });
