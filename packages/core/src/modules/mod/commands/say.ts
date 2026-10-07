import type { CommandDef } from "#lib/commands/command-def.js";
import type { CommandContext } from "#lib/command-context.js";
import { SlashCommandBuilder, ChannelType, PermissionFlagsBits, type GuildTextBasedChannel } from "discord.js";

const MaxMessageLength = 2000;

export const sayDef: CommandDef = {
  name: "say",
  description: "Relay a message through the bot into a channel",
  guildOnly: true,
  requiredPermit: "mod.say",
  prefixEnabled: true,
  build: () => {
    const b = new SlashCommandBuilder().setName("say");
    return (
    b
            .setName("say")
            .setDescription("Relay a message through the bot into a channel")
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
            )
    ) as SlashCommandBuilder;
  },
  run: async (ctx: CommandContext) => {
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
};
