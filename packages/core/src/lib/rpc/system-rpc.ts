import { container } from "@sapphire/framework";
import { systemRpc } from "@lumi/contracts/rpc";
import { getClusterName } from "#lib/env.js";
import { PermitResolver } from "#lib/permissions/PermitResolver.js";
import { implementRpc } from "#lib/rpc/implement.js";
import { paginate } from "#lib/rpc/validation.js";
import {
  DefaultClusterName,
  readClusterShards,
} from "#lib/sharding/shard-telemetry.js";

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
    const { page, pageSize, skip, take } = paginate(input);
    const { entries, total } = await container.db.audit.listAuditLogs({
      guildId: input.guildId,
      userId: input.userId,
      action: input.action,
      platform: input.platform,
      skip,
      take,
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
      page,
      pageSize,
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
    if (PermitResolver.isBotOwner(input.userId)) {
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
      })),
      missingShardIds: snapshot.missingShardIds,
    };
  },
});
