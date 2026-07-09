// Side-effect bootstrap: MUST be the first import in main.ts so tracing hooks the
// transports (http/amqplib) before they are loaded elsewhere.
import { bootstrapTelemetry } from "@lumi/observability";

bootstrapTelemetry("dashboard");
