import { ApplyOptions } from "@sapphire/decorators";
import { ApplicationCommandRegistry, type Args } from "@sapphire/framework";
import {
  ApplicationIntegrationType,
  Colors,
  type ChatInputCommandInteraction,
  type Message,
  type GuildMember,
  MessageFlags,
} from "discord.js";
import { EmberCommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { makeSuccessCard, makeErrorCard } from "#utilities/cards.js";
import { logToChannel } from "../lib/helpers.js";
import { incrementWarnCount, checkThresholds } from "../lib/thresholds.js";

@ApplyOptions<EmberCommand.Options>({
  name: "warn",
  description: "Warn a member",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.MOD,
})
export class WarnCommand extends EmberCommand {
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
            .setDescription("Member to warn")
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
      (card) => interaction.editReply(card),
    );
  }

  public override async messageRun(message: Message, args: Args) {
    const member = await args.pick("member").catch(() => null);
    const reason = await args.rest("string").catch(() => "No reason provided.");
    if (!member)
      return message.reply(
        makeErrorCard("Not Found", "Provide a valid member mention or ID."),
      );
    return this.#execute(
      message.guildId!,
      member,
      message.author.id,
      reason,
      (card) => message.reply(card),
    );
  }

  async #execute(
    guildId: string,
    member: GuildMember,
    actorId: string,
    reason: string,
    reply: (card: ReturnType<typeof makeSuccessCard>) => Promise<unknown>,
  ) {
    const actor = await this.container.client.users.fetch(actorId);
    const c = await this.container.db.moderation.createModerationCase({
      guildId,
      userId: member.id,
      moderatorId: actorId,
      action: "warn",
      reason,
    });

    await member
      .send(
        makeSuccessCard(
          `⚠️ Warning — ${member.guild.name}`,
          `**Reason:** ${reason}\n-# Case #${c.caseNumber}`,
        ),
      )
      .catch(() => null);

    await logToChannel(
      this.container,
      guildId,
      "⚠️ Warned",
      Colors.Yellow,
      member.id,
      actor,
      reason,
      c.caseNumber,
    ).catch((err: unknown) =>
      this.container.logger.warn("[Warn] Log channel send failed:", err),
    );

    const warnCount = await incrementWarnCount(
      this.container,
      guildId,
      member.id,
    );
    checkThresholds(this.container, guildId, member.id, warnCount).catch(
      (err: unknown) =>
        this.container.logger.error("[Warn] Threshold check failed:", err),
    );

    return reply(
      makeSuccessCard(
        "⚠️ Warned",
        `${member} warned.\n**Reason:** ${reason}\n**Case #${c.caseNumber}** — ${warnCount} total warn(s).`,
      ),
    );
  }
}
