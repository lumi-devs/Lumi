import { container } from "@sapphire/framework";
import { registerRpcHandler, rpcHandlers } from "#lib/rpc/dispatch.js";
import { RpcActions } from "@lumi/contracts";
import { getUtility } from "#lib/module-system/Utility.js";
import {
  AuditListSchema,
  ConfigHistoryListSchema,
  ConfigHistoryRollbackSchema,
  ModuleDataListSchema,
  OverrideSetSchema,
  OverridesListSchema,
  paginate,
  parsePayload,
  requireGuildId,
  requireGuildManager,
  toRawConfigValue,
} from "../lib/helpers.js";

export function registerAuditRpcHandlers(): void {
  registerRpcHandler(RpcActions.guildAuditList, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const filter = parsePayload(AuditListSchema, req.data ?? {});
    const { page, pageSize, skip, take } = paginate(filter);

    const { entries, total } = await container.db.audit.listAuditLogs({
      guildId,
      userId: filter.userId,
      action: filter.action,
      platform: filter.platform,
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
  });

  registerRpcHandler(RpcActions.guildHistoryList, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const filter = parsePayload(ConfigHistoryListSchema, req.data ?? {});
    const { page, pageSize, skip, take } = paginate(filter);

    const { entries, total } =
      await container.db.configHistory.listGuildConfigHistory(guildId, {
        moduleName: filter.moduleName,
        key: filter.key,
        actorId: filter.actorId,
        skip,
        take,
      });

    return {
      entries: entries.map((e) => ({
        id: e.id,
        moduleName: e.moduleName,
        key: e.key,
        oldValue: e.oldValue,
        newValue: e.newValue,
        actorId: e.actorId,
        createdAt: e.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  });

  registerRpcHandler(RpcActions.guildHistoryRollback, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const { entryId } = parsePayload(ConfigHistoryRollbackSchema, req.data);

    const entry =
      await container.db.configHistory.getConfigHistoryEntry(entryId);
    if (!entry || entry.guildId !== guildId) {
      throw new Error(`History entry ${entryId} not found`);
    }

    if (entry.oldValue === null || entry.oldValue === undefined) {
      await container.db.config.deleteModuleConfigKey(
        guildId,
        entry.moduleName,
        entry.key,
      );
      return {
        success: true,
        moduleName: entry.moduleName,
        key: entry.key,
        value: null,
      };
    }

    const { coerced } = await getUtility("config").setConfig(
      guildId,
      entry.moduleName,
      entry.key,
      toRawConfigValue(entry.oldValue),
      req.actorId,
    );
    return {
      success: true,
      moduleName: entry.moduleName,
      key: entry.key,
      value: coerced,
    };
  });

  registerRpcHandler(RpcActions.guildOverridesList, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const { moduleName } = parsePayload(OverridesListSchema, req.data ?? {});

    const overrides =
      await container.db.configOverrides.listGuildConfigOverrides(
        guildId,
        moduleName,
      );

    return {
      overrides: overrides.map((o) => ({
        id: o.id,
        moduleName: o.moduleName,
        key: o.key,
        modelType: o.modelType,
        modelId: o.modelId,
        value: o.value,
      })),
    };
  });

  registerRpcHandler(RpcActions.guildOverridesSet, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const { moduleName, key, modelType, modelId, value } = parsePayload(
      OverrideSetSchema,
      req.data,
    );

    if (value === null || value === undefined) {
      const deleted = await container.db.configOverrides.deleteConfigOverride(
        { guildId, moduleName, key, modelType, modelId },
      );
      return { success: true, deleted };
    }

    await container.db.configOverrides.setConfigOverride({
      guildId,
      moduleName,
      key,
      modelType,
      modelId,
      value,
    });
    return { success: true, deleted: false };
  });

  registerRpcHandler(RpcActions.guildModuleDataList, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const filter = parsePayload(ModuleDataListSchema, req.data ?? {});
    const { page, pageSize, skip, take } = paginate(filter);

    const { entries, total } =
      await container.db.guildKV.listGuildModuleData(guildId, {
        moduleName: filter.moduleName,
        targetId: filter.targetId,
        key: filter.key,
        skip,
        take,
      });

    return { entries, total, page, pageSize };
  });
}

export function unregisterAuditRpcHandlers(): void {
  rpcHandlers.delete(RpcActions.guildAuditList);
  rpcHandlers.delete(RpcActions.guildHistoryList);
  rpcHandlers.delete(RpcActions.guildHistoryRollback);
  rpcHandlers.delete(RpcActions.guildOverridesList);
  rpcHandlers.delete(RpcActions.guildOverridesSet);
  rpcHandlers.delete(RpcActions.guildModuleDataList);
}
