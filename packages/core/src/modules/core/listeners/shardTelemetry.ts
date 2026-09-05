import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { Status } from "discord.js";
import {
  DefaultClusterName,
  ShardTelemetryPublisher,
  type ShardTelemetrySample,
} from "@lumi/sharding";
import { getClusterName, getConsumerId } from "#lib/env.js";

const PublishMs = 10_000;

@ApplyOptions<Listener.Options>({ event: Events.ClientReady })
export class ShardTelemetryListener extends Listener<typeof Events.ClientReady> {
  #publisher?: ShardTelemetryPublisher;

  public run() {
    if (this.#publisher) return;
    const { client, redis, logger } = this.container;

    const sample = (): ShardTelemetrySample[] => {
      const guildsByShard = new Map<number, number>();
      for (const guild of client.guilds.cache.values()) {
        guildsByShard.set(guild.shardId, (guildsByShard.get(guild.shardId) ?? 0) + 1);
      }
      const shardCount = client.options.shardCount ?? client.ws.shards.size;
      return [...client.ws.shards.values()].map((shard) => ({
        shardId: shard.id,
        status: Status[shard.status] ?? String(shard.status),
        ping: shard.ping >= 0 ? Math.round(shard.ping) : null,
        guildCount: guildsByShard.get(shard.id) ?? 0,
        shardCount,
      }));
    };

    this.#publisher = new ShardTelemetryPublisher({
      redis,
      clusterName: getClusterName() ?? DefaultClusterName,
      replicaId: getConsumerId(),
      sample,
      intervalMs: PublishMs,
      log: (level, msg, meta) => logger[level](`[ShardTelemetry] ${msg}`, meta),
    });

    void this.#publisher.publish().catch((err: unknown) => {
      logger.warn("[ShardTelemetry] initial publish failed", { err: String(err) });
    });
    this.#publisher.start();
  }

  public override onUnload() {
    void this.#publisher?.stop();
    return super.onUnload();
  }
}
