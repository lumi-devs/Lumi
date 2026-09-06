import { ApplyOptions } from "@sapphire/decorators";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { BaseCommand, type CommandContext } from "#lib/commands.js";
import { ChannelType, PermissionFlagsBits, type GuildTextBasedChannel } from "discord.js";

const MaxMessageLength = 2000;

@ApplyOptions<BaseCommand.Options>({
  name: "say",
  description: "Relay a message through the bot into a channel",
  preconditions: ["GuildOnly"],
  requiredPermit: "mod.say",
  prefixEnabled: true,
})
export class SayCommand extends BaseCommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      b
        .setName(this.name)
        .setDescription(this.description)
        .addStringOption((o) =>
          o
            .setName("message")
            .setDescription("Message to send")
            .setRequired(true)
            .setMaxLength(MaxMessageLength),
        )
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Channel to send in (defaults to this one)")
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
            )
            .setRequired(false),
        ),
    );
  }

  public override async run(ctx: CommandContext) {
    const message = await ctx.getString("message", {
      required: true,
      rest: true,
    });
    const optionChannel = await ctx.getChannel("channel");
    const channel = (
      optionChannel && optionChannel.isTextBased()
        ? optionChannel
        : ctx.guild?.channels.cache.get(ctx.channelId)
    ) as GuildTextBasedChannel | undefined;

    if (!channel || !channel.isTextBased()) {
      return ctx.replyError(
        "Invalid Channel",
        "Pick a text channel the bot can send messages in.",
      );
    }

    const me = ctx.guild?.members.me;
    const canSend = me
      ? channel.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages)
      : false;
    if (!canSend) {
      return ctx.replyError(
        "Missing Permissions",
        `I can't send messages in ${channel}.`,
      );
    }

    await channel.send({ content: message!, allowedMentions: { parse: [] } });
    return ctx.replySuccess("Message Sent", `Relayed your message to ${channel}.`);
  }
}
