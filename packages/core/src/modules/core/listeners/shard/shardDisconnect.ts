import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { CloseEvent } from "discord.js";
import { shardStatus } from "@lumi/observability";

@ApplyOptions<Listener.Options>({ event: Events.ShardDisconnect })
export class ShardDisconnectListener extends Listener<
  typeof Events.ShardDisconnect
> {
  public run(event: CloseEvent, id: number) {
    shardStatus.set({ shard: String(id) }, 0);
    this.container.logger.warn(
      `[Shard ${id}] Disconnected — code ${event.code}`,
    );
  }
}
