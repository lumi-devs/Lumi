import { ApplyOptions } from "@sapphire/decorators";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { channelMention } from "@discordjs/formatters";
import { ChannelType, type GuildTextBasedChannel } from "discord.js";
import { BaseCommand, type CommandContext } from "#lib/commands.js";
import { PanelsKeys } from "#lib/i18n/keys.js";
import { logError } from "#lib/utilities/errors.js";
import { getUtility } from "#lib/module-system/Utility.js";
import { buildVerifyPanel } from "../lib/verify-panel.js";

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

    const verification = await getUtility("security").loadVerificationConfig(
      guild.id,
    );
    if (!verification.enabled || !verification.verifiedRoleId) {
      return ctx.replyError(
        t(PanelsKeys.VerifyUnconfiguredTitle),
        t(PanelsKeys.VerifyUnconfigured),
      );
    }

    const target =
      ((await ctx.getChannel("channel")) as GuildTextBasedChannel | null) ??
      (await guild.channels
        .fetch(ctx.channelId)
        .catch(() => null) as GuildTextBasedChannel | null);
    if (!target?.isTextBased()) {
      return ctx.replyError(
        t(PanelsKeys.VerifyUnconfiguredTitle),
        t(PanelsKeys.VerifyUnconfigured),
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
        t(PanelsKeys.VerifyFailedTitle),
        t(PanelsKeys.VerifyFailed),
      );
    }

    return ctx.replySuccess(
      t(PanelsKeys.VerifyPostedTitle),
      t(PanelsKeys.VerifyPosted, { channel: channelMention(target.id) }),
    );
  }
}
