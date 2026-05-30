// Side-effect bootstrap: MUST be the first import in main.ts so tracing hooks the
// transports (http/pg/ioredis/amqplib) before they are loaded by the client.
import { bootstrapTelemetry } from "@lumi/observability";

bootstrapTelemetry("worker");
