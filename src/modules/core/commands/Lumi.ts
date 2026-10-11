import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import { CommandContext } from "#src/lib/commands/Context.js";
import { loadFeatures } from "#src/modules/core/services/ConfigPanel.js";
import { buildHubView } from "#src/modules/core/ui/Hub.js";

export const lumiDef: CommandDef = {
  name: "lumi",
  description: "Open the Lumi control panel",
  guildOnly: true,
  requiredPermit: "admin.*",
  prefixEnabled: true,
  build: () =>
    new SlashCommandBuilder()
      .setName("lumi")
      .setDescription("Open the Lumi control panel")
      .addSubcommand((s) =>
        s.setName("panel").setDescription("Open the Lumi control panel"),
      ),
  handlers: {
    "panel": async (ctx: CommandContext) => {
      const guildId = ctx.guildId!;
      const [features, settings, t] = await Promise.all([
        loadFeatures(ctx.services, guildId),
        ctx.services.db.config.getGuildSettings(guildId),
        ctx.fetchT(),
      ]);
      const guild = ctx.services.client.guilds.cache.get(guildId);
      await ctx.reply(
        buildHubView(
          {
            moduleCount: features.length,
            enabledCount: features.filter((f) => f.guildEnabled).length,
            prefix: settings.prefix,
            locale: settings.locale,
            iconUrl:
              guild?.iconURL() ?? ctx.services.client.user?.displayAvatarURL(),
          },
          t,
        ),
      );
    },
  },
  defaultSub: "panel",
};
