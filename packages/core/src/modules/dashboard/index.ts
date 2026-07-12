import { Module, DefineModule } from "#lib/module-system/Module.js";
import { container } from "@sapphire/framework";
import {
  registerRpcHandler,
  deregisterRpcHandler,
} from "#lib/rabbitmq/index.js";
import { RPC_ACTIONS } from "@lumi/contracts";
import type { Prisma } from "@prisma/client";
import { s, type BaseValidator } from "@sapphire/shapeshift";

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
  } catch (err: any) {
    throw new Error(`Bad payload: ${err.message}`);
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
      const modules = container.stores
        .get("modules")
        .loaded()
        .map(async (m) => {
          const enabled = await container.db.modules.isModuleGuildEnabled(
            guildId,
            m.meta.name,
          );

          const config: Record<string, unknown> = {};
          if (m.meta.configFields) {
            for (const field of m.meta.configFields) {
              config[field.key] = await container.db.config.getModuleConfig(
                guildId,
                m.meta.name,
                field.key,
              );
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
        modules: await Promise.all(modules),
      };
    });

    registerRpcHandler(RPC_ACTIONS.guildModuleToggle, async (req) => {
      const guildId = requireGuildId(req.guildId);
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

    return super.onLoad();
  }

  public override onUnload() {
    container.logger.info("[Dashboard] Unloading RPC handlers...");
    deregisterRpcHandler(RPC_ACTIONS.guildDashboardGet);
    deregisterRpcHandler(RPC_ACTIONS.guildModuleToggle);
    deregisterRpcHandler(RPC_ACTIONS.guildConfigSet);
    return super.onUnload();
  }
}
