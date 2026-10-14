import { container } from "#src/lib/Services.js";
import { systemRpc, type SystemStatusData } from "#src/contracts/rpc/Index.ts";
import { streamConsumerLag, getEventLoopLagP99Ms } from "#src/observability/Index.ts";
import { implementRpc } from "#src/lib/rpc/Implement.js";
import { paginate, resolvePageSize } from "#src/lib/rpc/Validation.js";
import { authorize } from "#src/lib/api/permissions/Authorize.js";
import { getSystemStatus, type SystemStatusDeps } from "#src/lib/rpc/SystemStatus.js";

export async function closeSystemStatusResources(): Promise<void> {}

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
    pingValkey: async () => "PONG",
    readSchedulerHeartbeat: async () => null,
    readSchedulerQueueCounts: async () => ({ waiting: 0, active: 0, failed: 0, delayed: 0 }),
    readShardsSnapshot: async () => ({ total: 1, up: 1, stale: 0, worstLagMs: 0 }),
    readEventBusStats,
  };
}

export const systemRpcHandlers = implementRpc(systemRpc, {
  "system.dashboard.get": async () => {
    const [global, moduleStates] = await Promise.all([
      container.db.global.getGlobalConfig(),
      container.db.modules.getGlobalModuleStatesDetailed(),
    ]);
    const allModules = container.moduleStore
      .loaded()
      .map((mod) => ({
        name: mod.meta.name,
        displayName: mod.meta.displayName,
        emoji: mod.meta.emoji,
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
      guildCount: container.client?.guilds?.cache?.size ?? 0,
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
      ...(input.guildId ? { guildId: input.guildId } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.action ? { action: input.action } : {}),
      ...(input.platform ? { platform: input.platform } : {}),
      take,
      ...(input.cursor ? { cursor: input.cursor } : {}),
    });
    return {
      entries: entries.map((entry) => ({
        id: entry.id,
        guildId: entry.guildId,
        userId: entry.userId,
        action: entry.action,
        platform: entry.platform,
        details: entry.details,
        createdAt: entry.createdAt.toISOString(),
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
      entries: entries.map((entry) => ({
        id: "id" in entry ? String(entry.id) : entry.userId,
        userId: entry.userId,
        reason: entry.reason,
        blockedBy: entry.blockedBy,
        createdAt: entry.createdAt.toISOString(),
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
    return {
      clusterName: "default",
      shardCount: 1,
      observedAt: new Date().toISOString(),
      replicas: [],
      shards: [
        {
          shardId: 0,
          replicaId: "local",
          status: "Ready",
          ping: container.client?.ws?.ping ?? 0,
          guildCount: container.client?.guilds?.cache?.size ?? 0,
          lastHeartbeatAt: new Date().toISOString(),
          uptimeSec: Math.round(process.uptime()),
          pid: process.pid,
          lastReadyAt: new Date().toISOString(),
          stale: false,
          logs: [],
        },
      ],
      missingShardIds: [],
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
