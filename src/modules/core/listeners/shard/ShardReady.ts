import { Events } from "discord.js";
import { defineListener } from "@listeners/ListenerDef.js";
import type { Container } from "@lib/Services.js";
import { shardStatus } from "@observability/Index.ts";
import { recordShardReady } from "@lib/sharding/ShardTelemetry.js";

export const shardReadyListener = defineListener({
  name: "shardReadyListener",
  event: Events.ShardReady,
  execute(services: Container, id: number, unavailableGuilds: Set<string> | undefined) {
    shardStatus.set({ shard: String(id) }, 1);
    recordShardReady(id);
    services.logger.info(
      `[Shard ${id}] Ready - ${unavailableGuilds?.size ?? 0} unavailable guilds`,
    );
  },
});
