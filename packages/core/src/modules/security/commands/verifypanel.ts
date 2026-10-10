import type { CommandDef } from "@lumi/lib/commands/command-def.js";
import { channelMention } from "@discordjs/formatters";
import { SlashCommandBuilder, ChannelType, type GuildTextBasedChannel } from "discord.js";
import type { CommandContext } from "@lumi/lib/commands/context.js";
import { logError } from "@lumi/lib/utilities/errors.js";
import { loadVerificationConfig } from "@lumi/application/services/security/verification.js";
import { buildVerifyPanel } from "../ui/verify-panel.js";

export const verifypanelDef: CommandDef = {
  name: "verifypanel",
  description: "Post the member verification panel in a channel.",
  guildOnly: true,
  requiredPermit: "admin.*",
  build: () => {
    const b = new SlashCommandBuilder().setName("verifypanel");
    return (
    b
            .setName("verifypanel")
            .setDescription("Post the member verification panel in a channel.")
            .addChannelOption((o) =>
              o
                .setName("channel")
                .setDescription("Channel to post the panel in (defaults to here).")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false),
            )
    ) as SlashCommandBuilder;
  },
  run: async (ctx: CommandContext) => {
    await ctx.defer();
    const t = await ctx.fetchT();
    const guild = ctx.guild!;

    const verification = await loadVerificationConfig(guild.id);
    if (!verification.enabled || !verification.verifiedRoleId) {
      return ctx.replyError(
        t("panels:verifyUnconfiguredTitle"),
        t("panels:verifyUnconfigured"),
      );
    }

    const target =
      ((await ctx.getChannel("channel")) as GuildTextBasedChannel | null) ??
      (await guild.channels
        .fetch(ctx.channelId)
        .catch(() => null) as GuildTextBasedChannel | null);
    if (!target?.isTextBased()) {
      return ctx.replyError(
        t("panels:verifyUnconfiguredTitle"),
        t("panels:verifyUnconfigured"),
      );
    }

    try {
      const message = await target.send(buildVerifyPanel(t));
      await ctx.services.db.security.saveVerificationPanel({
        guildId: guild.id,
        channelId: target.id,
        messageId: message.id,
      });
    } catch (err: unknown) {
      logError(`verifypanel: guild=${guild.id} channel=${target.id}`, err);
      return ctx.replyError(
        t("panels:verifyFailedTitle"),
        t("panels:verifyFailed"),
      );
    }

    return ctx.replySuccess(
      t("panels:verifyPostedTitle"),
      t("panels:verifyPosted", { channel: channelMention(target.id) }),
    );
  }
};
