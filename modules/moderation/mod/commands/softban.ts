import type { CommandDefinition } from "@lumi/module-kit";
import { ephemeralCard, makeSuccessCard } from "@lumi/ui";
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getModerationConfig } from "../config.js";
import { describeError, getReason, isImmune, replyError } from "../helpers.js";

export const softbanDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("softban")
    .setDescription("Softban a user (ban + immediate unban)")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) =>
      o.setName("user").setDescription("User to softban").setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("reason")
        .setDescription("Reason")
        .setRequired(false)
        .setAutocomplete(true),
    ),
  requiredPermit: "mod.ban",
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
    if (member && !member.bannable) {
      await replyError(
        interaction,
        "Cannot softban",
        "Cannot softban this user (higher role or bot)",
      );
      return;
    }

    try {
      await guild.members.ban(target, { reason, deleteMessageSeconds: 86400 });
      await guild.bans.remove(target.id, `Softban: ${reason}`);

      await services.db.prisma.moderationCase.create({
        data: {
          guildId: guild.id,
          type: "SOFTBAN",
          targetId: target.id,
          moderatorId: interaction.user.id,
          reason,
        },
      });

      await interaction.reply(
        ephemeralCard(
          makeSuccessCard("Softbanned", [
            `**User**\n${target.tag} (\`${target.id}\`)`,
            `**Reason**\n${reason}`,
          ]),
        ),
      );
    } catch (e) {
      await replyError(interaction, "Softban failed", describeError(e));
    }
  },
};
