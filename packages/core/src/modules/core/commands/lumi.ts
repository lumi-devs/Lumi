import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi/lib/commands/command-def.js";
import { CommandContext } from "@lumi/lib/commands/context.js";
import { loadFeatures } from "../services/config-panel.js";
import { buildHubView } from "@lumi/modules/core/ui/hub.js";

export const lumiDef: CommandDef = {
  name: "lumi",
  description: "Open the Lumi control panel",
  guildOnly: true,
  requiredPermit: "admin.*",
  prefixEnabled: true,
  build: () => {
    const b = new SlashCommandBuilder().setName("lumi");
    return (
      b
        .setName("lumi")
        .setDescription("Open the Lumi control panel")
        .addSubcommand((s) =>
          s.setName("panel").setDescription("Open the Lumi control panel"),
        )
    );
  },
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
