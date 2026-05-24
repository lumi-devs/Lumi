import { ApplyOptions } from "@sapphire/decorators";
import { Command, Args } from "@sapphire/framework";
import { Message, PermissionFlagsBits } from "discord.js";
import {
  makeErrorCard,
  makeWarningCard,
  makeSuccessCard,
} from "#utilities/cards.js";

@ApplyOptions<Command.Options>({
  name: "nick",
  description: "Change a member's nickname.",
  preconditions: ["GuildOnly"],
  requiredClientPermissions: [PermissionFlagsBits.ManageNicknames],
  requiredUserPermissions: [PermissionFlagsBits.ManageNicknames],
})
export class UserCommand extends Command {
  public override async messageRun(message: Message, args: Args) {
    const member = await args.pick("member").catch(() => null);
    if (!member) {
      return message.reply({
        ...makeErrorCard("Usage", "`,nick @user [new_nick]`"),
        allowedMentions: {},
      });
    }

    const newNick = args.finished ? null : await args.rest("string");

    if (member.id === message.author.id) {
      return message.reply({
        ...makeWarningCard(
          "Invalid Target",
          "You cannot change your own nickname this way.",
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
          "Permission Denied",
          "Cannot change nickname of someone equal to or above my role.",
        ),
        allowedMentions: {},
      });
    }

    try {
      const oldNick = member.displayName;
      await member.setNickname(newNick);

      const action = newNick
        ? `**${oldNick}** → **${newNick}**`
        : `**${oldNick}**'s nickname reset.`;
      const title = newNick ? "Nickname Changed" : "Nickname Reset";

      const finalDesc = `${action}\n\n-# Changed by ${message.author.tag}`;

      return message.reply({
        ...makeSuccessCard(title, finalDesc),
        allowedMentions: {},
      });
    } catch {
      return message.reply({
        ...makeErrorCard(
          "Permission Denied",
          "Missing permissions to change that nickname.",
        ),
        allowedMentions: {},
      });
    }
  }
}
