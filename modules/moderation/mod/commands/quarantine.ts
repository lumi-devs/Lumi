import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "@lumi/module-kit";
import { getModerationConfig } from "../config.js";
import { ephemeralCard, makeSuccessCard, makeWarningCard } from "@lumi/ui";
import { getReason, isImmune, replyError } from "../helpers.js";

export const quarantineDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("quarantine")
    .setDescription("Quarantine a user (assign quarantine role, remove other roles)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("user").setDescription("User to quarantine").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false).setAutocomplete(true)),
  requiredPermit: "mod.quarantine",
  async execute(interaction, services) {
    const target = interaction.options.getUser("user", true);
    const reason = getReason(interaction);
    const guild = interaction.guild!;
    const config = await getModerationConfig(services, guild.id);

    if (!config.quarantineRoleId) {
      await replyError(interaction, "Not configured", "Quarantine role not set");
      return;
    }

    const member = await guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      await replyError(interaction, "Not found", "User not in server");
      return;
    }
    if (isImmune(member, config)) {
      await replyError(interaction, "Immune", "This member has an immune role");
      return;
    }
    if (!member.manageable) {
      await replyError(
        interaction,
        "Cannot quarantine",
        "That member's highest role is above mine.",
      );
      return;
    }

    const oldRoles = member.roles.cache.filter(r => r.id !== guild.id).map(r => r.id);
    const quarantineRole = guild.roles.cache.get(config.quarantineRoleId);

    if (!quarantineRole) {
      await replyError(interaction, "Failed", "Quarantine role not found");
      return;
    }

    await member.roles.set([quarantineRole], reason);

    await services.db.prisma.moderationCase.create({
      data: {
        guildId: guild.id,
        type: "QUARANTINE",
        targetId: target.id,
        moderatorId: interaction.user.id,
        reason,
        metadata: { oldRoles }
      },
    });

    await interaction.reply(ephemeralCard(makeWarningCard("Quarantined", [
      `**User**\n${target.tag} (\`${target.id}\`)`,
      `**Role**\n${quarantineRole}`,
      `**Reason**\n${reason}`,
    ])));
  },
};

export const unquarantineDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("unquarantine")
    .setDescription("Remove quarantine from a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("user").setDescription("User to unquarantine").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)),
  requiredPermit: "mod.quarantine",
  async execute(interaction, services) {
    const target = interaction.options.getUser("user", true);
    const reason = getReason(interaction);
    const guild = interaction.guild!;

    const member = await guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      await replyError(interaction, "Not found", "User not in server");
      return;
    }
    if (!member.manageable) {
      await replyError(
        interaction,
        "Cannot unquarantine",
        "That member's highest role is above mine.",
      );
      return;
    }

    const quarantineCase = await services.db.prisma.moderationCase.findFirst({
      where: { guildId: guild.id, type: "QUARANTINE", targetId: target.id, active: true },
      orderBy: { createdAt: "desc" }
    });

    const oldRoles = quarantineCase?.metadata?.oldRoles as string[] ?? [];
    const validRoles = oldRoles.filter(id => guild.roles.cache.has(id));

    await member.roles.set(validRoles, reason);

    if (quarantineCase) {
      await services.db.prisma.moderationCase.update({
        where: { id: quarantineCase.id },
        data: { active: false }
      });
    }

    await services.db.prisma.moderationCase.create({
      data: { guildId: guild.id, type: "UNQUARANTINE", targetId: target.id, moderatorId: interaction.user.id, reason },
    });

    await interaction.reply(ephemeralCard(makeSuccessCard("Unquarantined", [
      `**User**\n${target.tag} (\`${target.id}\`)`,
      `**Roles restored**\n${validRoles.length}`,
      `**Reason**\n${reason}`,
    ])));
  },
};

