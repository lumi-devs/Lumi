import "./telemetry.js";
import "@lumi/core/setup";
import { bootstrapClientApp } from "@lumi/core";

await bootstrapClientApp({
  role: "scheduler",
  onlineMessage: "[Scheduler] Online (BullMQ owner; no Discord WS)",
});

