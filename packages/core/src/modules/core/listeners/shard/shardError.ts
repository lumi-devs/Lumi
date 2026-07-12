import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { shardStatus } from "@lumi/observability";

@ApplyOptions<Listener.Options>({ event: Events.ShardError })
export class ShardErrorListener extends Listener<typeof Events.ShardError> {
  public run(error: Error, id: number) {
    shardStatus.set({ shard: String(id) }, 0);
    this.container.logger.error(
      `[Shard ${id}] Connection error: ${error.stack ?? error.message}`,
    );
  }
}
