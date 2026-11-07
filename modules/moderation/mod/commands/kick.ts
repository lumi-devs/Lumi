import { errorMessage } from "@lumi/foundation";
import type { CommandDefinition } from "@lumi/module-kit";
import { ephemeralCard } from "@lumi/ui";
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getModerationConfig } from "../config.js";
import {
  actionCard,
  canActOn,
  getCaseLink,
  getReason,
  getTargets,
  isImmune,
  replyError,
  resolveActor,
} from "../helpers.js";

export const kickDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((o) =>
      o.setName("user").setDescription("User to kick").setRequired(false),
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
        .setDescription("Reason for kick")
        .setRequired(false)
        .setAutocomplete(true),
    ),
  requiredPermit: "mod.kick",
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
        "Specify at least one user to kick",
      );
      return;
    }

    const reason = getReason(interaction);

    const lines: string[] = [];
    let failures = 0;

    for (const target of targets) {
      try {
        const member = await guild.members.fetch(target.id).catch(() => null);
        if (!member) {
          failures++;
          lines.push(`❌ ${target.tag} — not in this server`);
          continue;
        }
        if (!canActOn(actor, member)) {
          failures++;
          lines.push(`❌ ${target.tag} — equal or higher role`);
          continue;
        }
        if (isImmune(member, config)) {
          failures++;
          lines.push(`❌ ${target.tag} — immune role`);
          continue;
        }
        if (!member.kickable) {
          failures++;
          lines.push(`❌ ${target.tag} — higher role or bot`);
          continue;
        }
        await member.kick(reason);

        await services.helpers.moderation.create({
          guildId: guild.id,
          kind: "kick",
          targetId: target.id,
          moderatorId: interaction.user.id,
          reason,
          ...getCaseLink(interaction),
        });

        lines.push(`✅ ${target.tag} (\`${target.id}\`)`);
      } catch (e) {
        failures++;
        lines.push(`❌ ${target.tag} (\`${target.id}\`) — ${errorMessage(e)}`);
      }
    }

    await interaction.reply(
      ephemeralCard(actionCard("Kicked", lines, failures, targets.length)),
    );
  },
};
