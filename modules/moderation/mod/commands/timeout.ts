import type { CommandDefinition } from "@lumi/module-kit";
import { ephemeralCard, makeSuccessCard } from "@lumi/ui";
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getModerationConfig } from "../config.js";
import { describeError, getReason, isImmune, replyError } from "../helpers.js";

export const timeoutDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) =>
      o.setName("user").setDescription("User to timeout").setRequired(true),
    )
    .addIntegerOption((o) =>
      o
        .setName("duration")
        .setDescription("Duration in minutes")
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("reason")
        .setDescription("Reason for timeout")
        .setRequired(false)
        .setAutocomplete(true),
    ),
  requiredPermit: "mod.timeout",
  async execute(interaction, services) {
    const target = interaction.options.getUser("user", true);
    const duration = interaction.options.getInteger("duration", true);
    const reason = getReason(interaction);
    const guild = interaction.guild!;
    const config = await getModerationConfig(services, guild.id);

    try {
      const member = await guild.members.fetch(target.id).catch(() => null);
      if (!member) {
        await replyError(
          interaction,
          "Not in guild",
          "User is not in this server",
        );
        return;
      }
      if (isImmune(member, config)) {
        await replyError(
          interaction,
          "Immune",
          "This member has an immune role",
        );
        return;
      }
      if (!member.moderatable) {
        await replyError(
          interaction,
          "Cannot timeout",
          "Cannot timeout this user (higher role or bot)",
        );
        return;
      }
      await member.timeout(duration * 60 * 1000, reason);

      await services.db.prisma.moderationCase.create({
        data: {
          guildId: guild.id,
          type: "TIMEOUT",
          targetId: target.id,
          moderatorId: interaction.user.id,
          reason,
          metadata: { duration },
        },
      });

      await interaction.reply(
        ephemeralCard(
          makeSuccessCard("Timed out", [
            `**User**\n${target.tag} (\`${target.id}\`)`,
            `**Duration**\n${duration} minute${duration === 1 ? "" : "s"}`,
            `**Reason**\n${reason}`,
          ]),
        ),
      );
    } catch (e) {
      await replyError(interaction, "Timeout failed", describeError(e));
    }
  },
};
