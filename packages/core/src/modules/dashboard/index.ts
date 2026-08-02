import { Module, DefineModule } from "#lib/module-system/Module.js";
import { container } from "@sapphire/framework";
import { registerRpcHandler, rpcHandlers } from "#lib/rabbitmq/index.js";
import { RPC_ACTIONS } from "@lumi/contracts";
import type { Prisma } from "@prisma/client";
import { s, type BaseValidator } from "@sapphire/shapeshift";
import { checkModulesEnabled } from "#lib/module-check.js";

const SnowflakeSchema = s.string().regex(/^\d{17,20}$/);

/** Validate the RPC request's guildId, narrowing it to a non-null snowflake. */
function requireGuildId(guildId: string | null | undefined): string {
  try {
    if (!guildId) throw new Error();
    SnowflakeSchema.parse(guildId);
    return guildId;
  } catch {
    throw new Error("guildId is required and must be a valid snowflake");
  }
}

/** Validate an RPC payload against its schema, throwing a uniform error on mismatch. */
function parsePayload<T>(schema: BaseValidator<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Bad payload: ${msg}`);
  }
}

/**
 * Re-check the actor's Discord permissions live against the guild, rather
 * than trusting the dashboard session (its cached guild list can be up to
 * `SESSION_TTL_MS` stale).
 */
async function requireGuildManager(
  guildId: string,
  actorId: string | undefined,
): Promise<void> {
  if (!actorId) throw new Error("actorId is required");
  const guild = container.client.guilds.cache.get(guildId);
  if (!guild) throw new Error("Guild not found in bot cache");
  if (guild.ownerId === actorId) return;

  const member = await guild.members.fetch(actorId).catch(() => null);
  if (
    !member?.permissions.has("ManageGuild") &&
    !member?.permissions.has("Administrator")
  ) {
    throw new Error("Missing ManageGuild permission");
  }
}

const ModuleToggleSchema = s.object({
  moduleName: s.string().lengthGreaterThanOrEqual(1),
  enabled: s.boolean(),
});

const ConfigSetSchema = s.object({
  moduleName: s.string().lengthGreaterThanOrEqual(1),
  key: s.string().lengthGreaterThanOrEqual(1),
  value: s.any(),
});

const GuildSettingsSchema = s.object({
  prefix: s.string().lengthLessThanOrEqual(5).nullable().optional(),
  modRoleId: SnowflakeSchema.nullable().optional(),
  adminRoleId: SnowflakeSchema.nullable().optional(),
  modLogChannelId: SnowflakeSchema.nullable().optional(),
  muteRoleId: SnowflakeSchema.nullable().optional(),
  locale: s.string().optional(),
  timezone: s.string().optional(),
  noMentionSpamWindowMs: s.number().int().nullable().optional(),
  noMentionSpamLimit: s.number().int().nullable().optional(),
});

@DefineModule({
  name: "dashboard",
  displayName: "Dashboard",
  emoji: "🖥️",
  version: "1.0.0",
  description:
    "Integrates the bot with the Lumi Web Dashboard. Provides RPC endpoints for management.",
})
export class DashboardModule extends Module {
  public override onLoad() {
    container.logger.info("[Dashboard] Initializing RPC handlers...");

    registerRpcHandler(RPC_ACTIONS.guildDashboardGet, async (req) => {
      const guildId = requireGuildId(req.guildId);

      const guild = container.client.guilds.cache.get(guildId);
      if (!guild) throw new Error("Guild not found in bot cache");

      const settings = await container.db.config.getGuildSettings(guildId);
      const loadedModules = container.stores.get("modules").loaded();
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
          enabled,
          configFields: m.meta.configFields || [],
          config,
        };
      });

      return {
        name: guild.name,
        icon: guild.iconURL(),
        settings,
        modules,
      };
    });

    registerRpcHandler(RPC_ACTIONS.guildModuleToggle, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
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
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const { moduleName, key, value } = parsePayload(
        ConfigSetSchema,
        req.data,
      );

      await container.db.config.setModuleConfig(
        guildId,
        moduleName,
        key,
        value as Prisma.InputJsonValue,
      );
      return { success: true, key, value };
    });

    registerRpcHandler(RPC_ACTIONS.guildSettingsSet, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const data = parsePayload(GuildSettingsSchema, req.data);

      const updated = await container.db.config.updateGuildSettings(
        guildId,
        data,
      );
      return { success: true, settings: updated };
    });

    return super.onLoad();
  }

  public override onUnload() {
    container.logger.info("[Dashboard] Unloading RPC handlers...");
    rpcHandlers.delete(RPC_ACTIONS.guildDashboardGet);
    rpcHandlers.delete(RPC_ACTIONS.guildModuleToggle);
    rpcHandlers.delete(RPC_ACTIONS.guildConfigSet);
    rpcHandlers.delete(RPC_ACTIONS.guildSettingsSet);
    return super.onUnload();
  }
}
