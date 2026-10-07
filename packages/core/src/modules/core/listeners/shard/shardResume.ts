import { Events } from "discord.js";
import { defineListener } from "#lib/listeners/listener-def.js";
import type { Container } from "#lib/services.js";
import { shardStatus } from "@lumi/observability";
import { recordShardReady } from "#lib/sharding/shard-telemetry.js";

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
