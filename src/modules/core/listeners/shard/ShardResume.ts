import { Events } from "discord.js";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import type { Container } from "#src/lib/Services.js";
import { shardStatus } from "#src/observability/Index.ts";
import { recordShardReady } from "#src/lib/sharding/ShardTelemetry.js";

export const shardResumeListener = defineListener({
  name: "shardResumeListener",
  event: Events.ShardResume,
  execute(services: Container, id: number, replayedEvents: number) {
    shardStatus.set({ shard: String(id) }, 1);
    recordShardReady(id);
    services.logger.info(
      `[Shard ${id}] Resumed - ${replayedEvents} events replayed`,
    );
  },
});
