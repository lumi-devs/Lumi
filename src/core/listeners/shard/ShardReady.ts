import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import { Events } from "discord.js";

export const shardReadyListener = defineListener({
  name: "shardReady",
  event: Events.ShardReady,
  execute: async () => {},
});
