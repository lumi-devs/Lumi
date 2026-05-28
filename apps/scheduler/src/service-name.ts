// Runs before @ember/core/setup. We set both SERVICE_NAME (for telemetry) and
// EMBER_ROLE here — setup.ts reads EMBER_ROLE to decide whether to register
// the BullMQ-backed scheduled-tasks plugin (S5).
process.env["SERVICE_NAME"] ??= "scheduler";
process.env["EMBER_ROLE"] ??= "scheduler";
