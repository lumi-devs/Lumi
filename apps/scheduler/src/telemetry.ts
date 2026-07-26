import { bootstrapTelemetry } from "@lumi/observability";

process.env["SERVICE_NAME"] ??= "scheduler";
process.env["LUMI_ROLE"] ??= "scheduler";

bootstrapTelemetry("scheduler");
