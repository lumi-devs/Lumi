import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildBasedChannel,
} from "discord.js";
import type { CommandContext, CommandDef } from "@lumi/module-kit";
import { makeErrorCard, makeSuccessCard } from "@lumi/ui";

const LockableTypes = new Set<ChannelType>([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
]);

async function resolveChannel(ctx: CommandContext): Promise<GuildBasedChannel | null> {
  if (ctx.isSlash) {
    const selected = (ctx.source as ChatInputCommandInteraction).options.getChannel("target");
    if (selected) return selected as GuildBasedChannel;
  } else {
    const raw = await ctx.getString("target");
    if (raw !== null) {
      const id = raw.replace(/[^0-9]/g, "");
      if (!id || !ctx.guild) return null;
      return (await ctx.guild.channels.fetch(id).catch(() => null)) as GuildBasedChannel | null;
    }
  }
  return ctx.channel && "guild" in ctx.channel ? (ctx.channel as GuildBasedChannel) : null;
}

export const lockCommand: CommandDef = {
  name: "lock",
  description: "Lock or unlock a channel for regular members.",
  module: "mod",
  guildOnly: true,
  prefix: true,
  permitNode: ["mod.lockdown", "mod.lock"],
  requiredPermissions: PermissionFlagsBits.ManageChannels,
  build: () =>
    new SlashCommandBuilder()
      .setName("lock")
      .setDescription("Lock or unlock a channel.")
      .addSubcommand((sub) =>
        sub
          .setName("channel")
          .setDescription("Lock a text channel.")
          .addChannelOption((option) =>
            option
              .setName("target")
              .setDescription("Channel to lock (defaults to this one)")
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
          )
          .addStringOption((option) =>
            option.setName("reason").setDescription("Reason").setMaxLength(1_000),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("unlock")
          .setDescription("Unlock a text channel.")
          .addChannelOption((option) =>
            option
              .setName("target")
              .setDescription("Channel to unlock (defaults to this one)")
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
          ),
      ),
  async run(ctx) {
    const guild = ctx.guild;
    if (!guild) return ctx.reply(makeErrorCard("Server Only", "This command can only be used in a server."));

    const channel = await resolveChannel(ctx);
    if (!channel || !LockableTypes.has(channel.type)) {
      return ctx.reply(
        makeErrorCard("Invalid Channel", "Pick a text or announcement channel to lock."),
      );
    }
    if (!channel.isTextBased() || !("permissionOverwrites" in channel)) {
      return ctx.reply(makeErrorCard("Invalid Channel", "That channel does not support permissions."));
    }

    const sub = ctx.getSubcommand();
    const everyone = guild.roles.everyone;

    if (sub === "unlock") {
      try {
        await channel.permissionOverwrites.edit(everyone, { SendMessages: null });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Discord rejected the change.";
        return ctx.reply(makeErrorCard("Unlock Failed", message));
      }
      return ctx.reply(
        makeSuccessCard("Channel Unlocked", `Unlocked ${channel.toString()}. Members can speak again.`),
      );
    }

    const reason = (await ctx.getString("reason", { rest: true })) ?? "Channel locked by a moderator";
    try {
      await channel.permissionOverwrites.edit(everyone, { SendMessages: false }, { reason });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Discord rejected the change.";
      return ctx.reply(makeErrorCard("Lock Failed", message));
    }

    return ctx.reply(
      makeSuccessCard("Channel Locked", `Locked ${channel.toString()}.\n**Reason:** ${reason}`),
    );
  },
};
