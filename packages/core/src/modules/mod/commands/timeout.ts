import { ApplyOptions } from "@sapphire/decorators";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { applyLocalizedBuilder } from "@sapphire/plugin-i18next";
import { BaseSubcommand, type CommandContext } from "#lib/commands.js";
import { logError } from "#lib/utilities/errors.js";
import { parseDuration, formatDuration } from "#lib/utilities/time.js";
import { MuteAction } from "../actions/index.js";

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

@ApplyOptions<BaseSubcommand.Options>({
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
export class TimeoutCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
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

  public async add(ctx: CommandContext) {
    await ctx.defer();
    const t = await ctx.fetchT();
    const member = await ctx.getMember("member");
    const durationStr = await ctx.getString("duration");
    const reason =
      (await ctx.getString("reason", { rest: true })) ??
      t("commands:modNoReason");

    if (!member) {
      return ctx.replyError(
        t("commands:modMemberNotFoundTitle"),
        t("commands:modMemberNotFound"),
      );
    }
    const ms = durationStr ? parseDuration(durationStr) : null;
    if (!ms) {
      return ctx.replyError(
        t("commands:timeoutInvalidDurationTitle"),
        t("commands:timeoutInvalidDuration"),
      );
    }
    if (ms > MAX_TIMEOUT_MS) {
      return ctx.replyError(
        t("commands:timeoutTooLongTitle"),
        t("commands:timeoutTooLong"),
      );
    }

    let c;
    try {
      c = await MuteAction.apply({
        guild: ctx.guild!,
        targetMember: member,
        moderator: ctx.user,
        reason,
        durationMs: ms,
      });
    } catch (err: unknown) {
      logError(`timeout add: guild=${ctx.guildId} target=${member.id}`, err);
      return ctx.replyError(
        t("commands:modActionFailedTitle"),
        t("commands:modActionFailed"),
      );
    }
    return ctx.replySuccess(
      t("commands:timeoutSuccessTitle"),
      t("commands:timeoutSuccess", {
        user: member.user.username,
        duration: formatDuration(ms),
        reason,
        caseNumber: c.caseNumber,
      }),
    );
  }

  public async remove(ctx: CommandContext) {
    await ctx.defer();
    const t = await ctx.fetchT();
    const member = await ctx.getMember("member");
    const reason =
      (await ctx.getString("reason", { rest: true })) ??
      t("commands:modNoReason");

    if (!member) {
      return ctx.replyError(
        t("commands:modMemberNotFoundTitle"),
        t("commands:modMemberNotFound"),
      );
    }

    try {
      await MuteAction.undo({
        guild: ctx.guild!,
        targetMember: member,
        moderator: ctx.user,
        reason,
      });
    } catch (err: unknown) {
      logError(`timeout remove: guild=${ctx.guildId} target=${member.id}`, err);
      return ctx.replyError(
        t("commands:modActionFailedTitle"),
        t("commands:modActionFailed"),
      );
    }
    return ctx.replySuccess(
      t("commands:timeoutRemovedTitle"),
      t("commands:timeoutRemoved", { user: member.user.username }),
    );
  }
}
