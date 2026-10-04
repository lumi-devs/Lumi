import { container } from "@sapphire/framework";
import { systemRpc, type SystemStatusData } from "@lumi/contracts/rpc";
import { streamConsumerLag, getEventLoopLagP99Ms } from "@lumi/observability";
import { Queue } from "bullmq";
import {
  getScheduledTasksConnectionOptions,
  SCHEDULED_TASKS_QUEUE_NAME,
} from "#lib/client/scheduled-tasks-queue.js";
import { getClusterName } from "#lib/env.js";
import { authorize } from "#lib/permissions/authorize.js";
import { implementRpc } from "#lib/rpc/implement.js";
import { paginate, resolvePageSize } from "#lib/rpc/validation.js";
import { readSchedulerHeartbeat } from "#lib/scheduler-heartbeat.js";
import {
  DefaultClusterName,
  DefaultPublishIntervalMs,
  isShardStale,
  readClusterShards,
} from "#lib/sharding/shard-telemetry.js";
import { getSystemStatus, type SystemStatusDeps } from "#lib/rpc/system-status.js";

/** A shard with no fresh row in 3 publish intervals is flagged stale in the fleet view. */
const StaleAfterMs = DefaultPublishIntervalMs * 3;

// A bare, read-only BullMQ `Queue` handle against the shared scheduled-tasks
// queue - the same "producer-only" trick `scheduler-producer.ts` uses, since
// this process (`apps/api` in practice) never runs `@sapphire/plugin-
// scheduled-tasks`'s own `Queue`/`Worker` (see `api-container-services.ts`).
// Lazily created and cached for the process lifetime rather than per-call.
let scheduledTasksQueue: Queue | null = null;

function getScheduledTasksQueue(): Queue {
  scheduledTasksQueue ??= new Queue(SCHEDULED_TASKS_QUEUE_NAME, {
    connection: getScheduledTasksConnectionOptions(),
  });
  return scheduledTasksQueue;
}

/** Closes the lazily-created read-only queue handle, if one was ever opened. Called from shutdown drain sequences. */
export async function closeSystemStatusResources(): Promise<void> {
  if (scheduledTasksQueue) {
    await scheduledTasksQueue.close();
    scheduledTasksQueue = null;
  }
}

/** Sums the pending-entries gauge across every stream/group this process has sampled; null if it has sampled none. */
async function readEventBusStats(): Promise<{ pending: number | null; lag: number | null }> {
  const metric = await streamConsumerLag.get();
  if (metric.values.length === 0) return { pending: null, lag: null };
  const pending = metric.values.reduce((sum, v) => sum + v.value, 0);
  return { pending, lag: null };
}

const StatusCacheMs = 3_000;
let statusCache: { at: number; value: Promise<SystemStatusData> } | null = null;

/** Clears the module-level status snapshot cache this file keeps, so a test can force a fresh aggregation. */
export function resetSystemStatusCacheForTests(): void {
  statusCache = null;
}

function buildSystemStatusDeps(): SystemStatusDeps {
  return {
    uptimeSec: () => Math.round(process.uptime()),
    eventLoopLagP99Ms: () => getEventLoopLagP99Ms(),
    probePostgresLatencyMs: () => container.db.probePrisma(),
    pingRedis: () => container.redis.ping(),
    readSchedulerHeartbeat: async () => {
      const heartbeat = await readSchedulerHeartbeat(container.redis);
      if (!heartbeat) return null;
      return { holder: heartbeat.holder, ageMs: Date.now() - heartbeat.updatedAt };
    },
    readSchedulerQueueCounts: async () => {
      const counts = await getScheduledTasksQueue().getJobCounts(
        "waiting",
        "active",
        "failed",
        "delayed",
      );
      return {
        waiting: counts["waiting"] ?? 0,
        active: counts["active"] ?? 0,
        failed: counts["failed"] ?? 0,
        delayed: counts["delayed"] ?? 0,
      };
    },
    readShardsSnapshot: async () => {
      const snapshot = await readClusterShards({
        redis: container.redis,
        clusterName: getClusterName() ?? DefaultClusterName,
      });
      const now = Date.now();
      let up = 0;
      let stale = 0;
      let worstLagMs: number | null = null;
      for (const shard of snapshot.shards) {
        const shardStale = isShardStale(shard, now, StaleAfterMs);
        if (shardStale) stale++;
        else if (shard.status === "Ready") up++;
        if (shard.eventLoopLagP99Ms !== null) {
          worstLagMs = Math.max(worstLagMs ?? 0, shard.eventLoopLagP99Ms);
        }
      }
      return { total: snapshot.shardCount, up, stale, worstLagMs };
    },
    readEventBusStats,
  };
}

