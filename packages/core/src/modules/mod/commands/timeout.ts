import { LanguageKeys } from "#lib/i18n/keys.js";
import { ModerationSubcommand } from "#lib/moderation/ModerationSubcommand.js";
import { formatDuration, parseDuration } from "#lib/utilities/time.js";
import { ApplyOptions } from "@sapphire/decorators";
import { Result } from "@sapphire/framework";
import { applyLocalizedBuilder } from "@sapphire/plugin-i18next";
import type { ModerationCase } from "@prisma/client";
import type { GuildMember } from "discord.js";
import { MuteAction } from "../actions/index.js";

const Root = LanguageKeys.Commands;
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

type Flow = ModerationSubcommand.Flow<GuildMember, ModerationCase>;
type TimedFlow = ModerationSubcommand.Flow<GuildMember, ModerationCase, number>;

const TimeoutAdd: TimedFlow = {
  logScope: "timeout add",
  resolveTarget: (ctx) => ctx.getMember("member"),
  preHandle: async (ctx, t) => {
    const input = await ctx.getString("duration");
    const durationMs = input ? parseDuration(input) : null;
    if (!durationMs) {
      return Result.err({
        title: t(Root.TimeoutInvalidDurationTitle),
        body: t(Root.TimeoutInvalidDuration),
      });
    }
    if (durationMs > MAX_TIMEOUT_MS) {
      return Result.err({
        title: t(Root.TimeoutTooLongTitle),
        body: t(Root.TimeoutTooLong),
      });
    }
    return Result.ok(durationMs);
  },
  action: ({ guild, target, moderator, reason, prepared }) =>
    MuteAction.apply({
      guild,
      targetMember: target,
      moderator,
      reason,
      durationMs: prepared,
    }),
  buildSuccessMessage: (t, { target, reason, prepared, outcome }) => ({
    title: t(Root.TimeoutSuccessTitle),
    body: t(Root.TimeoutSuccess, {
      user: target.user.username,
      duration: formatDuration(prepared),
      reason,
      caseNumber: outcome.caseNumber,
    }),
  }),
};

const TimeoutRemove: Flow = {
  logScope: "timeout remove",
  resolveTarget: (ctx) => ctx.getMember("member"),
  action: ({ guild, target, moderator, reason }) =>
    MuteAction.undo({ guild, targetMember: target, moderator, reason }),
  buildSuccessMessage: (t, { target }) => ({
    title: t(Root.TimeoutRemovedTitle),
    body: t(Root.TimeoutRemoved, { user: target.user.username }),
  }),
};

@ApplyOptions<ModerationSubcommand.Options>({
  name: "timeout",
  description: "Timeout or untimeout a member",
  preconditions: ["GuildOnly"],
  requiredPermit: "mod.*",
  prefixEnabled: true,
  subcommands: [
    { name: "add", run: "add", default: true },
    { name: "remove", run: "remove" },
  ],
})
export class TimeoutCommand extends ModerationSubcommand {
  public override registerApplicationCommands(
    registry: ModerationSubcommand.Registry,
  ) {
    registry.registerChatInputCommand((b) =>
      applyLocalizedBuilder(b, "commands:timeout")
        .addSubcommand((s) =>
          applyLocalizedBuilder(s, "commands:timeoutAdd")
            .addUserOption((o) =>
              applyLocalizedBuilder(o, "commands:timeoutMember").setRequired(
                true,
              ),
            )
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:timeoutDuration").setRequired(
                true,
              ),
            )
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:modReason").setRequired(false),
            ),
        )
        .addSubcommand((s) =>
          applyLocalizedBuilder(s, "commands:timeoutRemove")
            .addUserOption((o) =>
              applyLocalizedBuilder(o, "commands:timeoutMember").setRequired(
                true,
              ),
            )
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:modReason").setRequired(false),
            ),
        ),
    );
  }

  public add(ctx: ModerationSubcommand.RunContext) {
    return this.runFlow(ctx, TimeoutAdd);
  }

  public remove(ctx: ModerationSubcommand.RunContext) {
    return this.runFlow(ctx, TimeoutRemove);
  }
}
