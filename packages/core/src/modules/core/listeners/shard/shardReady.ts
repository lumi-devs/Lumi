import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { shardStatus } from "@lumi/observability";

@ApplyOptions<Listener.Options>({ event: Events.ShardReady })
export class ShardReadyListener extends Listener<typeof Events.ShardReady> {
  public run(id: number, unavailableGuilds: Set<string> | undefined) {
    shardStatus.set({ shard: String(id) }, 1);
    this.container.logger.info(
      `[Shard ${id}] Ready - ${unavailableGuilds?.size ?? 0} unavailable guilds`,
    );
  }
}
