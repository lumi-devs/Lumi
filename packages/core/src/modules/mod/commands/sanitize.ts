import { ApplyOptions } from "@sapphire/decorators";
import { ApplicationCommandRegistry, type Args } from "@sapphire/framework";
import {
  ApplicationIntegrationType,
  type ChatInputCommandInteraction,
  type Message,
  type GuildMember,
  MessageFlags,
} from "discord.js";
import { BaseCommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import {
  makeSuccessCard,
  makeErrorCard,
  type CardReply,
} from "#utilities/cards.js";

// Chars that sort before letters, used for hoisting in member lists
const DEHOIST_REGEX = /^[\x21-\x40\x5B-\x60\x7B-\x7E\s]+/u;

function sanitizeName(name: string): string {
  const dehoisted = name.replace(DEHOIST_REGEX, "").trim();
  return dehoisted.length >= 2 ? dehoisted : "Sanitized User";
}

@ApplyOptions<BaseCommand.Options>({
  name: "sanitize",
  description: "Remove hoisting characters from a member's nickname",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.MOD,
})
export class SanitizeCommand extends BaseCommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      b
        .setName(this.name)
        .setDescription(this.description)
        .setDefaultMemberPermissions(this.defaultMemberPermissions ?? null)
        .setContexts(...this.contexts)
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
        .addUserOption((o) =>
          o
            .setName("member")
            .setDescription("Member to sanitize")
            .setRequired(true),
        ),
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const member = interaction.options.getMember(
      "member",
    ) as GuildMember | null;
    if (!member)
      return interaction.editReply(
        makeErrorCard("Not Found", "Member not in this server."),
      );
    return this.#execute(member, (c) => interaction.editReply(c));
  }

  public override async messageRun(message: Message, args: Args) {
    const member = await args.pick("member").catch(() => null);
    if (!member)
      return message.reply(
        makeErrorCard("Not Found", "Provide a valid member."),
      );
    return this.#execute(member, (c) => message.reply(c));
  }

  async #execute(member: GuildMember, reply: (c: CardReply) => unknown) {
    const current = member.nickname ?? member.user.username;
    const sanitized = sanitizeName(current);

    if (sanitized === current) {
      return reply(
        makeErrorCard(
          "Nothing to Do",
          `${member.user.username}'s name has no hoisting characters.`,
        ),
      );
    }

    try {
      await member.setNickname(
        sanitized,
        "Sanitize: removed hoisting characters",
      );
    } catch {
      return reply(
        makeErrorCard(
          "Failed",
          "Could not change nickname. Check permissions and hierarchy.",
        ),
      );
    }

    return reply(
      makeSuccessCard(
        "Sanitized",
        `${member.user.username}'s nickname changed: \`${current}\` → \`${sanitized}\``,
      ),
    );
  }
}
