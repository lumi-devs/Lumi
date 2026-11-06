import type { CommandDefinition } from "@lumi/module-kit";
import { ephemeralCard, makeSuccessCard } from "@lumi/ui";
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getModerationConfig } from "../config.js";
import {
  canActOn,
  describeError,
  getCaseLink,
  getReason,
  isImmune,
  replyError,
  resolveActor,
} from "../helpers.js";

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
    )
    .addStringOption((o) =>
      o
        .setName("message_id")
        .setDescription("Message ID to link to this case")
        .setRequired(false),
    ),
  requiredPermit: "mod.timeout",
  async execute(interaction, services) {
    const target = interaction.options.getUser("user", true);
    const duration = interaction.options.getInteger("duration", true);
    const reason = getReason(interaction);
    const guild = interaction.guild!;
    const config = await getModerationConfig(services, guild.id);
    const actor = await resolveActor(interaction);
    if (!actor) {
      await replyError(
        interaction,
        "Cannot verify roles",
        "I could not verify your server roles. Try again.",
      );
      return;
    }

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
      if (!canActOn(actor, member)) {
        await replyError(
          interaction,
          "Cannot timeout",
          "You cannot timeout a member with an equal or higher role.",
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

      await services.helpers.moderation.create({
        guildId: guild.id,
        kind: "timeout",
        targetId: target.id,
        moderatorId: interaction.user.id,
        reason,
        ...getCaseLink(interaction),
        duration: duration * 60,
        expiresAt: new Date(Date.now() + duration * 60 * 1000),
        metadata: { duration },
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
