import { ApplyOptions } from "@sapphire/decorators";
import { ApplicationCommandRegistry, type Args } from "@sapphire/framework";
import {
  Colors,
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
import { formatAuditReason } from "#utilities/audit.js";
import { logError } from "#utilities/errors.js";
import { logToChannel } from "../lib/helpers.js";

@ApplyOptions<BaseCommand.Options>({
  name: "kick",
  description: "Kick a member from the server",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.MOD,
})
export class KickCommand extends BaseCommand {
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
            .setDescription("Member to kick")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("reason").setDescription("Reason").setRequired(false),
        ),
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const member = interaction.options.getMember(
      "member",
    ) as GuildMember | null;
    const reason =
      interaction.options.getString("reason") ?? "No reason provided.";
    if (!member)
      return interaction.editReply(
        makeErrorCard("Not Found", "Member not in this server."),
      );
    return this.#execute(
      interaction.guildId!,
      member,
      interaction.user.id,
      reason,
      (c) => interaction.editReply(c),
    );
  }

  public override async messageRun(message: Message, args: Args) {
    const member = await args.pick("member").catch(() => null);
    const reason = await args.rest("string").catch(() => "No reason provided.");
    if (!member)
      return message.reply(
        makeErrorCard("Not Found", "Provide a valid member."),
      );
    return this.#execute(
      message.guildId!,
      member,
      message.author.id,
      reason,
      (c) => message.reply(c),
    );
  }

  async #execute(
    guildId: string,
    member: GuildMember,
    actorId: string,
    reason: string,
    reply: (c: CardReply) => unknown,
  ) {
    const actor = await this.container.client.users.fetch(actorId);
    try {
      await member.kick(formatAuditReason(actor, reason));
    } catch (err: unknown) {
      logError(`kick: guild=${guildId} target=${member.id}`, err);
      return reply(
        makeErrorCard(
          "Failed",
          "Could not kick. Check permissions and hierarchy.",
        ),
      );
    }
    const c = await this.container.db.moderation.createModerationCase({
      guildId,
      userId: member.id,
      moderatorId: actorId,
      action: "kick",
      reason,
    });
    await logToChannel(
      guildId,
      "👢 Kicked",
      Colors.Red,
      member.id,
      actor,
      reason,
      c.caseNumber,
    );
    return reply(
      makeSuccessCard(
        "👢 Kicked",
        `${member.user.username} has been kicked.\n**Reason:** ${reason}\n**Case #${c.caseNumber}**`,
      ),
    );
  }
}
