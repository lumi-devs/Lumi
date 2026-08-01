import { LanguageKeys } from "#lib/i18n/keys.js";
import { ModerationSubcommand } from "#lib/moderation/ModerationSubcommand.js";
import { ApplyOptions } from "@sapphire/decorators";
import { Result } from "@sapphire/framework";
import { applyLocalizedBuilder } from "@sapphire/plugin-i18next";
import { userMention } from "@discordjs/formatters";
import type { ModerationCase } from "@prisma/client";
import type { User } from "discord.js";
import { BanAction } from "../actions/index.js";

const Root = LanguageKeys.Commands;
const USER_ID_PATTERN = /^\d{17,20}$/;
const SECONDS_PER_DAY = 86400;

const BanAdd: ModerationSubcommand.Flow<User, ModerationCase, number> = {
  logScope: "ban",
  resolveTarget: (ctx) => ctx.getUser("user"),
  preHandle: async (ctx) =>
    Result.ok(ctx.isSlash ? ((await ctx.getInteger("delete_days")) ?? 0) : 0),
  action: ({ guild, target, moderator, reason, prepared }) =>
    BanAction.apply({
      guild,
      targetUser: target,
      moderator,
      reason,
      deleteMessageSeconds: prepared * SECONDS_PER_DAY,
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
    return raw!.replace(/\D/g, "");
  },
  preHandle: (_ctx, t, target) =>
    USER_ID_PATTERN.test(target)
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
  public override registerApplicationCommands(
    registry: ModerationSubcommand.Registry,
  ) {
    registry.registerChatInputCommand((b) =>
      applyLocalizedBuilder(b, "commands:ban")
        .addSubcommand((s) =>
          applyLocalizedBuilder(s, "commands:banAdd")
            .addUserOption((o) =>
              applyLocalizedBuilder(o, "commands:banUser").setRequired(true),
            )
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:modReason").setRequired(false),
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
              applyLocalizedBuilder(o, "commands:modReason").setRequired(false),
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
