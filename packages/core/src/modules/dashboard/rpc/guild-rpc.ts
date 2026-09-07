import { container } from "@sapphire/framework";
import { registerRpcHandler, rpcHandlers } from "#lib/rpc/dispatch.js";
import {
  RpcActions,
  type GuildChannelListItem,
  type GuildRoleListItem,
} from "@lumi/contracts";
import { getUtility } from "#lib/module-system/Utility.js";
import { checkModulesEnabled } from "#lib/module-check.js";
import { isSupportedLanguage } from "#lib/i18n/index.js";
import {
  ConfigSetManySchema,
  ConfigSetSchema,
  GuildConfigSetManyMax,
  GuildSettingsSchema,
  GuildSummariesMax,
  GuildSummariesSchema,
  ModuleToggleSchema,
  PickableChannelTypes,
  parsePayload,
  requireGuildManager,
  runGuildSetup,
  toRawConfigValue,
  verifyGuildAccess,
} from "#lib/rpc/helpers.js";

/** Short-lived per-guild directory snapshot backing `guild.roles.list` and `guild.channels.list`. */
const GuildDirectoryCacheTtlMs = 30_000;

interface GuildDirectoryCacheEntry {
  expiresAt: number;
  roles: GuildRoleListItem[];
  channels: GuildChannelListItem[];
}

const directoryCache = new Map<string, GuildDirectoryCacheEntry>();

export function clearGuildDirectoryCache(guildId?: string): void {
  if (guildId === undefined) directoryCache.clear();
  else directoryCache.delete(guildId);
}

