import { ApplyOptions } from "@sapphire/decorators";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { applyLocalizedBuilder } from "@sapphire/plugin-i18next";
import { time, TimestampStyles, userMention } from "@discordjs/formatters";
import { chunk } from "@sapphire/utilities";
import { BaseSubcommand, type CommandContext } from "#lib/commands.js";
import { makeInfoCard } from "#lib/utilities/cards.js";
import { decrementWarnCount } from "../lib/thresholds.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "cases",
  description: "View or modify moderation cases",
  preconditions: ["GuildOnly"],
  requiredPermit: "mod.*",
  prefixEnabled: true,
  subcommands: [
    { name: "view", run: "view", default: true },
    { name: "modify", run: "modify" },
    { name: "delete", run: "delete" },
  ],
})
export class CasesCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      applyLocalizedBuilder(b, "commands:cases")
        .addSubcommand((s) =>
          applyLocalizedBuilder(s, "commands:casesView")
            .addUserOption((o) =>
              applyLocalizedBuilder(o, "commands:casesMember").setRequired(
                false,
              ),
            )
            .addIntegerOption((o) =>
              applyLocalizedBuilder(o, "commands:casesNumber").setRequired(
                false,
              ),
            )
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:casesAction")
                .setRequired(false)
                .addChoices(
                  { name: "warn", value: "warn" },
                  { name: "mute", value: "mute" },
                  { name: "kick", value: "kick" },
                  { name: "ban", value: "ban" },
                  { name: "quarantine", value: "quarantine" },
                  { name: "voice mute", value: "voice_mute" },
                ),
            ),
        )
        .addSubcommand((s) =>
          applyLocalizedBuilder(s, "commands:casesModify")
            .addIntegerOption((o) =>
              applyLocalizedBuilder(o, "commands:casesNumber").setRequired(
                true,
              ),
            )
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:casesNewReason").setRequired(
                true,
              ),
            ),
        )
        .addSubcommand((s) =>
          applyLocalizedBuilder(s, "commands:casesDelete").addIntegerOption(
            (o) =>
              applyLocalizedBuilder(o, "commands:casesNumber").setRequired(
                true,
              ),
          ),
        ),
    );
  }

  public async view(ctx: CommandContext) {
    await ctx.defer();
    let caseNumber: number | null = null;
    let userId: string | undefined;
    let action: string | undefined;

    if (ctx.isSlash) {
      caseNumber = await ctx.getInteger("case_number");
      userId = (await ctx.getUser("member"))?.id;
      action = (await ctx.getString("action")) ?? undefined;
    } else {
      const first = await ctx.getString("member");
      if (first && /^\d+$/.test(first) && first.length < 8) {
        caseNumber = parseInt(first, 10);
      } else if (first) {
        const member = await ctx
          .guild!.members.fetch(first.replace(/\D/g, ""))
          .catch(() => null);
        userId = member?.id;
      }
    }

    if (caseNumber !== null) return this.#viewOne(ctx, caseNumber);
    return this.#viewList(ctx, userId, action);
  }

  public async modify(ctx: CommandContext) {
    await ctx.defer();
    const t = await ctx.fetchT();
    const caseNumber = ctx.isSlash
      ? await ctx.getInteger("case_number", { required: true })
      : await ctx.getInteger("case_number");
    const reason = await ctx.getString("reason", { rest: true });
    if (caseNumber === null || !reason) {
      return ctx.replyError(
        t("commands:casesUsageTitle"),
        t("commands:casesModifyUsage"),
      );
    }

    const existing = await this.container.db.moderation.getModerationCase(
      ctx.guildId!,
      caseNumber,
    );
    if (!existing) {
      return ctx.replyError(
        t("commands:casesNotFoundTitle"),
        t("commands:casesNotFound", { caseNumber }),
      );
    }

    await this.container.db.moderation.updateCaseReason(existing.id, reason);
    return ctx.replySuccess(
      t("commands:casesUpdatedTitle"),
      t("commands:casesUpdated", { caseNumber, reason }),
    );
  }

  public async delete(ctx: CommandContext) {
    await ctx.defer();
    const t = await ctx.fetchT();
    const caseNumber = await ctx.getInteger("case_number", { required: true });
    const existing = await this.container.db.moderation.getModerationCase(
      ctx.guildId!,
      caseNumber!,
    );
    if (!existing) {
      return ctx.replyError(
        t("commands:casesNotFoundTitle"),
        t("commands:casesNotFound", { caseNumber }),
      );
    }

    if (existing.action === "warn") {
      await decrementWarnCount(this.container, ctx.guildId!, existing.userId);
    }
    await this.container.db.moderation.deleteModerationCase(
      ctx.guildId!,
      caseNumber!,
    );
    return ctx.replySuccess(
      t("commands:casesDeletedTitle"),
      t("commands:casesDeleted", { caseNumber }),
    );
  }

  async #viewOne(ctx: CommandContext, caseNumber: number) {
    const t = await ctx.fetchT();
    const c = await this.container.db.moderation.getModerationCase(
      ctx.guildId!,
      caseNumber,
    );
    if (!c) {
      return ctx.replyError(
        t("commands:casesNotFoundTitle"),
        t("commands:casesNotFound", { caseNumber }),
      );
    }
    const lines = [
      `**Action:** ${c.action}`,
      `**Target:** ${userMention(c.userId)} (${c.userId})`,
      `**Moderator:** ${userMention(c.moderatorId)}`,
      `**Reason:** ${c.reason ?? "-"}`,
      `**Date:** ${time(c.createdAt, TimestampStyles.RelativeTime)}`,
      c.expiresAt
        ? `**Expires:** ${time(c.expiresAt, TimestampStyles.RelativeTime)}`
        : "",
    ]
      .filter((line) => line.length > 0)
      .join("\n");
    return ctx.replyInfo(`Case #${caseNumber}`, lines);
  }

  async #viewList(
    ctx: CommandContext,
    userId: string | undefined,
    action: string | undefined,
  ) {
    const t = await ctx.fetchT();
    if (!userId) {
      return ctx.replyError(
        t("commands:casesUsageTitle"),
        t("commands:casesViewUsage"),
      );
    }
    const cases = await this.container.db.moderation.getModerationCases(
      ctx.guildId!,
      userId,
      action,
    );
    if (cases.length === 0) {
      return ctx.replyEmpty(
        "No Cases",
        "This user has no moderation cases.",
        "Run `,mod` to see available commands.",
      );
    }
    const lines = cases.map(
      (c) =>
        `**#${c.caseNumber}** \`${c.action}\` - ${c.reason ?? "-"} ${time(c.createdAt, TimestampStyles.RelativeTime)}`,
    );
    const pages = chunk(lines, 10);
    const body = pages[0]!.join("\n");
    const footer =
      pages.length > 1
        ? `Page 1/${pages.length} • ${cases.length} total cases`
        : undefined;
    return ctx.reply(
      makeInfoCard(`Cases for ${userMention(userId)}`, body, { footer }),
    );
  }
}
