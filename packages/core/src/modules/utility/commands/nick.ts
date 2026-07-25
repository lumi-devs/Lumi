import { ApplyOptions } from "@sapphire/decorators";
import type { Args } from "@sapphire/framework";
import { Message, PermissionFlagsBits } from "discord.js";
import { BaseCommand, fetchTyped } from "#lib/commands.js";
import {
  makeErrorCard,
  makeWarningCard,
  makeSuccessCard,
} from "#lib/utilities/cards.js";
import { LanguageKeys } from "#lib/i18n/keys.js";

@ApplyOptions<BaseCommand.Options>({
  name: "nick",
  description: "Change a member's nickname.",
  preconditions: ["GuildOnly"],
  requiredClientPermissions: [PermissionFlagsBits.ManageNicknames],
  requiredUserPermissions: [PermissionFlagsBits.ManageNicknames],
})
export class UserCommand extends BaseCommand {
  public override async messageRun(message: Message, args: Args) {
    const t = await fetchTyped(message);

    const member = await args.pick("member").catch(() => null);
    if (!member) {
      return message.reply({
        ...makeErrorCard(
          t(LanguageKeys.Commands.NickUsageTitle),
          t(LanguageKeys.Commands.NickUsage),
        ),
        allowedMentions: {},
      });
    }

    const newNick = args.finished ? null : await args.rest("string");

    if (member.id === message.author.id) {
      return message.reply({
        ...makeWarningCard(
          t(LanguageKeys.Commands.NickInvalidTargetTitle),
          t(LanguageKeys.Commands.NickInvalidTarget),
        ),
        allowedMentions: {},
      });
    }

    if (
      message.guild?.members.me &&
      member.roles.highest.position >=
        message.guild.members.me.roles.highest.position
    ) {
      return message.reply({
        ...makeErrorCard(
          t(LanguageKeys.Commands.NickPermissionDeniedTitle),
          t(LanguageKeys.Commands.NickRoleHierarchy),
        ),
        allowedMentions: {},
      });
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
            tag: message.author.tag,
          })
        : t(LanguageKeys.Commands.NickResetDesc, {
            oldNick,
            tag: message.author.tag,
          });

      return message.reply({
        ...makeSuccessCard(title, desc),
        allowedMentions: {},
      });
    } catch {
      return message.reply({
        ...makeErrorCard(
          t(LanguageKeys.Commands.NickPermissionDeniedTitle),
          t(LanguageKeys.Commands.NickFailed),
        ),
        allowedMentions: {},
      });
    }
  }
}
