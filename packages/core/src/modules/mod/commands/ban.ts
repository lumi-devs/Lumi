import { ApplyOptions } from "@sapphire/decorators";
import { ApplicationCommandRegistry, type Args } from "@sapphire/framework";
import { userMention } from "@discordjs/formatters";
import {
  ApplicationIntegrationType,
  Colors,
  type ChatInputCommandInteraction,
  type Message,
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
import { logToChannel } from "../lib/helpers.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "ban",
  description: "Ban or unban a user",
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
export class BanCommand extends BaseSubcommand {
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
        .addSubcommand((s) =>
          s
            .setName("add")
            .setDescription("Ban a member from your server")
            .addUserOption((o) =>
              o.setName("user").setDescription("User to ban").setRequired(true),
            )
            .addStringOption((o) =>
              o.setName("reason").setDescription("Reason").setRequired(false),
            )
            .addIntegerOption((o) =>
              o
                .setName("delete_days")
                .setDescription("Days of messages to delete (0–7)")
                .setMinValue(0)
                .setMaxValue(7)
                .setRequired(false),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("remove")
            .setDescription("Unban a user from your server")
            .addStringOption((o) =>
              o
                .setName("user_id")
                .setDescription("User ID to unban")
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
    const user = interaction.options.getUser("user", true);
    const reason =
      interaction.options.getString("reason") ?? "No reason provided.";
    const deleteDays = interaction.options.getInteger("delete_days") ?? 0;
    return this.#ban(
      interaction.guildId!,
      user.id,
      interaction.user.id,
      reason,
      deleteDays,
      (c) => interaction.editReply(c),
    );
  }

  public async messageRunAdd(message: Message, args: Args) {
    const user = await args.pick("user").catch(() => null);
    const reason = await args.rest("string").catch(() => "No reason provided.");
    if (!user)
      return message.reply(
        makeErrorCard("Not Found", "Provide a valid user mention or ID."),
      );
    return this.#ban(
      message.guildId!,
      user.id,
      message.author.id,
      reason,
      0,
      (c) => message.reply(c),
    );
  }

  public async chatInputRunRemove(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const userId = interaction.options.getString("user_id", true).trim();
    const reason =
      interaction.options.getString("reason") ?? "No reason provided.";
    return this.#unban(
      interaction.guildId!,
      userId,
      interaction.user.id,
      reason,
      (c) => interaction.editReply(c),
    );
  }

  public async messageRunRemove(message: Message, args: Args) {
    const userId =
      (await args.pick("string").catch(() => null))?.replace(/\D/g, "") ?? null;
    const reason = await args.rest("string").catch(() => "No reason provided.");
    if (!userId)
      return message.reply(
        makeErrorCard("Missing", "Provide a user ID to unban."),
      );
    return this.#unban(
      message.guildId!,
      userId,
      message.author.id,
      reason,
      (c) => message.reply(c),
    );
  }

  async #ban(
    guildId: string,
    userId: string,
    actorId: string,
    reason: string,
    deleteDays: number,
    reply: (c: CardReply) => unknown,
  ) {
    const guild = this.container.client.guilds.cache.get(guildId);
    if (!guild)
      return reply(
        makeErrorCard("Internal Error", "Guild not found in cache."),
      );
    const actor = await this.container.client.users.fetch(actorId);
    try {
      await guild.members.ban(userId, {
        reason: formatAuditReason(actor, reason),
        deleteMessageSeconds: deleteDays * 86400,
      });
    } catch (err: unknown) {
      logError(`ban: guild=${guildId} target=${userId}`, err);
      return reply(
        makeErrorCard(
          "Failed",
          "Could not ban. Check bot permissions and hierarchy.",
        ),
      );
    }
    const c = await this.container.db.moderation.createModerationCase({
      guildId,
      userId,
      moderatorId: actorId,
      action: "ban",
      reason,
    });
    await logToChannel(
      this.container,
      guildId,
      "🔨 Banned",
      Colors.DarkRed,
      userId,
      actor,
      reason,
      c.caseNumber,
    );
    return reply(
      makeSuccessCard(
        "🔨 Banned",
        `${userMention(userId)} has been banned.\n**Reason:** ${reason}\n**Case #${c.caseNumber}**`,
      ),
    );
  }

  async #unban(
    guildId: string,
    userId: string,
    actorId: string,
    reason: string,
    reply: (c: CardReply) => unknown,
  ) {
    if (!/^\d{17,20}$/.test(userId))
      return reply(
        makeErrorCard("Invalid ID", "Provide a valid Discord user ID."),
      );
    const guild = this.container.client.guilds.cache.get(guildId);
    if (!guild)
      return reply(
        makeErrorCard("Internal Error", "Guild not found in cache."),
      );
    const actor = await this.container.client.users.fetch(actorId);
    try {
      await guild.bans.remove(userId, formatAuditReason(actor, reason));
    } catch (err: unknown) {
      logError(`unban: guild=${guildId} target=${userId}`, err);
      return reply(
        makeErrorCard("Failed", "User is not banned or bot lacks permissions."),
      );
    }
    await this.container.db.moderation.createModerationCase({
      guildId,
      userId,
      moderatorId: actorId,
      action: "unban",
      reason,
    });
    return reply(
      makeSuccessCard("Unbanned", `${userMention(userId)} has been unbanned.`),
    );
  }
}
