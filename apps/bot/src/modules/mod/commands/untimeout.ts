import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  userMention,
} from "discord.js";
import type { CommandDef } from "@lumi/bot-kit";
import { makeErrorCard, makeSuccessCard } from "@lumi/ui";
import { logModAction, recordCase } from "../services/case.ts";
import { resolveMemberTarget } from "../services/target.ts";

export const untimeoutCommand: CommandDef = {
  name: "untimeout",
  description: "Remove a timeout from a member.",
  module: "mod",
  guildOnly: true,
  prefix: true,
  permitNode: ["mod.timeout", "mod.unmute"],
  requiredPermissions: PermissionFlagsBits.ModerateMembers,
  build: () =>
    new SlashCommandBuilder()
      .setName("untimeout")
      .setDescription("Remove a timeout from a member.")
      .addUserOption((option) =>
        option.setName("user").setDescription("Member to remove the timeout from").setRequired(true),
      )
      .addStringOption((option) =>
        option.setName("reason").setDescription("Reason for removing the timeout").setMaxLength(1_000),
      ),
  async run(ctx) {
    const guild = ctx.guild;
    if (!guild) return ctx.reply(makeErrorCard("Server Only", "This command can only be used in a server."));

    const resolved = await resolveMemberTarget(ctx);
    if (resolved.error) return ctx.reply(resolved.error);

    const { user, member } = resolved.target;
    const reason = (await ctx.getString("reason", { rest: true })) ?? "Timeout removed";

    await ctx.defer();

    try {
      await member.timeout(null, `${reason} | By ${ctx.user.tag}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Discord rejected the change.";
      return ctx.reply(makeErrorCard("Failed", message));
    }

    await ctx.services.db.moderation.deactivateActiveCases(guild.id, user.id, "mute");

    const modCase = await recordCase(ctx.services, guild.id, {
      userId: user.id,
      moderatorId: ctx.user.id,
      action: "unmute",
      reason,
    });

    await logModAction(ctx.services, guild, modCase);

    return ctx.reply(
      makeSuccessCard(
        "Timeout Removed",
        `Removed the timeout for ${userMention(user.id)} (Case **#${modCase.caseNumber}**).\n**Reason:** ${reason}`,
      ),
    );
  },
};
