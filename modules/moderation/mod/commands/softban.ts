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

    if (member) {
      const actor = await resolveActor(interaction);
      if (!actor) {
        await replyError(
          interaction,
          "Cannot verify roles",
          "I could not verify your server roles. Try again.",
        );
        return;
      }
      if (!canActOn(actor, member)) {
        await replyError(
          interaction,
          "Cannot softban",
          "You cannot softban a member with an equal or higher role.",
        );
        return;
      }
    }
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

      await services.helpers.moderation.create({
        guildId: guild.id,
        kind: "softban",
        targetId: target.id,
        moderatorId: interaction.user.id,
        reason,
        ...getCaseLink(interaction),
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
