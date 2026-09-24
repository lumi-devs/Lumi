import { ApplyOptions } from "@sapphire/decorators";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { channelMention } from "@discordjs/formatters";
import { ChannelType, type GuildTextBasedChannel } from "discord.js";
import { BaseCommand } from "#lib/commands.js";
import type { CommandContext } from "#lib/command-context.js";
import { logError } from "#lib/utilities/errors.js";
import { loadVerificationConfig } from "../services/verification.js";
import { buildVerifyPanel } from "../ui/verify-panel.js";

@ApplyOptions<BaseCommand.Options>({
  name: "verifypanel",
  description: "Post the member verification panel in a channel.",
  preconditions: ["GuildOnly"],
  requiredPermit: "admin.*",
})
export class VerifyPanelCommand extends BaseCommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      b
        .setName(this.name)
        .setDescription(this.description)
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Channel to post the panel in (defaults to here).")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        ),
    );
  }

  public override async run(ctx: CommandContext) {
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
      await this.container.db.security.saveVerificationPanel({
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
}
