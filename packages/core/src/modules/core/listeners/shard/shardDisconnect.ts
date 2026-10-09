import { Events } from "discord.js";
import { defineListener } from "#lib/listeners/listener-def.js";
import type { Container } from "#lib/services.js";
import type { CloseEvent } from "discord.js";
import { shardStatus } from "@lumi/observability";

export const shardDisconnectListener = defineListener({
  name: "shardDisconnectListener",
  event: Events.ShardDisconnect,
  execute(services: Container, event: CloseEvent, id: number) {
    shardStatus.set({ shard: String(id) }, 0);
    services.logger.warn(
      `[Shard ${id}] Disconnected - code ${event.code}`,
    );
  },
});
