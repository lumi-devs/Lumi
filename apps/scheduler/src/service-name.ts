// Runs before @lumi/core/setup. We set both SERVICE_NAME (for telemetry) and
// LUMI_ROLE here — setup.ts reads LUMI_ROLE to decide whether to register
// the BullMQ-backed scheduled-tasks plugin.
process.env["SERVICE_NAME"] ??= "scheduler";
process.env["LUMI_ROLE"] ??= "scheduler";
