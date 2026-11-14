import { errorMessage, isSnowflake } from "@lumi/foundation";
import type { CommandDefinition } from "@lumi/module-kit";
import { ephemeralCard, makeSuccessCard } from "@lumi/ui";
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getModerationConfig } from "../config.js";
import {
  actionCard,
  canActOn,
  getCaseLink,
  getDeleteDays,
  getReason,
  getTargets,
  isImmune,
  replyError,
  resolveActor,
} from "../helpers.js";

export const banAdd: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) =>
      o.setName("user").setDescription("User to ban").setRequired(false),
    )
    .addStringOption((o) =>
      o
        .setName("users")
        .setDescription("Additional user IDs")
        .setRequired(false),
    )
    .addStringOption((o) =>
      o
        .setName("reason")
        .setDescription("Reason for ban")
        .setRequired(false)
        .setAutocomplete(true),
    )
    .addIntegerOption((o) =>
      o
        .setName("delete_days")
        .setDescription("Days of messages to delete (0-7)")
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false),
    ),
  requiredPermit: "mod.ban",
  async execute(interaction, services) {
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
    const targets = await getTargets(interaction, config.maxTargets);
    if (targets.length === 0) {
      await replyError(
        interaction,
        "No targets",
        "Specify at least one user to ban",
      );
      return;
    }

    const reason = getReason(interaction);
    const deleteDays = getDeleteDays(interaction);
    const moderator = interaction.user;

    const lines: string[] = [];
    let failures = 0;

    for (const target of targets) {
      try {
        const member = await guild.members.fetch(target.id).catch(() => null);
        if (member && !canActOn(actor, member)) {
          failures++;
          lines.push(`❌ ${target.tag} — equal or higher role`);
          continue;
        }
        if (isImmune(member, config)) {
          failures++;
          lines.push(`❌ ${target.tag} — immune role`);
          continue;
        }
        if (member && !member.bannable) {
          failures++;
          lines.push(`❌ ${target.tag} — higher role or bot`);
          continue;
        }
        await guild.members.ban(target, {
          deleteMessageSeconds: deleteDays * 86400,
          reason,
        });

        await services.helpers.moderation.create({
          guildId: guild.id,
          kind: "ban",
          targetId: target.id,
          moderatorId: moderator.id,
          reason,
          ...getCaseLink(interaction),
          metadata: { deleteDays },
        });

        lines.push(`✅ ${target.tag} (\`${target.id}\`)`);
      } catch (e) {
        failures++;
        lines.push(`❌ ${target.tag} (\`${target.id}\`) — ${errorMessage(e)}`);
      }
    }

    await interaction.reply(
      ephemeralCard(actionCard("Banned", lines, failures, targets.length)),
    );
  },
};

export const banRemove: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((o) =>
      o.setName("user_id").setDescription("User ID to unban").setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("reason")
        .setDescription("Reason for unban")
        .setRequired(false)
        .setAutocomplete(true),
    ),
  requiredPermit: "mod.unban",
  async execute(interaction, services) {
    const userId = interaction.options.getString("user_id", true);
    const reason = getReason(interaction);
    const guild = interaction.guild!;

    if (!isSnowflake(userId)) {
      await replyError(
        interaction,
        "Invalid ID",
        "User ID must be a valid snowflake",
      );
      return;
    }

    try {
      await guild.bans.remove(userId, reason);

      await services.helpers.moderation.create({
        guildId: guild.id,
        kind: "unban",
        targetId: userId,
        moderatorId: interaction.user.id,
        reason,
        ...getCaseLink(interaction),
      });

      await interaction.reply(
        ephemeralCard(
          makeSuccessCard("Unbanned", [
            `**User**\n\`${userId}\``,
            `**Reason**\n${reason}`,
          ]),
        ),
      );
    } catch (e) {
      await replyError(interaction, "Unban failed", errorMessage(e));
    }
  },
};
