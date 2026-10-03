// Must be imported first before instrumented dependencies.
import { bootstrapTelemetry } from "@lumi/observability";
import { isPrimaryShard } from "@lumi/core/env";

bootstrapTelemetry("worker", { exposeHttp: isPrimaryShard() });
