import { ApplyOptions } from "@sapphire/decorators";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { applyLocalizedBuilder } from "@sapphire/plugin-i18next";
import { BaseSubcommand, type CommandContext } from "#lib/commands.js";
import { getService } from "#lib/module-system/Service.js";
import { logError } from "#lib/utilities/errors.js";

const KIND_CHOICES = [
  { name: "custom", value: "custom" },
  { name: "enforced", value: "enforced" },
] as const;

@ApplyOptions<BaseSubcommand.Options>({
  name: "permit",
  description: "Grant, revoke, or list permit nodes for roles and members",
  preconditions: ["GuildOnly"],
  requiredPermit: "admin.*",
  prefixEnabled: true,
  subcommands: [
    { name: "grant", run: "grant" },
    { name: "revoke", run: "revoke" },
    { name: "list", run: "list", default: true },
  ],
})
export class PermitCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      applyLocalizedBuilder(b, "commands:permit")
        .addSubcommand((s) =>
          applyLocalizedBuilder(s, "commands:permitGrant")
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:permitKind")
                .setRequired(true)
                .addChoices(...KIND_CHOICES),
            )
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:permitNode").setRequired(true),
            )
            .addRoleOption((o) =>
              applyLocalizedBuilder(o, "commands:permitRole").setRequired(
                false,
              ),
            )
            .addUserOption((o) =>
              applyLocalizedBuilder(o, "commands:permitUser").setRequired(
                false,
              ),
            ),
        )
        .addSubcommand((s) =>
          applyLocalizedBuilder(s, "commands:permitRevoke")
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:permitKind")
                .setRequired(true)
                .addChoices(...KIND_CHOICES),
            )
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:permitNode").setRequired(true),
            )
            .addRoleOption((o) =>
              applyLocalizedBuilder(o, "commands:permitRole").setRequired(
                false,
              ),
            )
            .addUserOption((o) =>
              applyLocalizedBuilder(o, "commands:permitUser").setRequired(
                false,
              ),
            ),
        )
        .addSubcommand((s) => applyLocalizedBuilder(s, "commands:permitList")),
    );
  }

  private async resolveTarget(
    ctx: CommandContext,
  ): Promise<{ targetType: "role" | "user"; targetId: string } | null> {
    const role = await ctx.getRole("role");
    if (role) return { targetType: "role", targetId: role.id };
    const user = await ctx.getUser("user");
    if (user) return { targetType: "user", targetId: user.id };
    return null;
  }

  public async grant(ctx: CommandContext) {
    await ctx.defer();
    const t = await ctx.fetchT();
    const kind = await ctx.getString("kind", { required: true });
    const node = (await ctx.getString("node", { required: true }))!.trim();
    const target = await this.resolveTarget(ctx);
    if (!target) {
      return ctx.replyError(
        t("commands:permitNoTargetTitle"),
        t("commands:permitNoTarget"),
      );
    }

    const perms = getService("permissions");
    try {
      await (kind === "enforced"
        ? perms.grantEnforcedPermit(
            ctx.guildId!,
            target.targetType,
            target.targetId,
            node,
          )
        : perms.grantCustomPermit(
            ctx.guildId!,
            target.targetType,
            target.targetId,
            node,
          ));
    } catch (err: unknown) {
      logError(`permit grant: guild=${ctx.guildId} node=${node}`, err);
      return ctx.replyError(
        t("commands:permitFailedTitle"),
        err instanceof Error ? err.message : t("commands:permitFailed"),
      );
    }

    return ctx.replySuccess(
      t("commands:permitGrantedTitle"),
      t("commands:permitGranted", { node, kind }),
    );
  }

  public async revoke(ctx: CommandContext) {
    await ctx.defer();
    const t = await ctx.fetchT();
    const kind = await ctx.getString("kind", { required: true });
    const node = (await ctx.getString("node", { required: true }))!.trim();
    const target = await this.resolveTarget(ctx);
    if (!target) {
      return ctx.replyError(
        t("commands:permitNoTargetTitle"),
        t("commands:permitNoTarget"),
      );
    }

    const perms = getService("permissions");
    try {
      await (kind === "enforced"
        ? perms.revokeEnforcedPermit(
            ctx.guildId!,
            target.targetType,
            target.targetId,
            node,
          )
        : perms.revokeCustomPermit(
            ctx.guildId!,
            target.targetType,
            target.targetId,
            node,
          ));
    } catch (err: unknown) {
      logError(`permit revoke: guild=${ctx.guildId} node=${node}`, err);
      return ctx.replyError(
        t("commands:permitFailedTitle"),
        err instanceof Error ? err.message : t("commands:permitFailed"),
      );
    }

    return ctx.replySuccess(
      t("commands:permitRevokedTitle"),
      t("commands:permitRevoked", { node, kind }),
    );
  }

  public async list(ctx: CommandContext) {
    await ctx.defer();
    const t = await ctx.fetchT();
    const permits = await this.container.db.permissions.getGuildPermits(
      ctx.guildId!,
    );
    const all = [
      ...permits.custom.map(
        (p) => `${p.targetType}:${p.targetId} → \`${p.permit}\` (custom)`,
      ),
      ...permits.enforced.map(
        (p) => `${p.targetType}:${p.targetId} → \`${p.permit}\` (enforced)`,
      ),
    ];
    if (!all.length) {
      return ctx.replyInfo(
        t("commands:permitListEmptyTitle"),
        t("commands:permitListEmpty"),
      );
    }
    return ctx.replyInfo(
      t("commands:permitListTitle"),
      all.slice(0, 40).join("\n"),
    );
  }
}
