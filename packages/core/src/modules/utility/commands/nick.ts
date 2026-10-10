import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi/lib/commands/command-def.js";
import type { CommandContext } from "@lumi/lib/commands/context.js";

export const nickDef: CommandDef = {
  name: "nick",
  description: "Change a member's nickname.",
  guildOnly: true,
  requiredClientPermissions: [PermissionFlagsBits.ManageNicknames],
  prefixEnabled: true,
  build: () => {
    const b = new SlashCommandBuilder().setName("nick");
    return (
      b
        .setName("nick")
        .setDescription("Change a member's nickname.")
        .addUserOption((o) =>
          o
            .setName("member")
            .setDescription("Member to rename")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("nickname")
            .setDescription("New nickname; omit to reset")
            .setRequired(false),
        )
    ) as SlashCommandBuilder;
  },
  run: async (ctx: CommandContext): Promise<void> => {
    const t = await ctx.fetchT();

    const member = await ctx.getMember("member", { required: true }).catch(
      () => null,
    );
    if (!member) {
      return ctx.replyError(
        t("commands:nickUsageTitle"),
        t("commands:nickUsage"),
      );
    }

    const newNick = await ctx.getString("nickname", { rest: true });

    if (member.id === ctx.user.id) {
      return ctx.replyWarning(
        t("commands:nickInvalidTargetTitle"),
        t("commands:nickInvalidTarget"),
      );
    }

    // Discord only checks the *bot's* role against the target for the API call
    // itself, so without this a member holding just Manage Nicknames could
    // use the bot to rename anyone below the bot - moderators and admins
    // included - who outranks them personally. Owner is exempt: they may not
    // hold a role above everyone they can otherwise manage.
    const moderator = ctx.member;
    if (
      moderator &&
      ctx.guild?.ownerId !== moderator.id &&
      member.roles.highest.position >= moderator.roles.highest.position
    ) {
      return ctx.replyError(
        t("commands:nickPermissionDeniedTitle"),
        t("commands:nickRoleHierarchy"),
      );
    }

    const me = ctx.guild?.members.me;
    if (me && member.roles.highest.position >= me.roles.highest.position) {
      return ctx.replyError(
        t("commands:nickPermissionDeniedTitle"),
        t("commands:nickRoleHierarchy"),
      );
    }

    try {
      const oldNick = member.displayName;
      await member.setNickname(newNick);

      const title = newNick
        ? t("commands:nickSuccessTitle")
        : t("commands:nickResetTitle");
      const desc = newNick
        ? t("commands:nickChangedDesc", {
            oldNick,
            newNick,
            tag: ctx.user.tag,
          })
        : t("commands:nickResetDesc", {
            oldNick,
            tag: ctx.user.tag,
          });

      return ctx.replySuccess(title, desc);
    } catch {
      return ctx.replyError(
        t("commands:nickPermissionDeniedTitle"),
        t("commands:nickFailed"),
      );
    }
  },
};
