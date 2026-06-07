import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { shardStatus } from "@lumi/observability";

@ApplyOptions<Listener.Options>({ event: Events.ShardResume })
export class ShardResumeListener extends Listener<typeof Events.ShardResume> {
  public run(id: number, replayedEvents: number) {
    shardStatus.set({ shard: String(id) }, 1);
    this.container.logger.info(
      `[Shard ${id}] Resumed — ${replayedEvents} events replayed`,
    );
  }
}
