import { Events } from "discord.js";
import { defineListener } from "#lib/listeners/listener-def.js";
import type { Container } from "#lib/services.js";
import { shardStatus } from "@lumi/observability";

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
