import { Events } from "discord.js";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import type { Container } from "#src/lib/Services.js";
import { shardStatus } from "#src/observability/Index.ts";

export const shardReconnectingListener = defineListener({
  name: "shardReconnectingListener",
  event: Events.ShardReconnecting,
  execute(services: Container, id: number) {
    shardStatus.set({ shard: String(id) }, 0);
    services.logger.warn(`[Shard ${id}] Reconnecting…`);
  },
});
