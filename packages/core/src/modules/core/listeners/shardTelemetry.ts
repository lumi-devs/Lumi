import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { Status } from "discord.js";
import { getEventLoopLagP99Ms } from "@lumi/observability";
import {
  DefaultClusterName,
  DefaultPublishIntervalMs,
  ShardTelemetryPublisher,
  getLastReadyAt,
  type ShardTelemetrySample,
} from "#lib/sharding/shard-telemetry.js";
import { getClusterName, getConsumerId } from "#lib/env.js";

const BytesPerMb = 1024 * 1024;

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
      const memory = process.memoryUsage();
      const eventLoopLagP99Ms = getEventLoopLagP99Ms();
      const memoryRssMb = Math.round((memory.rss / BytesPerMb) * 10) / 10;
      const heapUsedMb = Math.round((memory.heapUsed / BytesPerMb) * 10) / 10;
      const uptimeSec = Math.round(process.uptime());
      const pid = process.pid;
      return [...client.ws.shards.values()].map((shard) => ({
        shardId: shard.id,
        status: Status[shard.status] ?? String(shard.status),
        ping: shard.ping >= 0 ? Math.round(shard.ping) : null,
        guildCount: guildsByShard.get(shard.id) ?? 0,
        shardCount,
        eventLoopLagP99Ms,
        memoryRssMb,
        heapUsedMb,
        uptimeSec,
        pid,
        lastReadyAt: getLastReadyAt(shard.id),
      }));
    };

    this.#publisher = new ShardTelemetryPublisher({
      redis,
      clusterName: getClusterName() ?? DefaultClusterName,
      replicaId: getConsumerId(),
      sample,
      intervalMs: DefaultPublishIntervalMs,
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
