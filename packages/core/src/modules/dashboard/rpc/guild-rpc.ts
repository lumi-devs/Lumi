import { container } from "@sapphire/framework";
import { registerRpcHandler, rpcHandlers } from "#lib/rpc/dispatch.js";
import { RPC_ACTIONS } from "@lumi/contracts";
import { getService } from "#lib/module-system/Service.js";
import { checkModulesEnabled } from "#lib/module-check.js";
import {
  ConfigSetSchema,
  GuildSettingsSchema,
  GuildSummariesSchema,
  ModuleToggleSchema,
  PICKABLE_CHANNEL_TYPES,
  parsePayload,
  runGuildSetup,
  toRawConfigValue,
  verifyGuildAccess,
} from "../lib/helpers.js";

export function registerGuildRpcHandlers(): void {
  registerRpcHandler(RPC_ACTIONS.guildDashboardGet, async (req) => {
    const { guildId, guild } = await verifyGuildAccess(req);

    const settings = await container.db.config.getGuildSettings(guildId);
    const moduleStore = container.stores.get("modules");
    const loadedModules = moduleStore.loaded();
    const moduleNames = loadedModules.map((m) => m.meta.name);

    const [enabledMap, allConfigsMap] = await Promise.all([
      checkModulesEnabled(guildId, moduleNames),
      container.db.config.getAllModuleConfigsForGuild(guildId),
    ]);

    const modules = loadedModules.map((m) => {
      const enabled = enabledMap.get(m.meta.name) ?? true;
      const guildModuleConfig = allConfigsMap.get(m.meta.name) ?? {};

      const config: Record<string, unknown> = {};
      if (m.meta.configFields) {
        for (const field of m.meta.configFields) {
          config[field.key] = guildModuleConfig[field.key] ?? field.default ?? null;
        }
      }

      return {
        name: m.meta.name,
        displayName: m.meta.displayName,
        emoji: m.meta.emoji,
        description: m.meta.description,
        version: m.meta.version,
        conflicts: m.meta.conflicts ?? [],
        dependencies: m.meta.dependencies ?? [],
        enabled,
        configFields: m.meta.configFields || [],
        config,
        isAddon: moduleStore.isAddonModule(m),
        category: m.meta.category ?? "System",
        dashboardHref: m.meta.dashboardHref ?? null,
      };
    });

    const botRoleId = guild.members.me?.roles.highest.id;
    const roles = guild.roles.cache
      .filter((r) => r.id !== guild.id)
      .map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        position: r.position,
        permissions: r.permissions.bitfield.toString(),
        isBotRole: r.id === botRoleId,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const channels = guild.channels.cache
      .filter((c) => PICKABLE_CHANNEL_TYPES.has(c.type))
      .map((c) => ({ id: c.id, name: c.name, type: c.type }));

    const members = guild.members.cache
      .filter((m) => !m.user.bot)
      .map((m) => ({
        id: m.id,
        username: m.user.username,
        displayName: m.displayName,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .slice(0, 200);

    return {
      name: guild.name,
      icon: guild.iconURL(),
      banner: guild.bannerURL(),
      memberCount: guild.memberCount,
      settings,
      modules,
      roles,
      channels,
      members,
    };
  });

  registerRpcHandler(RPC_ACTIONS.guildSummariesList, (req) => {
    const { guildIds } = parsePayload(GuildSummariesSchema, req.data);

    const summaries = guildIds.flatMap((guildId) => {
      const guild = container.client.guilds.cache.get(guildId);
      if (!guild) return [];
      return [
        {
          guildId,
          icon: guild.iconURL(),
          banner: guild.bannerURL(),
          memberCount: guild.memberCount,
        },
      ];
    });

    return { summaries };
  });

  registerRpcHandler(RPC_ACTIONS.guildModuleToggle, async (req) => {
    const { guildId } = await verifyGuildAccess(req);
    const { moduleName, enabled } = parsePayload(
      ModuleToggleSchema,
      req.data,
    );

    if (moduleName === "core")
      throw new Error("Cannot disable the core module");

    await container.db.modules.setModuleGuildEnabled(
      guildId,
      moduleName,
      enabled,
    );
    return { success: true, enabled };
  });

  registerRpcHandler(RPC_ACTIONS.guildConfigSet, async (req) => {
    const { guildId } = await verifyGuildAccess(req);
    const { moduleName, key, value } = parsePayload(
      ConfigSetSchema,
      req.data,
    );

    if (value === null || value === undefined || value === "") {
      await container.db.config.deleteModuleConfigKey(
        guildId,
        moduleName,
        key,
      );
      return { success: true, key, value: null };
    }

    const raw = toRawConfigValue(value);
    const { coerced } = await getService("config").setConfig(
      guildId,
      moduleName,
      key,
      raw,
      req.actorId,
    );
    return { success: true, key, value: coerced };
  });

  registerRpcHandler(RPC_ACTIONS.guildSetupRun, async (req) => {
    const { guild, actorId } = await verifyGuildAccess(req);
    return runGuildSetup(guild, actorId);
  });

  registerRpcHandler(RPC_ACTIONS.guildSettingsSet, async (req) => {
    const { guildId } = await verifyGuildAccess(req);
    const data = parsePayload(GuildSettingsSchema, req.data);

    const tx = await container.db.transaction(guildId);
    try {
      tx.write(data);
      await tx.submit();
    } finally {
      tx.dispose();
    }
    const updated = await container.db.config.getGuildSettings(guildId);
    return { success: true, settings: updated };
  });
}

export function unregisterGuildRpcHandlers(): void {
  rpcHandlers.delete(RPC_ACTIONS.guildDashboardGet);
  rpcHandlers.delete(RPC_ACTIONS.guildSummariesList);
  rpcHandlers.delete(RPC_ACTIONS.guildModuleToggle);
  rpcHandlers.delete(RPC_ACTIONS.guildConfigSet);
  rpcHandlers.delete(RPC_ACTIONS.guildSetupRun);
  rpcHandlers.delete(RPC_ACTIONS.guildSettingsSet);
}
