import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#lib/commands/command-def.js";
import type { CommandContext } from "#lib/commands/context.js";
import { applyLocalizedBuilder } from "#lib/i18n/index.js";
import { time, TimestampStyles, userMention } from "@discordjs/formatters";
import { makeInfoCard } from "#lib/ui/cards.js";
import { decrementWarnCount } from "@lumi/application/services/mod/thresholds.js";
import { CaseAction, type $Enums } from "@prisma/client";

function isCaseAction(value: string): value is $Enums.CaseAction {
  return (Object.values(CaseAction) as string[]).includes(value);
}

function chunk<T>(items: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    pages.push(items.slice(i, i + size));
  }
  return pages;
}

async function viewOne(ctx: CommandContext, caseNumber: number) {
  const t = await ctx.fetchT();
  const c = await ctx.services.db.moderation.getModerationCase(
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

async function viewList(
  ctx: CommandContext,
  userId: string | undefined,
  action: $Enums.CaseAction | undefined,
) {
  const t = await ctx.fetchT();
  if (!userId) {
    return ctx.replyError(
      t("commands:casesUsageTitle"),
      t("commands:casesViewUsage"),
    );
  }
  const cases = await ctx.services.db.moderation.getModerationCases(
    ctx.guildId!,
    userId,
    action,
  );
  if (cases.length === 0) {
    return ctx.replyEmpty(
      t("commands:casesNoneTitle"),
      t("commands:casesNone"),
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

async function view(ctx: CommandContext) {
  await ctx.defer();
  let caseNumber: number | null = null;
  let userId: string | undefined;
  let action: $Enums.CaseAction | undefined;

  if (ctx.isSlash) {
    caseNumber = await ctx.getInteger("case_number");
    userId = (await ctx.getUser("member"))?.id;
    const rawAction = await ctx.getString("action");
    action = rawAction && isCaseAction(rawAction) ? rawAction : undefined;
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

  if (caseNumber !== null) return viewOne(ctx, caseNumber);
  return viewList(ctx, userId, action);
}

async function modify(ctx: CommandContext) {
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

  const existing = await ctx.services.db.moderation.getModerationCase(
    ctx.guildId!,
    caseNumber,
  );
  if (!existing) {
    return ctx.replyError(
      t("commands:casesNotFoundTitle"),
      t("commands:casesNotFound", { caseNumber }),
    );
  }

  await ctx.services.db.moderation.updateCaseReason(existing.id, reason);
  return ctx.replySuccess(
    t("commands:casesUpdatedTitle"),
    t("commands:casesUpdated", { caseNumber, reason }),
  );
}

async function remove(ctx: CommandContext) {
  await ctx.defer();
  const t = await ctx.fetchT();
  const caseNumber = await ctx.getInteger("case_number", { required: true });
  const existing = await ctx.services.db.moderation.getModerationCase(
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
    await decrementWarnCount(ctx.services, ctx.guildId!, existing.userId);
  }
  await ctx.services.db.moderation.deleteModerationCase(
    ctx.guildId!,
    caseNumber!,
  );
  return ctx.replySuccess(
    t("commands:casesDeletedTitle"),
    t("commands:casesDeleted", { caseNumber }),
  );
}

export const casesDef: CommandDef = {
  name: "cases",
  description: "View or modify moderation cases",
  guildOnly: true,
  requiredPermit: "mod.*",
  prefixEnabled: true,
  build: () => {
    const b = new SlashCommandBuilder().setName("cases");
    return (
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
        )
    );
  },
  handlers: {
    view: {
      run: (ctx: CommandContext) => view(ctx),
      requiredPermit: "mod.cases",
    },
    modify: {
      run: (ctx: CommandContext) => modify(ctx),
      requiredPermit: "mod.cases",
    },
    delete: {
      run: (ctx: CommandContext) => remove(ctx),
      requiredPermit: "mod.cases",
    },
  },
  defaultSub: "view",
};