export const systemRpcHandlers = implementRpc(systemRpc, {
  "system.dashboard.get": async () => {
    const [global, moduleStates, shardSnapshot] = await Promise.all([
      container.db.global.getGlobalConfig(),
      container.db.modules.getGlobalModuleStatesDetailed(),
      readClusterShards({
        redis: container.redis,
        clusterName: getClusterName() ?? DefaultClusterName,
      }),
    ]);
    const allModules = container.stores
      .get("modules")
      .loaded()
      .map((m) => ({
        name: m.meta.name,
        displayName: m.meta.displayName,
        emoji: m.meta.emoji,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    return {
      global: {
        botName: global.botName,
        defaultPrefix: global.defaultPrefix,
        maintenanceMode: global.maintenanceMode,
        maintenanceMessage: global.maintenanceMessage,
        inviteUrl: global.inviteUrl,
        supportGuildId: global.supportGuildId,
      },
      moduleStates,
      allModules,
      guildCount: shardSnapshot.shards.reduce(
        (sum, shard) => sum + shard.guildCount,
        0,
      ),
    };
  },

  "system.maintenance.set": async ({ input }) => {
    const global = await container.db.global.setMaintenanceMode(
      input.maintenanceMode,
      input.maintenanceMessage,
    );
    return { success: true, maintenanceMode: global.maintenanceMode };
  },

  "system.module.toggle": async ({ input }) => {
    const moduleStore = container.stores.get("modules");
    if (!moduleStore) {
      throw new Error("ModuleStore not initialized");
    }
    await moduleStore.setEnabled(input.moduleName, input.enabled, input.reason);
    return { success: true, moduleName: input.moduleName, enabled: input.enabled };
  },

  "system.module.clear": async ({ input }) => {
    await container.db.modules.clearModuleGlobalState(input.moduleName);
    return { success: true, moduleName: input.moduleName };
  },

  "system.identity.set": async ({ input }) => {
    const { inviteUrl, supportGuildId } = input;
    const global = await container.db.global.updateGlobalConfig({
      ...(inviteUrl !== undefined && { inviteUrl }),
      ...(supportGuildId !== undefined && { supportGuildId }),
    });
    return {
      success: true,
      inviteUrl: global.inviteUrl,
      supportGuildId: global.supportGuildId,
    };
  },

  // Unlike `guild.audit.list`, this reads the ledger across every guild, so it
  // stays bot-owner only even when a `guildId` filter narrows it to one.
  "system.audit.list": async ({ input }) => {
    const { pageSize, take } = resolvePageSize(input);
    const { entries, total, nextCursor } = await container.db.audit.listAuditLogs({
      guildId: input.guildId,
      userId: input.userId,
      action: input.action,
      platform: input.platform,
      take,
      cursor: input.cursor,
    });
    return {
      entries: entries.map((e) => ({
        id: e.id,
        guildId: e.guildId,
        userId: e.userId,
        action: e.action,
        platform: e.platform,
        details: e.details,
        createdAt: e.createdAt.toISOString(),
      })),
      total,
      pageSize,
      nextCursor,
    };
  },

  "system.blocklist.list": async ({ input }) => {
    const { page, pageSize, skip, take } = paginate(input);
    const { entries, total } = await container.db.access.listBlocklist(null, {
      skip,
      take,
    });
    return {
      entries: entries.map((e) => ({
        id: "id" in e ? String(e.id) : e.userId,
        userId: e.userId,
        reason: e.reason,
        blockedBy: e.blockedBy,
        createdAt: e.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  },

  "system.blocklist.add": async ({ actorId, input }) => {
    if (await authorize({ userId: input.userId }, { kind: "botOwner" })) {
      throw new Error("Cannot blocklist a bot owner");
    }
    if (await container.db.access.isUserBlocklisted(input.userId, null)) {
      throw new Error(`${input.userId} is already blocklisted globally`);
    }
    await container.db.access.addBlocklistEntry(
      input.userId,
      actorId,
      input.reason,
      null,
    );
    return { success: true, userId: input.userId };
  },

  "system.blocklist.remove": async ({ input }) => {
    await container.db.access.removeBlocklistEntry(input.userId, null);
    return { success: true, userId: input.userId };
  },

  // Answered from shared Redis rather than this process's own `client.ws`: the
  // RPC lands on whichever worker picks it up, which owns at most its own slice
  // of the shard range.
  "system.shards.get": async () => {
    const snapshot = await readClusterShards({
      redis: container.redis,
      clusterName: getClusterName() ?? DefaultClusterName,
    });
    const now = Date.now();
    return {
      clusterName: snapshot.clusterName,
      shardCount: snapshot.shardCount,
      observedAt: new Date(snapshot.observedAt).toISOString(),
      replicas: snapshot.replicas.map((r) => ({
        replicaId: r.replicaId,
        reportingShardIds: r.reportingShardIds,
      })),
      shards: snapshot.shards.map((s) => ({
        shardId: s.shardId,
        replicaId: s.replicaId,
        status: s.status,
        ping: s.ping,
        guildCount: s.guildCount,
        lastHeartbeatAt: new Date(s.updatedAt).toISOString(),
        eventLoopLagP99Ms: s.eventLoopLagP99Ms,
        memoryRssMb: s.memoryRssMb,
        heapUsedMb: s.heapUsedMb,
        uptimeSec: s.uptimeSec,
        pid: s.pid,
        lastReadyAt: s.lastReadyAt === null ? null : new Date(s.lastReadyAt).toISOString(),
        stale: isShardStale(s, now, StaleAfterMs),
        logs: s.logs ?? [],
      })),
      missingShardIds: snapshot.missingShardIds,
    };
  },

  "system.flags.list": async () => {
    const flags = await container.db.featureFlags.listFlags();
    return {
      flags: flags.map((flag) => ({
        key: flag.key,
        description: flag.description,
        enabled: flag.enabled,
        rolloutPercent: flag.rolloutPercent,
        updatedAt: (flag.updatedAt instanceof Date ? flag.updatedAt : new Date(flag.updatedAt ?? Date.now())).toISOString(),
        updatedBy: flag.updatedBy,
      })),
    };
  },

  "system.flags.set": async ({ actorId, input }) => {
    const flag = await container.db.featureFlags.setFlag({
      key: input.key,
      description: input.description,
      enabled: input.enabled,
      rolloutPercent: input.rolloutPercent,
      updatedBy: actorId,
    });
    return {
      success: true,
      flag: {
        key: flag.key,
        description: flag.description,
        enabled: flag.enabled,
        rolloutPercent: flag.rolloutPercent,
        updatedAt: (flag.updatedAt instanceof Date ? flag.updatedAt : new Date(flag.updatedAt ?? Date.now())).toISOString(),
        updatedBy: flag.updatedBy,
      },
    };
  },

  "system.flags.override.set": async ({ input }) => {
    const override = await container.db.featureFlags.setOverride(input);
    return {
      success: true,
      override: {
        id: override.id,
        flagKey: override.flagKey,
        guildId: override.guildId,
        enabled: override.enabled,
        createdAt: (override.createdAt instanceof Date ? override.createdAt : new Date(override.createdAt ?? Date.now())).toISOString(),
      },
    };
  },

  "system.flags.override.delete": async ({ input }) => {
    const deleted = await container.db.featureFlags.deleteOverride(input.flagKey, input.guildId);
    return { success: deleted };
  },

  // Cached briefly: a status page gets polled, and every probe it fans out to
  // (Postgres, Redis, the scheduler heartbeat/queue, shard telemetry) is a
  // real round trip - a cache-stampede-free few seconds keeps that fan-out
  // off the hot path without staling the page noticeably.
  "system.status.get": () => {
    const now = Date.now();
    if (!statusCache || now - statusCache.at > StatusCacheMs) {
      const entry = { at: now, value: getSystemStatus(buildSystemStatusDeps()) };
      statusCache = entry;
      // `getSystemStatus` itself never rejects (every probe is caught and
      // mapped to a `down` component) - this only guards a bug in that
      // contract so a thrown error doesn't poison the cache for `StatusCacheMs`.
      entry.value.catch(() => {
        if (statusCache === entry) statusCache = null;
      });
    }
    return statusCache.value;
  },
});
