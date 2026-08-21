import "./telemetry.js";
import "@lumi/core/setup";
import { bootstrapClientApp, getServiceRole } from "@lumi/core";

const role = getServiceRole();

// Both roles read the same root `.env` (LUMI_ROLE selects which one a given
// deployment/process is), so the worker's 8091 RPC port default has to be
// stepped around here rather than in config when running as scheduler. An
// explicit RPC_HTTP_PORT still wins - this only supplies the fallback.
if (role === "scheduler") {
  process.env["RPC_HTTP_PORT"] ??= "8092";
}

await bootstrapClientApp({
  role,
  onlineMessage:
    role === "scheduler"
      ? "[Scheduler] Online (BullMQ owner; no Discord WS)"
      : undefined,
});
