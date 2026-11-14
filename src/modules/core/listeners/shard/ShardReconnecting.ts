import { Events } from "discord.js";
import { defineListener } from "@listeners/ListenerDef.js";
import type { Container } from "@lib/Services.js";
import { shardStatus } from "@observability/Index.ts";

export const shardReconnectingListener = defineListener({
  name: "shardReconnectingListener",
  event: Events.ShardReconnecting,
  execute(services: Container, id: number) {
    shardStatus.set({ shard: String(id) }, 0);
    services.logger.warn(`[Shard ${id}] Reconnecting…`);
  },
});
