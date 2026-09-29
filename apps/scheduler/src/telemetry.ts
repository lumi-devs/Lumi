// This module must be imported first in main.ts, before any instrumented
// library is pulled in transitively (ESM hoists imports) - see
// packages/observability/src/boot.ts's top-of-file comment.
import { bootstrapTelemetry } from "@lumi/observability";

bootstrapTelemetry("scheduler");
