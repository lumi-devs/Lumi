import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#lib/commands/command-def.js";
import { CommandContext } from "#lib/commands/context.js";
import { restartChoiceRow } from "#lib/restart.js";
import { loadFeatures } from "../services/config-panel.js";
import { buildHubView } from "#modules/core/ui/hub.js";
import { Emojis } from "#lib/utilities/assets.js";
import { makeSuccessCard } from "#lib/ui/cards.js";
import { updateLumiCore } from "#lib/utilities/self-update.js";
import { PermitResolver } from "#lib/permissions/PermitResolver.js";
import { UserError } from "@lumi/shared";
export const lumiDef: CommandDef = {
  name: "lumi",
  description: "Open the Lumi control panel or update Lumi core",
  guildOnly: true,
  requiredPermit: "admin.*",
  prefixEnabled: true,
  build: () => {
    const b = new SlashCommandBuilder().setName("lumi");
    return (
    b
            .setName("lumi")
            .setDescription("Open the Lumi control panel or update Lumi core")
            .addSubcommand((s) =>
              s.setName("panel").setDescription("Open the Lumi control panel"),
            )
            .addSubcommand((s) =>
              s
                .setName("update")
                .setDescription("Update Lumi core to the latest version"),
            )
    );
  },
  handlers: {
  "update": async (ctx: CommandContext) => {
    // Not `owner.*`: PermitResolver's guild-owner bypass satisfies that node.
    if (!PermitResolver.isBotOwner(ctx.user.id)) {
      throw new UserError({
        identifier: "AccessDenied",
        message: `${Emojis.Cross} Only Bot Owners can update Lumi core.`,
      });
    }
    const t = await ctx.fetchT();
    await ctx.replyInfo(
      t("core:updatingCoreTitle"),
      `${Emojis.Loading} ${t("core:updatingCoreText")}`,
    );

    const res = await updateLumiCore(ctx.services);
    if (res.error) {
      await ctx.replyError(
        `${Emojis.Error} ${t("core:coreUpdateFailedTitle")}`,
        res.error,
      );
      return;
    }

    if (res.updated) {
      const body = t("core:coreUpdatedText", {
        commitsCount: res.commitsCount,
        latestCommit: res.latestCommit,
        currentCommit: res.currentCommit,
        changelog: res.changelog,
      });
      await ctx.reply(
        makeSuccessCard(`${Emojis.Bot} ${t("core:coreUpdatedTitle")}`, body, {
          actionRows: [restartChoiceRow(ctx.user.id)],
        }),
      );
      return;
    }

    await ctx.replySuccess(
      `${Emojis.Bot} ${t("core:coreUpToDateTitle")}`,
      t("core:coreUpToDateText", { currentCommit: res.currentCommit })
    );
  },
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
  }
  },
  defaultSub: "panel"
};
