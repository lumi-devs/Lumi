import { container } from "#src/lib/Services.js";
import { systemRpc, type SystemStatusData } from "#src/contracts/rpc/Index.ts";
import { streamConsumerLag, getEventLoopLagP99Ms } from "#src/observability/Index.ts";
import { Queue } from "bullmq";
import {
  getScheduledTasksConnectionOptions,
  SCHEDULED_TASKS_QUEUE_NAME,
} from "#src/lib/scheduler/Queue.js";
import { getClusterName } from "#src/lib/Env.js";
import { authorize } from "#src/lib/permissions/Authorize.js";
import { implementRpc } from "#src/lib/rpc/Implement.js";
import { paginate, resolvePageSize } from "#src/lib/rpc/Validation.js";
import { readSchedulerHeartbeat } from "#src/lib/scheduler/Heartbeat.js";
import {
  DefaultClusterName,
  DefaultPublishIntervalMs,
  isShardStale,
  readClusterShards,
} from "#src/lib/sharding/ShardTelemetry.js";
import { getSystemStatus, type SystemStatusDeps } from "#src/lib/rpc/SystemStatus.js";

const StaleAfterMs = DefaultPublishIntervalMs * 3;

let scheduledTasksQueue: Queue | null = null;

function getScheduledTasksQueue(): Queue {
  scheduledTasksQueue ??= new Queue(SCHEDULED_TASKS_QUEUE_NAME, {
    connection: getScheduledTasksConnectionOptions(),
  });
  return scheduledTasksQueue;
}

export async function closeSystemStatusResources(): Promise<void> {
  if (scheduledTasksQueue) {
    await scheduledTasksQueue.close();
    scheduledTasksQueue = null;
  }
}

async function readEventBusStats(): Promise<{ pending: number | null; lag: number | null }> {
  const metric = await streamConsumerLag.get();
  if (metric.values.length === 0) return { pending: null, lag: null };
  const pending = metric.values.reduce((sum, v) => sum + v.value, 0);
  return { pending, lag: null };
}

const StatusCacheMs = 3_000;
let statusCache: { at: number; value: Promise<SystemStatusData> } | null = null;

function buildSystemStatusDeps(): SystemStatusDeps {
  return {
    uptimeSec: () => Math.round(process.uptime()),
    eventLoopLagP99Ms: () => getEventLoopLagP99Ms(),
    probePostgresLatencyMs: () => container.db.probePrisma(),
    pingValkey: () => container.valkey.ping(),
    readSchedulerHeartbeat: async () => {
      const heartbeat = await readSchedulerHeartbeat(container.valkey);
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
        valkey: container.valkey,
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
        valkey: container.valkey,
        clusterName: getClusterName() ?? DefaultClusterName,
      }),
    ]);
    const allModules = container.moduleStore
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
    const moduleStore = container.moduleStore;
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

  "system.shards.get": async () => {
    const snapshot = await readClusterShards({
      valkey: container.valkey,
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

  "system.tokens.list": async () => {
    const tokens = await container.db.sharedTokens.listTokens();
    return {
      tokens: tokens.map((t) => ({
        service: t.service,
        updatedAt: (t.updatedAt instanceof Date ? t.updatedAt : new Date(t.updatedAt)).toISOString(),
      })),
    };
  },

  "system.tokens.set": async ({ input }) => {
    await container.db.sharedTokens.setToken(input.service, input.token);
    return { success: true };
  },

  "system.tokens.delete": async ({ input }) => {
    await container.db.sharedTokens.deleteToken(input.service);
    return { success: true };
  },

  "system.flags.override.delete": async ({ input }) => {
    const deleted = await container.db.featureFlags.deleteOverride(input.flagKey, input.guildId);
    return { success: deleted };
  },

  "system.status.get": () => {
    const now = Date.now();
    if (!statusCache || now - statusCache.at > StatusCacheMs) {
      const entry = { at: now, value: getSystemStatus(buildSystemStatusDeps()) };
      statusCache = entry;

      entry.value.catch(() => {
        if (statusCache === entry) statusCache = null;
      });
    }
    return statusCache.value;
  },
});
