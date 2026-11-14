import { Events } from "discord.js";
import { defineListener } from "@listeners/ListenerDef.js";
import type { Container } from "@lib/Services.js";
import { shardStatus } from "@observability/Index.ts";
import { recordShardReady } from "@lib/sharding/ShardTelemetry.js";

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
