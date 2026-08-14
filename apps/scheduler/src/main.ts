import "./telemetry.js";
import "@lumi/core/setup";
import { bootstrapClientApp } from "@lumi/core";

// Both roles start an RPC HTTP server, and both read the same root `.env`
// (apps/*/.env are symlinks to it), so the worker's 8091 default has to be
// stepped around here rather than in config. An explicit RPC_HTTP_PORT still
// wins — this only supplies the fallback.
process.env["RPC_HTTP_PORT"] ??= "8092";

await bootstrapClientApp({
  role: "scheduler",
  onlineMessage: "[Scheduler] Online (BullMQ owner; no Discord WS)",
});

