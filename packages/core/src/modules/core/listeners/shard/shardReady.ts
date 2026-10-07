import { Events } from "discord.js";
import { defineListener } from "#lib/listeners/listener-def.js";
import type { Container } from "#lib/services.js";
import { shardStatus } from "@lumi/observability";
import { recordShardReady } from "#lib/sharding/shard-telemetry.js";

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
