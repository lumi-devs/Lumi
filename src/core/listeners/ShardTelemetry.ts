import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import { Events } from "discord.js";

export const shardTelemetryListener = defineListener({
  name: "shardTelemetry",
  event: Events.ClientReady,
  execute: async () => {},
});
