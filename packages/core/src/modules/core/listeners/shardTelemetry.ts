import { Events } from "discord.js";
import { defineListener } from "@lumi/lib/listeners/listener-def.js";
import type { Container } from "@lumi/lib/services.js";
import { Status } from "discord.js";
import { getEventLoopLagP99Ms } from "@lumi/observability";
import {
  DefaultClusterName,
  DefaultPublishIntervalMs,
  ShardTelemetryPublisher,
  getLastReadyAt,
  type ShardTelemetrySample,
} from "@lumi/lib/sharding/shard-telemetry.js";
import { LumiPinoLogger } from "@lumi/lib/logging/pino-logger.js";
import { getClusterName, getConsumerId } from "@lumi/lib/env.js";

const BytesPerMb = 1024 * 1024;

let publisher: ShardTelemetryPublisher | undefined;
let removeLogListener: (() => void) | undefined;

export const shardTelemetryListener = defineListener({
  name: "shardTelemetryListener",
  event: Events.ClientReady,
  execute(services: Container) {
    if (publisher) return;
    const { client, valkey, logger } = services;

    const cluster = getClusterName() ?? DefaultClusterName;
    const shardIds = client.ws.shards.size > 0 ? [...client.ws.shards.keys()] : [0];

    // Push pre-ready buffered startup logs to each shard's Valkey log ring
    const initialLogs = LumiPinoLogger.getBufferedLogs();
    for (const id of shardIds) {
      const key = `lumi:cluster:${cluster}:shardlogs:${id}`;
      for (const entry of initialLogs) {
        void valkey.rpush(key, JSON.stringify(entry));
      }
      const shard = client.ws.shards.get(id);
      const readyMsg = JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "info",
        message: `[Shard ${id}] Gateway connected and ready (status: ${shard ? Status[shard.status] : "Ready"}, ${client.guilds.cache.size} guilds cached)`,
      });
      void valkey.rpush(key, readyMsg);
      void valkey.ltrim(key, -100, -1);
      void valkey.expire(key, 86400);
    }

    removeLogListener = LumiPinoLogger.addListener((entry) => {
      const currentShards = client.ws.shards.size > 0 ? [...client.ws.shards.keys()] : [0];
      const raw = JSON.stringify(entry);
      for (const id of currentShards) {
        const key = `lumi:cluster:${cluster}:shardlogs:${id}`;
        void valkey
          .rpush(key, raw)
          .then(() => {
            void valkey.ltrim(key, -100, -1);
            void valkey.expire(key, 86400);
          })
          .catch(() => {});
      }
    });

    client.on("shardDisconnect", (event, id) => {
      const key = `lumi:cluster:${cluster}:shardlogs:${id}`;
      void valkey.rpush(
        key,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "warn",
          message: `[Shard ${id}] Disconnected from Discord gateway (code: ${event.code}, reason: ${event.reason || "unknown"})`,
        }),
      );
      void valkey.ltrim(key, -100, -1);
    });

    client.on("shardReconnecting", (id) => {
      const key = `lumi:cluster:${cluster}:shardlogs:${id}`;
      void valkey.rpush(
        key,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "info",
          message: `[Shard ${id}] Reconnecting to Discord gateway...`,
        }),
      );
      void valkey.ltrim(key, -100, -1);
    });

    client.on("shardResume", (id, replayedEvents) => {
      const key = `lumi:cluster:${cluster}:shardlogs:${id}`;
      void valkey.rpush(
        key,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "info",
          message: `[Shard ${id}] Resumed gateway session (${replayedEvents} events replayed)`,
        }),
      );
      void valkey.ltrim(key, -100, -1);
    });

    client.on("shardError", (error, id) => {
      const key = `lumi:cluster:${cluster}:shardlogs:${id}`;
      void valkey.rpush(
        key,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "error",
          message: `[Shard ${id}] Gateway error: ${error.message || String(error)}`,
        }),
      );
      void valkey.ltrim(key, -100, -1);
    });

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

    publisher = new ShardTelemetryPublisher({
      valkey,
      clusterName: getClusterName() ?? DefaultClusterName,
      replicaId: getConsumerId(),
      sample,
      intervalMs: DefaultPublishIntervalMs,
      log: (level, msg, meta) => logger[level](`[ShardTelemetry] ${msg}`, meta),
    });

    void publisher.publish().catch((err: unknown) => {
      logger.warn("[ShardTelemetry] initial publish failed", { err: String(err) });
    });
    publisher.start();
  },
  onDetach() {
    removeLogListener?.();
    removeLogListener = undefined;
    void publisher?.stop();
    publisher = undefined;
  },
});
