import { Module, EmberModule } from "#core/module-system/Module.js";
import type { RequesterType } from "#core/lib/gdpr.js";
import { container } from "@sapphire/framework";
import { registerRpcHandler } from "#lib/rabbit.js";

@EmberModule({
  name: "dashboard",
  displayName: "Dashboard",
  emoji: "🖥️",
  version: "1.0.0",
  description:
    "Integrates the bot with the Ember Web Dashboard. Provides RPC endpoints for management.",
})
export class DashboardModule extends Module {
  public registerServices(
    _container: import("@sapphire/framework").Container,
  ) {}

  public override onLoad() {
    container.logger.info("[Dashboard] Initializing RPC handlers...");

    // ── 1. Get Guild Context ─────────────────────────────────────────────
    // Returns everything the dashboard needs to render a guild's control panel.
    registerRpcHandler("guild.dashboard.get", async (req) => {
      const { guildId } = req;
      if (!guildId) throw new Error("guildId is required");

      const guild = container.client.guilds.cache.get(guildId);
      if (!guild) throw new Error("Guild not found in bot cache");

      const settings = await container.db.getGuildSettings(guildId);
      const modules = container.stores
        .get("modules")
        .loaded()
        .map(async (m) => {
          const enabled = await container.db.isModuleGuildEnabled(
            guildId,
            m.meta.name,
          );

          // Fetch current values for all config fields
          const config: Record<string, any> = {};
          if (m.meta.configFields) {
            for (const field of m.meta.configFields) {
              config[field.key] = await container.db.getModuleConfig(
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

    // ── 2. Toggle Module ─────────────────────────────────────────────────
    registerRpcHandler("guild.module.toggle", async (req) => {
      const { guildId, data } = req;
      const { moduleName, enabled } = data as {
        moduleName: string;
        enabled: boolean;
      };

      if (!guildId || !moduleName)
        throw new Error("Missing guildId or moduleName");
      if (moduleName === "core")
        throw new Error("Cannot disable the core module");

      await container.db.setModuleGuildEnabled(guildId, moduleName, enabled);
      return { success: true, enabled };
    });

    // ── 3. Update Config ─────────────────────────────────────────────────
    registerRpcHandler("guild.config.set", async (req) => {
      const { guildId, data } = req;
      const { moduleName, key, value } = data as {
        moduleName: string;
        key: string;
        value: any;
      };

      if (!guildId || !moduleName || !key)
        throw new Error("Missing required fields");

      await container.db.setModuleConfig(guildId, moduleName, key, value);
      return { success: true, key, value };
    });

    return super.onLoad();
  }

  public override async deleteUserData(
    _userId: string,
    _requester: RequesterType,
  ): Promise<void> {
    // No user data to delete for dashboard
  }
}
