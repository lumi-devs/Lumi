import { Events } from "discord.js";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import type { Container } from "#src/lib/Services.js";
import { shardStatus } from "#src/observability/Index.ts";
import { recordShardReady } from "#src/lib/sharding/ShardTelemetry.js";

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
