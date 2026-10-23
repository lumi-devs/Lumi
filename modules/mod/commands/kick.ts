import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  userMention,
} from "discord.js";
import type { CommandDef } from "@lumi/module-kit";
import { makeErrorCard, makeSuccessCard } from "@lumi/ui";
import { logModAction, notifyPunishedUser, recordCase } from "../services/case.ts";
import { resolveMemberTarget } from "../services/target.ts";

export const kickCommand: CommandDef = {
  name: "kick",
  description: "Kick a member from the server.",
  module: "mod",
  guildOnly: true,
  prefix: true,
  permitNode: "mod.kick",
  requiredPermissions: PermissionFlagsBits.KickMembers,
  build: () =>
    new SlashCommandBuilder()
      .setName("kick")
      .setDescription("Kick a member from the server.")
      .addUserOption((option) =>
        option.setName("user").setDescription("Member to kick").setRequired(true),
      )
      .addStringOption((option) =>
        option.setName("reason").setDescription("Reason for the kick").setMaxLength(1_000),
      ),
  async run(ctx) {
    const guild = ctx.guild;
    if (!guild) return ctx.reply(makeErrorCard("Server Only", "This command can only be used in a server."));

    const resolved = await resolveMemberTarget(ctx);
    if (resolved.error) return ctx.reply(resolved.error);

    const { user, member } = resolved.target;
    const reason = (await ctx.getString("reason", { rest: true })) ?? "No reason provided";

    await ctx.defer();

    const modCase = await recordCase(ctx.services, guild.id, {
      userId: user.id,
      moderatorId: ctx.user.id,
      action: "kick",
      reason,
    });

    try {
      await member.kick(`${reason} | By ${ctx.user.tag} (Case #${modCase.caseNumber})`);
    } catch (error) {
      await ctx.services.db.moderation.deleteCase(guild.id, modCase.caseNumber);
      const message = error instanceof Error ? error.message : "Discord rejected the kick.";
      return ctx.reply(makeErrorCard("Kick Failed", message));
    }

    await notifyPunishedUser(ctx.services, guild, user, "kick", reason);
    await logModAction(ctx.services, guild, modCase);

    return ctx.reply(
      makeSuccessCard(
        "Member Kicked",
        `Kicked ${userMention(user.id)} (Case **#${modCase.caseNumber}**).\n**Reason:** ${reason}`,
      ),
    );
  },
};
