import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  userMention,
} from "discord.js";
import type { CommandDef } from "@lumi/module-kit";
import { makeErrorCard, makeSuccessCard } from "@lumi/ui";
import { logModAction, notifyPunishedUser, recordCase } from "../services/case.ts";
import { resolveUserTarget } from "../services/target.ts";

export const softbanCommand: CommandDef = {
  name: "softban",
  description: "Ban and immediately unban a user to purge their recent messages.",
  module: "mod",
  guildOnly: true,
  prefix: true,
  permitNode: ["mod.softBan", "mod.softban"],
  requiredPermissions: PermissionFlagsBits.BanMembers,
  build: () =>
    new SlashCommandBuilder()
      .setName("softban")
      .setDescription("Ban and immediately unban a user to purge their recent messages.")
      .addUserOption((option) =>
        option.setName("user").setDescription("User to softban").setRequired(true),
      )
      .addStringOption((option) =>
        option.setName("reason").setDescription("Reason for the softban").setMaxLength(1_000),
      ),
  async run(ctx) {
    const guild = ctx.guild;
    if (!guild) return ctx.reply(makeErrorCard("Server Only", "This command can only be used in a server."));

    const resolved = await resolveUserTarget(ctx);
    if (resolved.error) return ctx.reply(resolved.error);

    const { user } = resolved.target;
    const reason = (await ctx.getString("reason", { rest: true })) ?? "Softban message purge";

    await ctx.defer();

    const modCase = await recordCase(ctx.services, guild.id, {
      userId: user.id,
      moderatorId: ctx.user.id,
      action: "softban",
      reason,
    });

    try {
      await guild.members.ban(user.id, {
        deleteMessageSeconds: 7 * 86_400,
        reason: `Softban: ${reason} | By ${ctx.user.tag} (Case #${modCase.caseNumber})`,
      });
    } catch (error) {
      await ctx.services.db.moderation.deleteCase(guild.id, modCase.caseNumber);
      const message = error instanceof Error ? error.message : "Discord rejected the softban.";
      return ctx.reply(makeErrorCard("Softban Failed", message));
    }

    try {
      await guild.members.unban(user.id, `Softban cleanup | By ${ctx.user.tag}`);
    } catch (error) {
      // The purge half succeeded. Keep the case so the still-active ban is
      // visible in the audit trail, and tell the moderator how to recover.
      const message = error instanceof Error ? error.message : "Discord rejected the unban.";
      await logModAction(ctx.services, guild, modCase);
      return ctx.reply(
        makeErrorCard(
          "Softban Partially Applied",
          `The user is still banned because Discord rejected the unban.\n**Reason:** ${message}\nRemove the ban with \`/unban user_id:${user.id}\`.`,
        ),
      );
    }

    await notifyPunishedUser(ctx.services, guild, user, "softban", reason);
    await logModAction(ctx.services, guild, modCase);

    return ctx.reply(
      makeSuccessCard(
        "Member Softbanned",
        `Softbanned ${userMention(user.id)} (Case **#${modCase.caseNumber}**).\nPurged 7 days of message history.\n**Reason:** ${reason}`,
      ),
    );
  },
};
