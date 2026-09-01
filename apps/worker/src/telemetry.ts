// This module must be imported first in shard-client.ts, before any
// instrumented library is pulled in transitively (ESM hoists imports) - see
// packages/observability/src/boot.ts's top-of-file comment.
import { bootstrapTelemetry } from "@lumi/observability";
import { isPrimaryShard } from "@lumi/core/env";

bootstrapTelemetry("worker", { exposeHttp: isPrimaryShard() });
