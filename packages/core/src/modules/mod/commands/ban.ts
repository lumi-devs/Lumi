import { respondWithReasonChoices } from "../lib/reason-autocomplete.js";
import type { AutocompleteInteraction } from "discord.js";
import { LanguageKeys } from "#lib/i18n/keys.js";
import { ModerationSubcommand } from "#lib/moderation/ModerationSubcommand.js";
import { parseSnowflakeList, resolveUsers } from "#lib/moderation/multi-target.js";
import { ApplyOptions } from "@sapphire/decorators";
import { Result } from "@sapphire/framework";
import { applyLocalizedBuilder } from "@sapphire/plugin-i18next";
import { userMention } from "@discordjs/formatters";
import { isSnowflakeId } from "#utilities/misc.js";
import type { ModerationCase } from "@prisma/client";
import type { User } from "discord.js";
import { BanAction } from "../actions/index.js";

const Root = LanguageKeys.Commands;
const SecondsPerDay = 86400;

/** Merges the single `user` option with the `users` mass-target string, deduped and capped. */
async function resolveBanTargets(
  ctx: ModerationSubcommand.RunContext,
): Promise<User[]> {
  if (!ctx.isSlash) return ctx.getUsers("user", { required: true });

  const single = await ctx.getUser("user");
  const extra = await ctx.getString("users");
  const ids = new Set(extra ? parseSnowflakeList(extra) : []);
  if (single) ids.add(single.id);
  if (ids.size === 0) return [];

  const resolved = await resolveUsers([...ids]);
  return single && !resolved.some((u) => u.id === single.id)
    ? [single, ...resolved]
    : resolved;
}

const BanAdd: ModerationSubcommand.Flow<User, ModerationCase, number> = {
  logScope: "ban",
  duplicateCaseAction: "ban",
  resolveTarget: (ctx) => resolveBanTargets(ctx),
  preHandle: async (ctx) =>
    Result.ok(ctx.isSlash ? ((await ctx.getInteger("delete_days")) ?? 0) : 0),
  confirm: (t, { target, reason }) => ({
    title: t(Root.BanConfirmTitle),
    body: t(Root.BanConfirmBody, { user: userMention(target.id), reason }),
    confirmLabel: t(Root.BanConfirmButton),
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
    title: t(Root.BanSuccessTitle),
    body: t(Root.BanSuccess, {
      user: userMention(target.id),
      reason,
      caseNumber: outcome.caseNumber,
    }),
  }),
};

const BanRemove: ModerationSubcommand.Flow<string, ModerationCase> = {
  logScope: "unban",
  resolveTarget: async (ctx) => {
    const raw = await ctx.getString("user_id", { required: true });
    return (raw ?? "").replace(/\D/g, "");
  },
  preHandle: (_ctx, t, target) =>
    isSnowflakeId(target)
      ? Result.ok(null)
      : Result.err({
          title: t(Root.BanInvalidIdTitle),
          body: t(Root.BanInvalidId),
        }),
  action: ({ guild, target, moderator, reason }) =>
    BanAction.undo({ guild, targetId: target, moderator, reason }),
  buildFailureMessage: (t) => ({
    title: t(Root.ModActionFailedTitle),
    body: t(Root.BanRemoveFailed),
  }),
  buildSuccessMessage: (t, { target }) => ({
    title: t(Root.BanRemoveSuccessTitle),
    body: t(Root.BanRemoveSuccess, { user: userMention(target) }),
  }),
};

@ApplyOptions<ModerationSubcommand.Options>({
  name: "ban",
  description: "Ban or unban a user",
  preconditions: ["GuildOnly"],
  requiredPermit: "mod.*",
  prefixEnabled: true,
  cooldownLimit: 3,
  cooldownDelay: 5000,
  subcommands: [
    { name: "add", run: "add", default: true },
    { name: "remove", run: "remove" },
  ],
})
export class BanCommand extends ModerationSubcommand {
  public override async autocompleteRun(
    interaction: AutocompleteInteraction,
  ): Promise<void> {
    return respondWithReasonChoices(interaction);
  }

  public override registerApplicationCommands(
    registry: ModerationSubcommand.Registry,
  ) {
    registry.registerChatInputCommand((b) =>
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
        ),
    );
  }

  public add(ctx: ModerationSubcommand.RunContext) {
    return this.runFlow(ctx, BanAdd);
  }

  public remove(ctx: ModerationSubcommand.RunContext) {
    return this.runFlow(ctx, BanRemove);
  }
}
