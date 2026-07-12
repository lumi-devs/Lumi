import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { shardStatus } from "@lumi/observability";

@ApplyOptions<Listener.Options>({ event: Events.ShardReconnecting })
export class ShardReconnectingListener extends Listener<
  typeof Events.ShardReconnecting
> {
  public run(id: number) {
    shardStatus.set({ shard: String(id) }, 0);
    this.container.logger.warn(`[Shard ${id}] Reconnecting…`);
  }
}