function readGuildDirectory(guildId: string): GuildDirectoryCacheEntry {
  const cached = directoryCache.get(guildId);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const guild = container.client.guilds.cache.get(guildId);
  if (!guild) throw new Error("Guild not found in bot cache");

  const fresh: GuildDirectoryCacheEntry = {
    expiresAt: Date.now() + GuildDirectoryCacheTtlMs,
    roles: guild.roles.cache
      .filter((r) => r.id !== guild.id)
      .map((r) => ({ id: r.id, name: r.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    channels: guild.channels.cache
      .filter((c) => PickableChannelTypes.has(c.type))
      .map((c) => ({ id: c.id, name: c.name, type: c.type })),
  };
  directoryCache.set(guildId, fresh);
  return fresh;
}

// Single-key config write shared by `guild.config.set` and
// `guild.config.setMany`, so the batch path validates and persists exactly
// like the per-field one.
async function applyConfigSet(
  guildId: string,
  moduleName: string,
  key: string,
  value: unknown,
  actorId: string | undefined,
): Promise<unknown> {
  const parsed = parsePayload(ConfigSetSchema, { moduleName, key, value });

  if (parsed.value === null || parsed.value === undefined || parsed.value === "") {
    await container.db.config.deleteModuleConfigKey(
      guildId,
      parsed.moduleName,
      parsed.key,
    );
    return null;
  }

  const raw = toRawConfigValue(parsed.value);
  const { coerced } = await getUtility("config").setConfig(
    guildId,
    parsed.moduleName,
    parsed.key,
    raw,
    actorId,
  );
  return coerced;
}

export function registerGuildRpcHandlers(): void {
  registerRpcHandler(RpcActions.guildDashboardGet, async (req) => {
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
        short: m.meta.short,
        endUserDataStatement: m.meta.endUserDataStatement,
        version: m.meta.version,
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
        position: r.position,
        permissions: r.permissions.bitfield.toString(),
        isBotRole: r.id === botRoleId,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const channels = guild.channels.cache
      .filter((c) => PickableChannelTypes.has(c.type))
      .map((c) => ({ id: c.id, name: c.name, type: c.type }));

    // Directory sample for id->name lookups, not a census: take the first 200
    // cached non-bot members and sort those, instead of sorting the whole cache.
    const members: { id: string; username: string; displayName: string }[] = [];
    for (const m of guild.members.cache.values()) {
      if (m.user.bot) continue;
      members.push({ id: m.id, username: m.user.username, displayName: m.displayName });
      if (members.length >= 200) break;
    }
    members.sort((a, b) => a.displayName.localeCompare(b.displayName));

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

  registerRpcHandler(RpcActions.guildSummariesList, async (req) => {
    if (!req.actorId) throw new Error("actorId is required");
    const { guildIds } = parsePayload(GuildSummariesSchema, req.data);

    const allowed = await Promise.all(
      guildIds.slice(0, GuildSummariesMax).map((guildId: string) =>
        requireGuildManager(guildId, req.actorId).then(
          () => guildId,
          () => null,
        ),
      ),
    );

    const summaries = allowed.flatMap((guildId) => {
      if (!guildId) return [];
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

  registerRpcHandler(RpcActions.guildModuleToggle, async (req) => {
    const { guildId } = await verifyGuildAccess(req);
    const { moduleName, enabled } = parsePayload(
      ModuleToggleSchema,
      req.data,
    );

    if (moduleName === "core")
      throw new Error("Cannot disable the core module");

    if (!container.stores.get("modules").get(moduleName))
      throw new Error(`No module named \`${moduleName}\`.`);

    await container.db.modules.setModuleGuildEnabled(
      guildId,
      moduleName,
      enabled,
    );
    return { success: true, enabled };
  });

  registerRpcHandler(RpcActions.guildConfigSet, async (req) => {
    const { guildId, actorId } = await verifyGuildAccess(req);
    const { moduleName, key, value } = parsePayload(
      ConfigSetSchema,
      req.data,
    );

    const coerced = await applyConfigSet(guildId, moduleName, key, value, actorId);
    return { success: true, key, value: coerced };
  });

  registerRpcHandler(RpcActions.guildConfigSetMany, async (req) => {
    const { guildId, actorId } = await verifyGuildAccess(req);
    const { moduleName, values } = parsePayload(
      ConfigSetManySchema,
      req.data,
    );

    if (typeof values !== "object" || values === null || Array.isArray(values)) {
      throw new Error("Bad payload: values must be an object");
    }
    const entries = Object.entries(values);
    if (entries.length > GuildConfigSetManyMax) {
      throw new Error(
        `Bad payload: at most ${GuildConfigSetManyMax} values per call`,
      );
    }

    const updated: Record<string, unknown> = {};
    for (const [key, value] of entries) {
      updated[key] = await applyConfigSet(guildId, moduleName, key, value, actorId);
    }
    return { success: true, updated };
  });

  registerRpcHandler(RpcActions.guildRolesList, async (req) => {
    const { guildId } = await verifyGuildAccess(req);
    const { roles } = readGuildDirectory(guildId);
    return { roles };
  });

  registerRpcHandler(RpcActions.guildChannelsList, async (req) => {
    const { guildId } = await verifyGuildAccess(req);
    const { channels } = readGuildDirectory(guildId);
    return { channels };
  });

  registerRpcHandler(RpcActions.guildSetupRun, async (req) => {
    const { guild, actorId } = await verifyGuildAccess(req);
    return runGuildSetup(guild, actorId);
  });

  registerRpcHandler(RpcActions.guildSettingsSet, async (req) => {
    const { guildId } = await verifyGuildAccess(req);
    const data = parsePayload(GuildSettingsSchema, req.data);

    if (data.locale !== undefined && !isSupportedLanguage(data.locale)) {
      throw new Error(`Unsupported locale \`${data.locale}\`.`);
    }
    if (data.timezone !== undefined) {
      try {
        new Intl.DateTimeFormat(undefined, { timeZone: data.timezone });
      } catch {
        throw new Error(`Unsupported timezone \`${data.timezone}\`.`);
      }
    }

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
  rpcHandlers.delete(RpcActions.guildDashboardGet);
  rpcHandlers.delete(RpcActions.guildSummariesList);
  rpcHandlers.delete(RpcActions.guildModuleToggle);
  rpcHandlers.delete(RpcActions.guildConfigSet);
  rpcHandlers.delete(RpcActions.guildConfigSetMany);
  rpcHandlers.delete(RpcActions.guildRolesList);
  rpcHandlers.delete(RpcActions.guildChannelsList);
  rpcHandlers.delete(RpcActions.guildSetupRun);
  rpcHandlers.delete(RpcActions.guildSettingsSet);
}
