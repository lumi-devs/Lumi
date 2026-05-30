import { ApplyOptions } from "@sapphire/decorators";
import { ApplicationCommandRegistry, type Args } from "@sapphire/framework";
import { time, TimestampStyles, userMention } from "@discordjs/formatters";
import { chunk } from "@sapphire/utilities";
import {
  ApplicationIntegrationType,
  type ChatInputCommandInteraction,
  type Message,
  MessageFlags,
} from "discord.js";
import { BaseSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import {
  makeInfoCard,
  makeSuccessCard,
  makeErrorCard,
  type CardReply,
} from "#utilities/cards.js";
import { decrementWarnCount } from "../lib/thresholds.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "cases",
  description: "View or modify moderation cases",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.MOD,
  subcommands: [
    {
      name: "view",
      chatInputRun: "chatInputRunView",
      messageRun: "messageRunView",
      default: true,
    },
    {
      name: "modify",
      chatInputRun: "chatInputRunModify",
      messageRun: "messageRunModify",
    },
  ],
})
export class CasesCommand extends BaseSubcommand {
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
            .setName("view")
            .setDescription("View cases for a member or a specific case")
            .addUserOption((o) =>
              o
                .setName("member")
                .setDescription("Member to look up")
                .setRequired(false),
            )
            .addIntegerOption((o) =>
              o
                .setName("case_number")
                .setDescription("Specific case number")
                .setRequired(false),
            )
            .addStringOption((o) =>
              o
                .setName("action")
                .setDescription("Filter by action")
                .setRequired(false)
                .addChoices(
                  { name: "warn", value: "warn" },
                  { name: "mute", value: "mute" },
                  { name: "kick", value: "kick" },
                  { name: "ban", value: "ban" },
                ),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("modify")
            .setDescription("Edit the reason of a case")
            .addIntegerOption((o) =>
              o
                .setName("case_number")
                .setDescription("Case number to edit")
                .setRequired(true),
            )
            .addStringOption((o) =>
              o
                .setName("reason")
                .setDescription("New reason")
                .setRequired(true),
            ),
        ),
    );
  }

  // ── view ───────────────────────────────────────────────────────────────────

  public async chatInputRunView(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const caseNumber = interaction.options.getInteger("case_number");
    if (caseNumber !== null)
      return this.#viewOne(interaction.guildId!, caseNumber, (c) =>
        interaction.editReply(c),
      );

    const user = interaction.options.getUser("member");
    const action = interaction.options.getString("action") ?? undefined;
    return this.#viewList(interaction.guildId!, user?.id, action, (c) =>
      interaction.editReply(c),
    );
  }

  public async messageRunView(message: Message, args: Args) {
    const first = await args.pick("string").catch(() => null);
    if (first && /^\d+$/.test(first) && first.length < 8) {
      return this.#viewOne(message.guildId!, parseInt(first, 10), (c) =>
        message.reply(c),
      );
    }
    const member = first
      ? await message
          .guild!.members.fetch(first.replace(/\D/g, ""))
          .catch(() => null)
      : null;
    return this.#viewList(message.guildId!, member?.id, undefined, (c) =>
      message.reply(c),
    );
  }

  // ── modify ─────────────────────────────────────────────────────────────────

  public async chatInputRunModify(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const caseNumber = interaction.options.getInteger("case_number", true);
    const reason = interaction.options.getString("reason", true);
    return this.#modify(interaction.guildId!, caseNumber, reason, (c) =>
      interaction.editReply(c),
    );
  }

  public async messageRunModify(message: Message, args: Args) {
    const caseNumberStr = await args.pick("string").catch(() => null);
    const reason = await args.rest("string").catch(() => null);
    if (!caseNumberStr || !reason)
      return message.reply(
        makeErrorCard("Usage", "`,cases modify <case_number> <reason>`"),
      );
    return this.#modify(
      message.guildId!,
      parseInt(caseNumberStr, 10),
      reason,
      (c) => message.reply(c),
    );
  }

  async #viewOne(
    guildId: string,
    caseNumber: number,
    reply: (c: CardReply) => unknown,
  ) {
    const c = await this.container.db.moderation.getModerationCase(
      guildId,
      caseNumber,
    );
    if (!c)
      return reply(
        makeErrorCard("Not Found", `Case #${caseNumber} does not exist.`),
      );
    const lines = [
      `**Action:** ${c.action}`,
      `**Target:** ${userMention(c.userId)} (${c.userId})`,
      `**Moderator:** ${userMention(c.moderatorId)}`,
      `**Reason:** ${c.reason ?? "—"}`,
      `**Date:** ${time(c.createdAt, TimestampStyles.RelativeTime)}`,
      c.expiresAt
        ? `**Expires:** ${time(c.expiresAt, TimestampStyles.RelativeTime)}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    return reply(makeInfoCard(`Case #${caseNumber}`, lines));
  }

  async #viewList(
    guildId: string,
    userId: string | undefined,
    action: string | undefined,
    reply: (c: CardReply) => unknown,
  ) {
    if (!userId)
      return reply(
        makeErrorCard("Missing", "Provide a member or case number."),
      );
    const cases = await this.container.db.moderation.getModerationCases(
      guildId,
      userId,
      action,
    );
    if (cases.length === 0)
      return reply(makeInfoCard("No Cases", "No cases found for this member."));
    const lines = cases.map(
      (c) =>
        `**#${c.caseNumber}** \`${c.action}\` — ${c.reason ?? "—"} ${time(c.createdAt, TimestampStyles.RelativeTime)}`,
    );
    const pages = chunk(lines, 10);
    const body = pages[0]!.join("\n");
    const footer =
      pages.length > 1
        ? `Page 1/${pages.length} • ${cases.length} total cases`
        : undefined;
    return reply(
      makeInfoCard(`Cases for ${userMention(userId)}`, body, { footer }),
    );
  }

  async #modify(
    guildId: string,
    caseNumber: number,
    reason: string,
    reply: (c: CardReply) => unknown,
  ) {
    const existing = await this.container.db.moderation.getModerationCase(
      guildId,
      caseNumber,
    );
    if (!existing)
      return reply(
        makeErrorCard("Not Found", `Case #${caseNumber} does not exist.`),
      );

    await this.container.db.moderation.updateCaseReason(existing.id, reason);

    // Decrement warn counter if we're deleting a warn case
    if (existing.action === "warn") {
      await decrementWarnCount(this.container, guildId, existing.userId);
      await this.container.db.moderation.deleteModerationCase(
        guildId,
        caseNumber,
      );
      return reply(
        makeSuccessCard(
          "Case Deleted",
          `Case #${caseNumber} has been removed.`,
        ),
      );
    }

    return reply(
      makeSuccessCard(
        "Case Updated",
        `Case #${caseNumber} reason updated to: ${reason}`,
      ),
    );
  }
}
