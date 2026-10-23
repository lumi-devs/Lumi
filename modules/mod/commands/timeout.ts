import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  userMention,
} from "discord.js";
import type { CommandDef } from "@lumi/module-kit";
import { formatDuration, parseDuration, Time } from "@lumi/foundation";
import { makeErrorCard, makeSuccessCard } from "@lumi/ui";
import { logModAction, notifyPunishedUser, recordCase } from "../services/case.ts";
import { resolveMemberTarget } from "../services/target.ts";

const MaxTimeoutMs = 28 * Time.Day;

export const timeoutCommand: CommandDef = {
  name: "timeout",
  description: "Timeout a member for a specified duration.",
  module: "mod",
  guildOnly: true,
  prefix: true,
  permitNode: ["mod.timeout", "mod.mute"],
  requiredPermissions: PermissionFlagsBits.ModerateMembers,
  build: () =>
    new SlashCommandBuilder()
      .setName("timeout")
      .setDescription("Timeout a member for a specified duration.")
      .addUserOption((option) =>
        option.setName("user").setDescription("Member to timeout").setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("duration")
          .setDescription("Duration, e.g. 10m, 2h, 1d (max 28d)")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option.setName("reason").setDescription("Reason for the timeout").setMaxLength(1_000),
      ),
  async run(ctx) {
    const guild = ctx.guild;
    if (!guild) return ctx.reply(makeErrorCard("Server Only", "This command can only be used in a server."));

    const resolved = await resolveMemberTarget(ctx);
    if (resolved.error) return ctx.reply(resolved.error);

    const { user, member } = resolved.target;
    const durationRaw = await ctx.getString("duration");
    const durationMs = durationRaw ? parseDuration(durationRaw) : null;
    if (!durationMs || durationMs <= 0 || durationMs > MaxTimeoutMs) {
      return ctx.reply(
        makeErrorCard(
          "Invalid Duration",
          "Provide a duration between 1 second and 28 days (e.g. `10m`, `2h`, `1d`).",
        ),
      );
    }

    const reason = (await ctx.getString("reason", { rest: true })) ?? "No reason provided";
    const expiresAt = new Date(Date.now() + durationMs);

    await ctx.defer();

    const modCase = await recordCase(ctx.services, guild.id, {
      userId: user.id,
      moderatorId: ctx.user.id,
      action: "mute",
      duration: Math.floor(durationMs / 1_000),
      expiresAt,
      reason,
    });

    try {
      await member.timeout(durationMs, `${reason} | By ${ctx.user.tag} (Case #${modCase.caseNumber})`);
    } catch (error) {
      await ctx.services.db.moderation.deleteCase(guild.id, modCase.caseNumber);
      const message = error instanceof Error ? error.message : "Discord rejected the timeout.";
      return ctx.reply(makeErrorCard("Timeout Failed", message));
    }

    await notifyPunishedUser(ctx.services, guild, user, "timeout", reason);
    await logModAction(ctx.services, guild, modCase);

    return ctx.reply(
      makeSuccessCard(
        "Member Timed Out",
        `Timed out ${userMention(user.id)} for **${formatDuration(durationMs)}** (Case **#${modCase.caseNumber}**).\n**Reason:** ${reason}`,
      ),
    );
  },
};
