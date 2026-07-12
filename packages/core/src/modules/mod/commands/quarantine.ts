import { ApplyOptions } from "@sapphire/decorators";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { applyLocalizedBuilder } from "@sapphire/plugin-i18next";
import { BaseSubcommand, type CommandContext } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions/index.js";
import { logError } from "#lib/utilities/errors.js";
import { QuarantineAction } from "../lib/actions/index.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "quarantine",
  description: "Quarantine or release a member",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.MOD,
  prefixEnabled: true,
  subcommands: [
    { name: "add", run: "add", default: true },
    { name: "remove", run: "remove" },
  ],
})
export class QuarantineCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      applyLocalizedBuilder(b, "commands:quarantine")
        .addSubcommand((s) =>
          applyLocalizedBuilder(s, "commands:quarantineAdd")
            .addUserOption((o) =>
              applyLocalizedBuilder(o, "commands:quarantineMember").setRequired(
                true,
              ),
            )
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:modReason").setRequired(false),
            ),
        )
        .addSubcommand((s) =>
          applyLocalizedBuilder(s, "commands:quarantineRemove")
            .addUserOption((o) =>
              applyLocalizedBuilder(o, "commands:quarantineMember").setRequired(
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
    const reason =
      (await ctx.getString("reason", { rest: true })) ??
      t("commands:modNoReason");
    if (!member) {
      return ctx.replyError(
        t("commands:modMemberNotFoundTitle"),
        t("commands:modMemberNotFound"),
      );
    }
    const guildId = ctx.guildId!;

    let c;
    try {
      c = await QuarantineAction.apply({
        guild: ctx.guild!,
        targetMember: member,
        moderator: ctx.user,
        reason,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "UNCONFIGURED") {
        return ctx.replyError(
          t("commands:quarantineUnconfiguredTitle"),
          t("commands:quarantineUnconfigured"),
        );
      }
      if (err instanceof Error && err.message === "ALREADY_QUARANTINED") {
        return ctx.replyError(
          t("commands:quarantineAlreadyTitle"),
          t("commands:quarantineAlready", { user: member.user.username }),
        );
      }
      logError(`quarantine add: guild=${guildId} target=${member.id}`, err);
      return ctx.replyError(
        t("commands:modActionFailedTitle"),
        t("commands:modActionFailed"),
      );
    }

    return ctx.replySuccess(
      t("commands:quarantineSuccessTitle"),
      t("commands:quarantineSuccess", {
        user: member.user.username,
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
    const guildId = ctx.guildId!;

    let c;
    try {
      c = await QuarantineAction.undo({
        guild: ctx.guild!,
        targetMember: member,
        moderator: ctx.user,
        reason,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "NOT_QUARANTINED") {
        return ctx.replyError(
          t("commands:quarantineNotTitle"),
          t("commands:quarantineNot", { user: member.user.username }),
        );
      }
      logError(`quarantine remove: guild=${guildId} target=${member.id}`, err);
      return ctx.replyError(
        t("commands:modActionFailedTitle"),
        t("commands:modActionFailed"),
      );
    }

    return ctx.replySuccess(
      t("commands:quarantineReleasedTitle"),
      t("commands:quarantineReleased", {
        user: member.user.username,
        reason,
        caseNumber: c.caseNumber,
      }),
    );
  }
}
