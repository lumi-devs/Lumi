import { Module, DefineModule } from "#core/module-system/Module.js";
import { container } from "@sapphire/framework";
import { registerRpcHandler, deregisterRpcHandler } from "#lib/rabbit.js";
import {
  RPC_ACTIONS,
  type ModuleTogglePayload,
  type ConfigSetPayload,
} from "@lumi/contracts";
import { z } from "zod";

const SnowflakeSchema = z.string().regex(/^\d{17,20}$/);

const ModuleToggleSchema: z.ZodType<ModuleTogglePayload> = z.object({
  moduleName: z.string().min(1),
  enabled: z.boolean(),
});

const ConfigSetSchema: z.ZodType<ConfigSetPayload> = z.object({
  moduleName: z.string().min(1),
  key: z.string().min(1),
  value: z.unknown(),
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

    // ── 1. Get Guild Context ─────────────────────────────────────────────
    registerRpcHandler(RPC_ACTIONS.guildDashboardGet, async (req) => {
      if (!req.guildId || !SnowflakeSchema.safeParse(req.guildId).success)
        throw new Error("guildId is required and must be a valid snowflake");

      const guild = container.client.guilds.cache.get(req.guildId);
      if (!guild) throw new Error("Guild not found in bot cache");

      const settings = await container.db.config.getGuildSettings(req.guildId);
      const modules = container.stores
        .get("modules")
        .loaded()
        .map(async (m) => {
          const enabled = await container.db.modules.isModuleGuildEnabled(
            req.guildId!,
            m.meta.name,
          );

          const config: Record<string, unknown> = {};
          if (m.meta.configFields) {
            for (const field of m.meta.configFields) {
              config[field.key] = await container.db.config.getModuleConfig(
                req.guildId!,
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

    // ── 2. Toggle Module ─────────────────────────────────────────────────
    registerRpcHandler(RPC_ACTIONS.guildModuleToggle, async (req) => {
      if (!req.guildId || !SnowflakeSchema.safeParse(req.guildId).success)
        throw new Error("guildId is required and must be a valid snowflake");

      const parsed = ModuleToggleSchema.safeParse(req.data);
      if (!parsed.success)
        throw new Error(`Bad payload: ${parsed.error.message}`);
      const { moduleName, enabled } = parsed.data;

      if (moduleName === "core")
        throw new Error("Cannot disable the core module");

      await container.db.modules.setModuleGuildEnabled(
        req.guildId,
        moduleName,
        enabled,
      );
      return { success: true, enabled };
    });

    // ── 3. Update Config ─────────────────────────────────────────────────
    registerRpcHandler(RPC_ACTIONS.guildConfigSet, async (req) => {
      if (!req.guildId || !SnowflakeSchema.safeParse(req.guildId).success)
        throw new Error("guildId is required and must be a valid snowflake");

      const parsed = ConfigSetSchema.safeParse(req.data);
      if (!parsed.success)
        throw new Error(`Bad payload: ${parsed.error.message}`);
      const { moduleName, key, value } = parsed.data;

      await container.db.config.setModuleConfig(
        req.guildId,
        moduleName,
        key,
        value as import("@prisma/client").Prisma.InputJsonValue,
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
