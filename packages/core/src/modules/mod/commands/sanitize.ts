import { ApplyOptions } from "@sapphire/decorators";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { applyLocalizedBuilder } from "@sapphire/plugin-i18next";
import { BaseCommand, type CommandContext } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { logError } from "#utilities/errors.js";

// Chars that sort before letters, used for hoisting in member lists
const DEHOIST_REGEX = /^[\x21-\x40\x5B-\x60\x7B-\x7E\s]+/u;

function sanitizeName(name: string): string {
  const dehoisted = name.replace(DEHOIST_REGEX, "").trim();
  return dehoisted.length >= 2 ? dehoisted : "Sanitized User";
}

@ApplyOptions<BaseCommand.Options>({
  name: "sanitize",
  description: "Remove hoisting characters from a member's nickname",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.MOD,
  prefixEnabled: true,
})
export class SanitizeCommand extends BaseCommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      applyLocalizedBuilder(b, "commands:sanitize").addUserOption((o) =>
        applyLocalizedBuilder(o, "commands:sanitizeMember").setRequired(true),
      ),
    );
  }

  public override async run(ctx: CommandContext) {
    await ctx.defer();
    const t = await ctx.fetchT();
    const member = await ctx.getMember("member");
    if (!member) {
      return ctx.replyError(
        t("commands:modMemberNotFoundTitle"),
        t("commands:modMemberNotFound"),
      );
    }

    const current = member.nickname ?? member.user.username;
    const sanitized = sanitizeName(current);

    if (sanitized === current) {
      return ctx.replyError(
        t("commands:sanitizeNothingTitle"),
        t("commands:sanitizeNothing", { user: member.user.username }),
      );
    }

    try {
      await member.setNickname(
        sanitized,
        "Sanitize: removed hoisting characters",
      );
    } catch (err: unknown) {
      logError(`sanitize: guild=${member.guild.id} target=${member.id}`, err);
      return ctx.replyError(
        t("commands:modActionFailedTitle"),
        t("commands:modActionFailed"),
      );
    }

    return ctx.replySuccess(
      t("commands:sanitizeSuccessTitle"),
      t("commands:sanitizeSuccess", {
        user: member.user.username,
        before: current,
        after: sanitized,
      }),
    );
  }
}
