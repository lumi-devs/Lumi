import { container } from "@sapphire/framework";
import {
  CodedRpcError,
  RpcFailureCodes,
  dashboardRpc,
} from "@lumi/contracts/rpc";
import type { DashboardModuleSummaryView } from "@lumi/contracts/views";
import { ChannelType } from "discord.js";
import { isSupportedLanguage } from "#lib/i18n/index.js";
import { checkModulesEnabled } from "#lib/module-check.js";
import type { ModuleRecord } from "#lib/module-system/ModuleStore.js";
import { getUtility } from "#lib/module-system/Utility.js";
import { implementRpc, requireGuildManager } from "#lib/rpc/implement.js";
import { paginate } from "#lib/rpc/validation.js";

const GuildSummariesMax = 200;
const GuildConfigSetManyMax = 50;
const MemberSampleSize = 200;

/** Channel types sensible to offer in a CHANNEL config picker by default (no threads, no categories). */
const PickableChannelTypes = new Set<ChannelType>([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
]);

export const dashboardRpcHandlers = implementRpc(dashboardRpc, {
  "guild.shell.get": async ({ guildId, guild }) => {
    const modules = container.stores.get("modules").loaded();
    const [settings, enabled] = await Promise.all([
      container.db.config.getGuildSettings(guildId),
      checkModulesEnabled(
        guildId,
        modules.map((m) => m.meta.name),
      ),
    ]);
    return {
      name: guild.name,
      icon: guild.iconURL(),
      banner: guild.bannerURL(),
      memberCount: guild.memberCount,
      settings,
      modules: modules.map((m) =>
        moduleSummary(m, enabled.get(m.meta.name) ?? true),
      ),
    };
  },

  "guild.module.get": async ({ guildId, input }) => {
    const module = container.stores
      .get("modules")
      .loaded()
      .find((m) => m.meta.name === input.module);
    if (!module) return { module: null };
    const [enabled, stored] = await Promise.all([
      checkModulesEnabled(guildId, [module.meta.name]),
      container.db.config.getAllModuleConfig(guildId, module.meta.name),
    ]);
    const config: Record<string, unknown> = {};
    for (const field of module.meta.configFields ?? []) {
      config[field.key] = stored[field.key] ?? field.default ?? null;
    }
    return {
      module: {
        ...moduleSummary(module, enabled.get(module.meta.name) ?? true),
        config,
      },
    };
  },

  "guild.entities.get": ({ guild }) => {
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
      .filter((c) => PickableChannelTypes.has(c.type))
      .map((c) => ({ id: c.id, name: c.name, type: c.type }));

    // Take the first cached non-bot members and sort those, instead of sorting
    // the whole cache: the dashboard only needs names for ids it displays.
    const members: { id: string; username: string; displayName: string }[] = [];
    for (const m of guild.members.cache.values()) {
      if (m.user.bot) continue;
      members.push({
        id: m.id,
        username: m.user.username,
        displayName: m.displayName,
      });
      if (members.length >= MemberSampleSize) break;
    }
    members.sort((a, b) => a.displayName.localeCompare(b.displayName));

    return { roles, channels, members };
  },

  "guild.summaries.list": async ({ actorId, input }) => {
    const allowed = await Promise.all(
      input.guildIds.slice(0, GuildSummariesMax).map((guildId) =>
        requireGuildManager(guildId, actorId).then(
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
  },

  "guild.module.toggle": async ({ guildId, input }) => {
    if (input.moduleName === "core") {
      throw new Error("Cannot disable the core module");
    }
    if (!container.stores.get("modules").get(input.moduleName)) {
      throw new Error(`No module named \`${input.moduleName}\`.`);
    }
    await container.db.modules.setModuleGuildEnabled(
      guildId,
      input.moduleName,
      input.enabled,
    );
    return { success: true, enabled: input.enabled };
  },

  "guild.config.set": async ({ guildId, actorId, input }) => {
    const value = await applyConfigSet(
      guildId,
      input.moduleName,
      input.key,
      input.value,
      actorId,
    );
    return { success: true, key: input.key, value };
  },

  "guild.config.setMany": async ({ guildId, actorId, input }) => {
    const { values } = input;
    if (typeof values !== "object" || values === null || Array.isArray(values)) {
      throw badPayload("values must be an object");
    }
    const entries = Object.entries(values);
    if (entries.length > GuildConfigSetManyMax) {
      throw badPayload(`at most ${GuildConfigSetManyMax} values per call`);
    }
    if (entries.some(([key]) => key.length === 0)) {
      throw badPayload("config keys must not be empty");
    }

    const updated: Record<string, unknown> = {};
    for (const [key, value] of entries) {
      updated[key] = await applyConfigSet(
        guildId,
        input.moduleName,
        key,
        value,
        actorId,
      );
    }
    return { success: true, updated };
  },

  "guild.settings.set": async ({ guildId, input }) => {
    if (input.locale !== undefined && !isSupportedLanguage(input.locale)) {
      throw new Error(`Unsupported locale \`${input.locale}\`.`);
    }

    const tx = await container.db.transaction(guildId);
    try {
      tx.write(input);
      await tx.submit();
    } finally {
      tx.dispose();
    }
    const settings = await container.db.config.getGuildSettings(guildId);
    return { success: true, settings };
  },

  "guild.audit.list": async ({ guildId, input }) => {
    const { page, pageSize, skip, take } = paginate(input);
    const { entries, total } = await container.db.audit.listAuditLogs({
      guildId,
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

  "guild.history.list": async ({ guildId, input }) => {
    const { page, pageSize, skip, take } = paginate(input);
    const { entries, total } =
      await container.db.configHistory.listGuildConfigHistory(guildId, {
        moduleName: input.moduleName,
        key: input.key,
        actorId: input.actorId,
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
  },

  "guild.history.rollback": async ({ guildId, actorId, input }) => {
    const entry = await container.db.configHistory.getConfigHistoryEntry(
      input.entryId,
    );
    if (!entry || entry.guildId !== guildId) {
      throw new Error(`History entry ${input.entryId} not found`);
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
      actorId,
    );
    return {
      success: true,
      moduleName: entry.moduleName,
      key: entry.key,
      value: coerced,
    };
  },

  "guild.overrides.list": async ({ guildId, input }) => {
    const overrides =
      await container.db.configOverrides.listGuildConfigOverrides(
        guildId,
        input.moduleName,
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
  },

  "guild.overrides.set": async ({ guildId, input }) => {
    const { moduleName, key, modelType, modelId, value } = input;
    if (value === null || value === undefined) {
      const deleted = await container.db.configOverrides.deleteConfigOverride({
        guildId,
        moduleName,
        key,
        modelType,
        modelId,
      });
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
  },

  "guild.moduleData.list": async ({ guildId, input }) => {
    const { page, pageSize, skip, take } = paginate(input);
    const { entries, total } = await container.db.guildKV.listGuildModuleData(
      guildId,
      {
        moduleName: input.moduleName,
        targetId: input.targetId,
        key: input.key,
        skip,
        take,
      },
    );
    return { entries, total, page, pageSize };
  },
});

function badPayload(detail: string): CodedRpcError {
  return new CodedRpcError(RpcFailureCodes.BadRequest, `Bad payload: ${detail}`);
}

function moduleSummary(
  module: ModuleRecord,
  enabled: boolean,
): DashboardModuleSummaryView {
  const { meta } = module;
  return {
    name: meta.name,
    displayName: meta.displayName,
    emoji: meta.emoji,
    description: meta.description,
    short: meta.short,
    endUserDataStatement: meta.endUserDataStatement,
    version: meta.version,
    conflicts: meta.conflicts ?? [],
    dependencies: meta.dependencies ?? [],
    enabled,
    configFields: meta.configFields || [],
    isAddon: container.stores.get("modules").isAddonModule(module),
    category: meta.category ?? "System",
    dashboardHref: meta.dashboardHref ?? null,
  };
}

// Single-key config write shared by `guild.config.set` and
// `guild.config.setMany`, so the batch path persists exactly like the
// per-field one.
async function applyConfigSet(
  guildId: string,
  moduleName: string,
  key: string,
  value: unknown,
  actorId: string,
): Promise<unknown> {
  if (value === null || value === undefined || value === "") {
    await container.db.config.deleteModuleConfigKey(guildId, moduleName, key);
    return null;
  }

  const { coerced } = await getUtility("config").setConfig(
    guildId,
    moduleName,
    key,
    toRawConfigValue(value),
    actorId,
  );
  return coerced;
}

function toRawConfigValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    // A primitive-entry array (StringList, MultiRole, ...) gets stringified
    // per entry; an object-entry array (ObjectArray, e.g. sticky entries) is
    // passed through as-is — `ConfigUtility.coerce` validates its shape per
    // the field's own type immediately after this.
    if (value.every(isPrimitiveConfigValue)) {
      return value.map((entry) => String(entry));
    }
    return value;
  }
  // Plain objects (e.g. a Components V2 block document) pass through
  // unchanged for the same reason — shape validation happens downstream,
  // scoped to the field's declared type.
  if (value !== null && typeof value === "object") {
    return value;
  }
  if (!isPrimitiveConfigValue(value)) {
    throw new TypeError(
      `Unsupported config value of type ${value === null ? "null" : typeof value}; expected string, number, boolean, array or object.`,
    );
  }
  return value;
}

function isPrimitiveConfigValue(value: unknown): boolean {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}
