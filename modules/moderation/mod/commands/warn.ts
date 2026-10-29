import type { CommandDefinition } from "@lumi/module-kit";
import { ephemeralCard, makeSuccessCard } from "@lumi/ui";
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getModerationConfig } from "../config.js";
import { describeError, getReason, isImmune, replyError } from "../helpers.js";

export const warnDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("user").setDescription("User to warn").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason for warning").setRequired(false).setAutocomplete(true)),
  requiredPermit: "mod.warn",
  async execute(interaction, services) {
    const target = interaction.options.getUser("user", true);
    const reason = getReason(interaction);
    const guild = interaction.guild!;
    const config = await getModerationConfig(services, guild.id);
    const member = await guild.members.fetch(target.id).catch(() => null);

    if (isImmune(member, config)) {
      await replyError(interaction, "Immune", "This member has an immune role");
      return;
    }

    await services.db.prisma.moderationCase.create({
      data: { guildId: guild.id, type: "WARN", targetId: target.id, moderatorId: interaction.user.id, reason },
    });

    const warnCount = await services.db.prisma.moderationCase.count({
      where: { guildId: guild.id, targetId: target.id, type: "WARN", active: true },
    });
    const threshold = config.warnThresholds[String(warnCount)];
    let autoAction: string | null = null;

    if (member && threshold) {
      try {
        if (threshold.action === "timeout") {
          await member.timeout(
            (threshold.duration ?? 60) * 1000,
            `Warn threshold (${warnCount} warnings)`,
          );
        } else if (threshold.action === "kick") {
          await member.kick(`Warn threshold (${warnCount} warnings)`);
        } else {
          await guild.members.ban(member, {
            reason: `Warn threshold (${warnCount} warnings)`,
          });
        }

        await services.db.prisma.moderationCase.create({
          data: {
            guildId: guild.id,
            type: threshold.action.toUpperCase(),
            targetId: target.id,
            moderatorId: interaction.client.user!.id,
            reason: `Automatic action after ${warnCount} warnings`,
            metadata: { automatic: true, warnCount },
          },
        });
        autoAction = threshold.action;
      } catch (error) {
        autoAction = `failed: ${describeError(error)}`;
      }
    }

    await interaction.reply(ephemeralCard(makeSuccessCard("Warned", [
      `**User**\n${target.tag} (\`${target.id}\`)`,
      `**Warnings**\n${warnCount}`,
      `**Reason**\n${reason}`,
      ...(autoAction ? [`**Automatic action**\n${autoAction}`] : []),
    ])));
  },
};

