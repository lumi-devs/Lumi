import { bootstrapTelemetry } from "@lumi/observability";

bootstrapTelemetry(process.env["LUMI_ROLE"] === "scheduler" ? "scheduler" : "worker");
