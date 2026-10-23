import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  userMention,
} from "discord.js";
import type { CommandDef } from "@lumi/module-kit";
import { makeErrorCard, makeSuccessCard } from "@lumi/ui";
import { logModAction, notifyPunishedUser, recordCase } from "../services/case.ts";
import {
  applyQuarantine,
  liftQuarantine,
  QuarantineError,
} from "../services/quarantine.ts";
import { resolveMemberTarget } from "../services/target.ts";

function quarantineErrorCard(error: QuarantineError) {
  const titles: Record<QuarantineError["code"], string> = {
    unconfigured: "Quarantine Unconfigured",
    "already-quarantined": "Already Quarantined",
    "not-quarantined": "Not Quarantined",
    "role-hierarchy": "Role Hierarchy",
    "role-missing": "Role Missing",
  };
  return makeErrorCard(titles[error.code], error.message);
}

export const quarantineCommand: CommandDef = {
  name: "quarantine",
  description: "Isolate a member and suspend their custom permit rights.",
  module: "mod",
  guildOnly: true,
  prefix: true,
  permitNode: "mod.quarantine",
  requiredPermissions: PermissionFlagsBits.ModerateMembers,
  build: () =>
    new SlashCommandBuilder()
      .setName("quarantine")
      .setDescription("Isolate a member and suspend their custom permits.")
      .addSubcommand((sub) =>
        sub
          .setName("add")
          .setDescription("Quarantine a member.")
          .addUserOption((option) =>
            option.setName("user").setDescription("Member to quarantine").setRequired(true),
          )
          .addStringOption((option) =>
            option.setName("reason").setDescription("Reason").setMaxLength(1_000),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("remove")
          .setDescription("Remove quarantine from a member.")
          .addUserOption((option) =>
            option.setName("user").setDescription("Member to unquarantine").setRequired(true),
          )
          .addStringOption((option) =>
            option.setName("reason").setDescription("Reason").setMaxLength(1_000),
          ),
      ),
  async run(ctx) {
    const guild = ctx.guild;
    if (!guild) return ctx.reply(makeErrorCard("Server Only", "This command can only be used in a server."));

    const resolved = await resolveMemberTarget(ctx);
    if (resolved.error) return ctx.reply(resolved.error);

    const { user, member } = resolved.target;
    const reason = (await ctx.getString("reason", { rest: true })) ?? null;
    await ctx.defer();

    try {
      if (ctx.getSubcommand() === "remove") {
        await liftQuarantine(ctx.services, member, {
          moderatorId: ctx.user.id,
          reason,
        });

        await ctx.services.db.moderation.deactivateActiveCases(guild.id, user.id, "quarantine");

        const modCase = await recordCase(ctx.services, guild.id, {
          userId: user.id,
          moderatorId: ctx.user.id,
          action: "unquarantine",
          reason: reason ?? "Quarantine lifted",
        });

        await logModAction(ctx.services, guild, modCase);

        return ctx.reply(
          makeSuccessCard(
            "Quarantine Removed",
            `Lifted quarantine for ${userMention(user.id)} and restored their roles (Case **#${modCase.caseNumber}**).`,
          ),
        );
      }

      await applyQuarantine(ctx.services, member, {
        moderatorId: ctx.user.id,
        reason,
      });

      await ctx.services.db.moderation.deactivateActiveCases(guild.id, user.id, "quarantine");

      const modCase = await recordCase(ctx.services, guild.id, {
        userId: user.id,
        moderatorId: ctx.user.id,
        action: "quarantine",
        reason: reason ?? "No reason provided",
      });

      await notifyPunishedUser(ctx.services, guild, user, "quarantine", reason);
      await logModAction(ctx.services, guild, modCase);

      return ctx.reply(
        makeSuccessCard(
          "Member Quarantined",
          `Quarantined ${userMention(user.id)} (Case **#${modCase.caseNumber}**).\nCustom permit rights are suspended while quarantined.\n**Reason:** ${reason ?? "No reason provided."}`,
        ),
      );
    } catch (error) {
      if (error instanceof QuarantineError) {
        return ctx.reply(quarantineErrorCard(error));
      }
      throw error;
    }
  },
};
