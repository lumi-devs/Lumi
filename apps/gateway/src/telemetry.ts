// Side-effect bootstrap: MUST be the first import in main.ts so tracing hooks
// the transports (http/ioredis) before they are loaded by the client.
import { bootstrapTelemetry } from "@lumi/observability";

bootstrapTelemetry("gateway");
