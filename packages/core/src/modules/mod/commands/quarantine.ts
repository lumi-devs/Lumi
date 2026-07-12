import { ApplyOptions } from "@sapphire/decorators";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { applyLocalizedBuilder } from "@sapphire/plugin-i18next";
import { tryParseJSON } from "@sapphire/utilities";
import { Colors, type GuildMember } from "discord.js";
import { BaseSubcommand, type CommandContext } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions/index.js";
import { formatAuditReason } from "#lib/utilities/audit.js";
import { logError } from "#lib/utilities/errors.js";
import { logToChannel } from "../lib/helpers.js";

const quarantineKey = (guildId: string, userId: string) =>
  `lumi:mod:${guildId}:quarantine:${userId}`;

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

    const quarantineRoleId = await this.container.db.config.getModuleConfig(
      guildId,
      "mod",
      "quarantine_role_id",
    );
    if (!quarantineRoleId || typeof quarantineRoleId !== "string") {
      return ctx.replyError(
        t("commands:quarantineUnconfiguredTitle"),
        t("commands:quarantineUnconfigured"),
      );
    }

    const key = quarantineKey(guildId, member.id);
    if (await this.container.redis.exists(key)) {
      return ctx.replyError(
        t("commands:quarantineAlreadyTitle"),
        t("commands:quarantineAlready", { user: member.user.username }),
      );
    }

    const savedRoles = member.roles.cache
      .filter((r) => r.id !== guildId && r.id !== quarantineRoleId)
      .map((r) => r.id);

    try {
      await member.roles.set(
        [guildId, quarantineRoleId],
        formatAuditReason(ctx.user, reason),
      );
    } catch (err: unknown) {
      logError(`quarantine add: guild=${guildId} target=${member.id}`, err);
      return ctx.replyError(
        t("commands:modActionFailedTitle"),
        t("commands:modActionFailed"),
      );
    }

    await this.container.redis.set(
      key,
      JSON.stringify(savedRoles),
      "EX",
      30 * 24 * 60 * 60,
    );

    const c = await this.container.db.moderation.createModerationCase({
      guildId,
      userId: member.id,
      moderatorId: ctx.user.id,
      action: "mute",
      reason,
    });
    await logToChannel(
      guildId,
      "🔒 Quarantined",
      Colors.Orange,
      member.id,
      ctx.user,
      reason,
      c.caseNumber,
    );
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

    const key = quarantineKey(guildId, member.id);
    const saved = await this.container.redis.get(key);
    if (!saved) {
      return ctx.replyError(
        t("commands:quarantineNotTitle"),
        t("commands:quarantineNot", { user: member.user.username }),
      );
    }

    const parsedRoles = tryParseJSON(saved);
    const rolesToRestore = Array.isArray(parsedRoles)
      ? (parsedRoles as string[])
      : [];
    const validRoles = rolesToRestore.filter((id) =>
      (member as GuildMember).guild.roles.cache.has(id),
    );
    try {
      await member.roles.set(
        [guildId, ...validRoles],
        formatAuditReason(ctx.user, reason),
      );
    } catch (err: unknown) {
      logError(`quarantine remove: guild=${guildId} target=${member.id}`, err);
      return ctx.replyError(
        t("commands:modActionFailedTitle"),
        t("commands:modActionFailed"),
      );
    }

    await this.container.redis.del(key);

    const c = await this.container.db.moderation.createModerationCase({
      guildId,
      userId: member.id,
      moderatorId: ctx.user.id,
      action: "unmute",
      reason,
    });
    await logToChannel(
      guildId,
      "🔓 Released",
      Colors.Green,
      member.id,
      ctx.user,
      reason,
      c.caseNumber,
    );
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
