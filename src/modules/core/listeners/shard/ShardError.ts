import { Events } from "discord.js";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import type { Container } from "#src/lib/Services.js";
import { shardStatus } from "#src/observability/Index.ts";

export const shardErrorListener = defineListener({
  name: "shardErrorListener",
  event: Events.ShardError,
  execute(services: Container, error: Error, id: number) {
    shardStatus.set({ shard: String(id) }, 0);
    services.logger.error(
      `[Shard ${id}] Connection error: ${error.stack ?? error.message}`,
    );
  },
});
