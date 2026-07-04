import { ApplyOptions } from "@sapphire/decorators";
import { ApplicationCommandRegistry, type Args } from "@sapphire/framework";
import {
  Colors,
  type ChatInputCommandInteraction,
  type Message,
  type GuildMember,
  MessageFlags,
} from "discord.js";
import { BaseSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import {
  makeSuccessCard,
  makeErrorCard,
  type CardReply,
} from "#utilities/cards.js";
import { formatAuditReason } from "#utilities/audit.js";
import { logError } from "#utilities/errors.js";
import {
  parseDuration,
  formatDuration,
  logToChannel,
  scheduleCaseLift,
} from "../lib/helpers.js";

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

@ApplyOptions<BaseSubcommand.Options>({
  name: "timeout",
  description: "Timeout or untimeout a member",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.MOD,
  subcommands: [
    {
      name: "add",
      chatInputRun: "chatInputRunAdd",
      messageRun: "messageRunAdd",
    },
    {
      name: "remove",
      chatInputRun: "chatInputRunRemove",
      messageRun: "messageRunRemove",
    },
  ],
})
export class TimeoutCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      b
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((s) =>
          s
            .setName("add")
            .setDescription("Time a member out from your server")
            .addUserOption((o) =>
              o
                .setName("member")
                .setDescription("Member to timeout")
                .setRequired(true),
            )
            .addStringOption((o) =>
              o
                .setName("duration")
                .setDescription("Duration e.g. 10m, 2h, 1d (max 28d)")
                .setRequired(true),
            )
            .addStringOption((o) =>
              o.setName("reason").setDescription("Reason").setRequired(false),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("remove")
            .setDescription("Remove the timeout of a member")
            .addUserOption((o) =>
              o
                .setName("member")
                .setDescription("Member to untimeout")
                .setRequired(true),
            )
            .addStringOption((o) =>
              o.setName("reason").setDescription("Reason").setRequired(false),
            ),
        ),
    );
  }

  public async chatInputRunAdd(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const member = interaction.options.getMember(
      "member",
    ) as GuildMember | null;
    const durationStr = interaction.options.getString("duration", true);
    const reason =
      interaction.options.getString("reason") ?? "No reason provided.";
    if (!member)
      return interaction.editReply(
        makeErrorCard("Not Found", "Member not in this server."),
      );
    return this.#add(
      interaction.guildId!,
      member,
      interaction.user.id,
      durationStr,
      reason,
      (c) => interaction.editReply(c),
    );
  }

  public async messageRunAdd(message: Message, args: Args) {
    const member = await args.pick("member").catch(() => null);
    const durationStr = await args.pick("string").catch(() => null);
    const reason = await args.rest("string").catch(() => "No reason provided.");
    if (!member)
      return message.reply(
        makeErrorCard("Not Found", "Provide a valid member."),
      );
    if (!durationStr)
      return message.reply(
        makeErrorCard(
          "Missing Duration",
          "Provide a duration e.g. `10m`, `2h`.",
        ),
      );
    return this.#add(
      message.guildId!,
      member,
      message.author.id,
      durationStr,
      reason,
      (c) => message.reply(c),
    );
  }

  public async chatInputRunRemove(interaction: ChatInputCommandInteraction) {
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
    return this.#remove(
      interaction.guildId!,
      member,
      interaction.user.id,
      reason,
      (c) => interaction.editReply(c),
    );
  }

  public async messageRunRemove(message: Message, args: Args) {
    const member = await args.pick("member").catch(() => null);
    const reason = await args.rest("string").catch(() => "No reason provided.");
    if (!member)
      return message.reply(
        makeErrorCard("Not Found", "Provide a valid member."),
      );
    return this.#remove(
      message.guildId!,
      member,
      message.author.id,
      reason,
      (c) => message.reply(c),
    );
  }

  async #add(
    guildId: string,
    member: GuildMember,
    actorId: string,
    durationStr: string,
    reason: string,
    reply: (c: CardReply) => unknown,
  ) {
    const ms = parseDuration(durationStr);
    if (!ms)
      return reply(
        makeErrorCard(
          "Invalid Duration",
          "Use formats like `10m`, `2h`, `1d`. Max 28d.",
        ),
      );
    if (ms > MAX_TIMEOUT_MS)
      return reply(
        makeErrorCard("Too Long", "Discord limits timeouts to 28 days."),
      );

    const until = new Date(Date.now() + ms);
    const actor = await this.container.client.users.fetch(actorId);
    try {
      await member.timeout(until.getTime(), formatAuditReason(actor, reason));
    } catch (err: unknown) {
      logError(`timeout add: guild=${guildId} target=${member.id}`, err);
      return reply(
        makeErrorCard("Failed", "Could not apply timeout. Check permissions."),
      );
    }
    const c = await this.container.db.moderation.createModerationCase({
      guildId,
      userId: member.id,
      moderatorId: actorId,
      action: "mute",
      reason,
      durationSeconds: Math.floor(ms / 1000),
      expiresAt: until,
    });
    await scheduleCaseLift(this.container, c);
    await logToChannel(
      guildId,
      "🔇 Timed Out",
      Colors.Orange,
      member.id,
      actor,
      reason,
      c.caseNumber,
    );
    return reply(
      makeSuccessCard(
        "🔇 Timed Out",
        `${member} timed out for **${formatDuration(ms)}**.\n**Reason:** ${reason}\n**Case #${c.caseNumber}**`,
      ),
    );
  }

  async #remove(
    guildId: string,
    member: GuildMember,
    actorId: string,
    reason: string,
    reply: (c: CardReply) => unknown,
  ) {
    const actor = await this.container.client.users.fetch(actorId);
    try {
      await member.timeout(null, formatAuditReason(actor, reason));
    } catch (err: unknown) {
      logError(`timeout remove: guild=${guildId} target=${member.id}`, err);
      return reply(
        makeErrorCard("Failed", "Could not remove timeout. Check permissions."),
      );
    }
    await this.container.db.moderation.createModerationCase({
      guildId,
      userId: member.id,
      moderatorId: actorId,
      action: "unmute",
      reason,
    });
    return reply(
      makeSuccessCard(
        "🔊 Timeout Removed",
        `${member}'s timeout has been removed.`,
      ),
    );
  }
}
