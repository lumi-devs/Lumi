import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import { Events } from "discord.js";

export const shardResumeListener = defineListener({
  name: "shardResume",
  event: Events.ShardResume,
  execute: async () => {},
});
