import { ApplyOptions } from "@sapphire/decorators";
import { ApplicationCommandRegistry } from "@sapphire/framework";
import { PermissionFlagsBits } from "discord.js";
import { BaseCommand, type CommandContext } from "#lib/commands.js";
import { LanguageKeys } from "#lib/i18n/keys.js";

@ApplyOptions<BaseCommand.Options>({
  name: "nick",
  description: "Change a member's nickname.",
  preconditions: ["GuildOnly"],
  requiredClientPermissions: [PermissionFlagsBits.ManageNicknames],
  requiredUserPermissions: [PermissionFlagsBits.ManageNicknames],
  prefixEnabled: true,
})
export class UserCommand extends BaseCommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      b
        .setName(this.name)
        .setDescription(this.description)
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
        ),
    );
  }

  public override async run(ctx: CommandContext): Promise<void> {
    const t = await ctx.fetchT();

    const member = await ctx.getMember("member", { required: true }).catch(
      () => null,
    );
    if (!member) {
      return ctx.replyError(
        t(LanguageKeys.Commands.NickUsageTitle),
        t(LanguageKeys.Commands.NickUsage),
      );
    }

    const newNick = await ctx.getString("nickname", { rest: true });

    if (member.id === ctx.user.id) {
      return ctx.replyWarning(
        t(LanguageKeys.Commands.NickInvalidTargetTitle),
        t(LanguageKeys.Commands.NickInvalidTarget),
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
        t(LanguageKeys.Commands.NickPermissionDeniedTitle),
        t(LanguageKeys.Commands.NickRoleHierarchy),
      );
    }

    const me = ctx.guild?.members.me;
    if (me && member.roles.highest.position >= me.roles.highest.position) {
      return ctx.replyError(
        t(LanguageKeys.Commands.NickPermissionDeniedTitle),
        t(LanguageKeys.Commands.NickRoleHierarchy),
      );
    }

    try {
      const oldNick = member.displayName;
      await member.setNickname(newNick);

      const title = newNick
        ? t(LanguageKeys.Commands.NickSuccessTitle)
        : t(LanguageKeys.Commands.NickResetTitle);
      const desc = newNick
        ? t(LanguageKeys.Commands.NickChangedDesc, {
            oldNick,
            newNick,
            tag: ctx.user.tag,
          })
        : t(LanguageKeys.Commands.NickResetDesc, {
            oldNick,
            tag: ctx.user.tag,
          });

      return ctx.replySuccess(title, desc);
    } catch {
      return ctx.replyError(
        t(LanguageKeys.Commands.NickPermissionDeniedTitle),
        t(LanguageKeys.Commands.NickFailed),
      );
    }
  }
}
