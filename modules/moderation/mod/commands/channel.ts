import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "@lumi/module-kit";
import { ephemeralCard, makeSuccessCard, makeWarningCard } from "@lumi/ui";
import { getReason, isTextGuildChannel, replyError } from "../helpers.js";

export const lockDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock a channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption(o => o.setName("channel").setDescription("Channel to lock").setRequired(false))
    .addStringOption(o => o.setName("reason").setDescription("Reason for lock").setRequired(false)),
  requiredPermit: "mod.lock",
  async execute(interaction) {
    const channel = interaction.options.getChannel("channel") ?? interaction.channel!;
    const reason = getReason(interaction);
    const guild = interaction.guild!;

    if (!isTextGuildChannel(channel)) {
      await replyError(interaction, "Invalid", "Can only lock text channels");
      return;
    }

    await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }, { reason });

    await interaction.reply(ephemeralCard(makeSuccessCard("Locked", [
      `**Channel**\n${channel}`,
      `**Reason**\n${reason}`,
    ])));
  },
};

export const unlockDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock a channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption(o => o.setName("channel").setDescription("Channel to unlock").setRequired(false))
    .addStringOption(o => o.setName("reason").setDescription("Reason for unlock").setRequired(false)),
  requiredPermit: "mod.lock",
  async execute(interaction) {
    const channel = interaction.options.getChannel("channel") ?? interaction.channel!;
    const reason = getReason(interaction);
    const guild = interaction.guild!;

    if (!isTextGuildChannel(channel)) {
      await replyError(interaction, "Invalid", "Can only unlock text channels");
      return;
    }

    await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }, { reason });

    await interaction.reply(ephemeralCard(makeSuccessCard("Unlocked", [
      `**Channel**\n${channel}`,
      `**Reason**\n${reason}`,
    ])));
  },
};

export const lockdownDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("Lock all channels in the server")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName("reason").setDescription("Reason for lockdown").setRequired(false)),
  requiredPermit: "mod.lockdown",
  async execute(interaction) {
    const reason = getReason(interaction);
    const guild = interaction.guild!;

    const channels = guild.channels.cache.filter(c => isTextGuildChannel(c));

    await Promise.all(
      [...channels.values()].map((channel) =>
        channel.permissionOverwrites
          .edit(guild.roles.everyone, { SendMessages: false }, { reason })
          .catch(() => undefined),
      ),
    );

    await interaction.reply(ephemeralCard(makeWarningCard("Lockdown", [
      `**Channels locked**\n${channels.size}`,
      `**Reason**\n${reason}`,
    ])));
  },
};

