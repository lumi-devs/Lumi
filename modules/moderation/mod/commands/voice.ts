import type { CommandDefinition } from "@lumi/module-kit";
import { ephemeralCard, makeSuccessCard, makeWarningCard } from "@lumi/ui";
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getModerationConfig } from "../config.js";
import { getReason, isImmune, replyError } from "../helpers.js";

export const vcmuteDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("vcmute")
    .setDescription("Mute a user in voice channels")
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
    .addUserOption(o => o.setName("user").setDescription("User to mute").setRequired(true))
    .addIntegerOption(o => o.setName("duration").setDescription("Duration in minutes (0 = permanent)").setMinValue(0).setMaxValue(40320).setRequired(false))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false).setAutocomplete(true)),
  requiredPermit: "mod.vcmute",
  async execute(interaction, services) {
    const target = interaction.options.getUser("user", true);
    const duration = interaction.options.getInteger("duration") ?? 0;
    const reason = getReason(interaction);
    const guild = interaction.guild!;

    const member = await guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      await replyError(interaction, "Not found", "User not in server");
      return;
    }

    const config = await getModerationConfig(services, guild.id);
    if (isImmune(member, config)) {
      await replyError(interaction, "Immune", "This member has an immune role");
      return;
    }

    if (!member.voice.channel) {
      await replyError(interaction, "Not in VC", "User is not in a voice channel");
      return;
    }

    await member.voice.setMute(true, reason);

    if (duration > 0) {
      setTimeout(() => {
        member.voice.setMute(false, "VC mute expired").catch(() => {});
      }, duration * 60 * 1000);
    }

    await services.db.prisma.moderationCase.create({
      data: {
        guildId: guild.id,
        type: "VOICE_MUTE",
        targetId: target.id,
        moderatorId: interaction.user.id,
        reason,
        metadata: { duration }
      },
    });

    await interaction.reply(ephemeralCard(makeWarningCard("VC Muted", [
      `**User**\n${target.tag} (\`${target.id}\`)`,
      `**Duration**\n${duration > 0 ? `${duration} minute${duration === 1 ? "" : "s"}` : "Permanent"}`,
      `**Reason**\n${reason}`,
    ])));
  },
};

export const vcmuteRemoveDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("unvcmute")
    .setDescription("Remove voice mute from a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
    .addUserOption(o => o.setName("user").setDescription("User to unmute").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)),
  requiredPermit: "mod.vcmute",
  async execute(interaction, services) {
    const target = interaction.options.getUser("user", true);
    const reason = getReason(interaction);
    const guild = interaction.guild!;

    const member = await guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      await replyError(interaction, "Not found", "User not in server");
      return;
    }

    await member.voice.setMute(false, reason);

    await services.db.prisma.moderationCase.create({
      data: { guildId: guild.id, type: "UNVOICE_MUTE", targetId: target.id, moderatorId: interaction.user.id, reason },
    });

    await interaction.reply(ephemeralCard(makeSuccessCard("VC Unmuted", [
      `**User**\n${target.tag} (\`${target.id}\`)`,
      `**Reason**\n${reason}`,
    ])));
  },
};

