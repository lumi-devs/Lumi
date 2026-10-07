import { Events } from "discord.js";
import { defineListener } from "#lib/listeners/listener-def.js";
import type { Container } from "#lib/services.js";
import { shardStatus } from "@lumi/observability";

export const shardReconnectingListener = defineListener({
  name: "shardReconnectingListener",
  event: Events.ShardReconnecting,
  execute(services: Container, id: number) {
    shardStatus.set({ shard: String(id) }, 0);
    services.logger.warn(`[Shard ${id}] Reconnecting…`);
  },
});
