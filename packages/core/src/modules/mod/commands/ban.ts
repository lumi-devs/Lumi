import { respondWithReasonChoices } from "@lumi/application/services/mod/reason-autocomplete.js";
import type { Container } from "#lib/services.js";
import type { AutocompleteInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#lib/commands/command-def.js";
import type { CommandContext } from "#lib/commands/context.js";
import {
  runModerationFlow,
  type ModerationCommand as MC,
} from "#lib/moderation/ModerationCommand.js";
import { parseSnowflakeList, resolveUsers } from "#lib/moderation/multi-target.js";
import { Result } from "@lumi/shared";
import { applyLocalizedBuilder } from "#lib/i18n/index.js";
import { userMention } from "@discordjs/formatters";
import { isSnowflakeId } from "#lib/utilities/misc.js";
import type { ModerationCase } from "@prisma/client";
import type { User } from "discord.js";
import { BanAction } from "@lumi/application/services/mod/actions/BanAction.js";

const Root = "commands";
const SecondsPerDay = 86400;

/** Merges the single `user` option with the `users` mass-target string, deduped and capped. */
async function resolveBanTargets(
  ctx: MC.RunContext,
): Promise<User[]> {
  if (!ctx.isSlash) return ctx.getUsers("user", { required: true });

  const single = await ctx.getUser("user");
  const extra = await ctx.getString("users");
  const ids = new Set(extra ? parseSnowflakeList(extra) : []);
  if (single) ids.add(single.id);
  if (ids.size === 0) return [];

  const resolved = await resolveUsers(ctx.services, [...ids]);
  return single && !resolved.some((u) => u.id === single.id)
    ? [single, ...resolved]
    : resolved;
}

const BanAdd: MC.Flow<User, ModerationCase, number> = {
  logScope: "ban",
  duplicateCaseAction: "ban",
  resolveTarget: (ctx) => resolveBanTargets(ctx),
  preHandle: async (ctx) =>
    Result.ok(ctx.isSlash ? ((await ctx.getInteger("delete_days")) ?? 0) : 0),
  confirm: (t, { target, reason }) => ({
    title: t(`${Root}:banConfirmTitle`),
    body: t(`${Root}:banConfirmBody`, { user: userMention(target.id), reason }),
    confirmLabel: t(`${Root}:banConfirmButton`),
  }),
  action: ({ guild, target, moderator, reason, prepared }) =>
    BanAction.apply({
      guild,
      targetUser: target,
      moderator,
      reason,
      deleteMessageSeconds: prepared * SecondsPerDay,
    }),
  buildSuccessMessage: (t, { target, reason, outcome }) => ({
    title: t(`${Root}:banSuccessTitle`),
    body: t(`${Root}:banSuccess`, {
      user: userMention(target.id),
      reason,
      caseNumber: outcome.caseNumber,
    }),
  }),
};

const BanRemove: MC.Flow<string, ModerationCase> = {
  logScope: "unban",
  resolveTarget: async (ctx) => {
    const raw = await ctx.getString("user_id", { required: true });
    return (raw ?? "").replace(/\D/g, "");
  },
  preHandle: (_ctx, t, target) =>
    isSnowflakeId(target)
      ? Result.ok(null)
      : Result.err({
          title: t(`${Root}:banInvalidIdTitle`),
          body: t(`${Root}:banInvalidId`),
        }),
  action: ({ guild, target, moderator, reason }) =>
    BanAction.undo({ guild, targetId: target, moderator, reason }),
  buildFailureMessage: (t) => ({
    title: t(`${Root}:modActionFailedTitle`),
    body: t(`${Root}:banRemoveFailed`),
  }),
  buildSuccessMessage: (t, { target }) => ({
    title: t(`${Root}:banRemoveSuccessTitle`),
    body: t(`${Root}:banRemoveSuccess`, { user: userMention(target) }),
  }),
};

export const banDef: CommandDef = {
  name: "ban",
  description: "Ban or unban a user",
  guildOnly: true,
  requiredPermit: "mod.*",
  prefixEnabled: true,
  cooldownMs: 5000,
  build: () => {
    const b = new SlashCommandBuilder().setName("ban");
    return (
      applyLocalizedBuilder(b, "commands:ban")
        .addSubcommand((s) =>
          applyLocalizedBuilder(s, "commands:banAdd")
            .addUserOption((o) =>
              applyLocalizedBuilder(o, "commands:banUser").setRequired(false),
            )
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:banUsers").setRequired(false),
            )
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:modReason").setRequired(false).setAutocomplete(true),
            )
            .addIntegerOption((o) =>
              applyLocalizedBuilder(o, "commands:banDeleteDays")
                .setMinValue(0)
                .setMaxValue(7)
                .setRequired(false),
            ),
        )
        .addSubcommand((s) =>
          applyLocalizedBuilder(s, "commands:banRemove")
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:banUserId").setRequired(true),
            )
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:modReason").setRequired(false).setAutocomplete(true),
            ),
        )
    );
  },
  handlers: {
    add: {
      run: (ctx: CommandContext) => runModerationFlow(ctx, BanAdd),
      requiredPermit: "mod.ban",
    },
    remove: {
      run: (ctx: CommandContext) => runModerationFlow(ctx, BanRemove),
      requiredPermit: "mod.unban",
    },
  },
  defaultSub: "add",
  autocomplete: (_services: Container, interaction: AutocompleteInteraction) => {
    return respondWithReasonChoices(interaction);
  },
};
