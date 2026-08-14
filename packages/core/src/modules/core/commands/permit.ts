import { ApplyOptions } from "@sapphire/decorators";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { applyLocalizedBuilder } from "@sapphire/plugin-i18next";
import type { AutocompleteInteraction } from "discord.js";
import { BaseSubcommand, type CommandContext } from "#lib/commands.js";
import { getService } from "#lib/module-system/Service.js";
import { logError } from "#lib/utilities/errors.js";
import { KNOWN_PERMIT_NODES } from "#lib/permissions/permit-nodes.js";
import {
  filterAutocompleteChoices,
  respondWithChoices,
} from "#lib/utilities/autocomplete.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "permit",
  description: "Create, edit, assign, or list named Wick-style permits",
  preconditions: ["GuildOnly"],
  requiredPermit: "admin.*",
  prefixEnabled: true,
  subcommands: [
    { name: "create", run: "create" },
    { name: "delete", run: "delete" },
    {
      name: "nodes",
      type: "group",
      entries: [
        { name: "add", run: "nodesAdd" },
        { name: "remove", run: "nodesRemove" },
      ],
    },
    { name: "assign", run: "assign" },
    { name: "unassign", run: "unassign" },
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
          applyLocalizedBuilder(s, "commands:permitCreate")
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:permitNameOpt")
                .setRequired(true)
                .setMaxLength(64),
            )
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:permitNode")
                .setRequired(true)
                .setAutocomplete(true),
            ),
        )
        .addSubcommand((s) =>
          applyLocalizedBuilder(s, "commands:permitDelete").addStringOption(
            (o) =>
              applyLocalizedBuilder(o, "commands:permitNameOpt")
                .setRequired(true)
                .setAutocomplete(true),
          ),
        )
        .addSubcommandGroup((g) =>
          applyLocalizedBuilder(g, "commands:permitNodes")
            .addSubcommand((s) =>
              applyLocalizedBuilder(s, "commands:permitNodesAdd")
                .addStringOption((o) =>
                  applyLocalizedBuilder(o, "commands:permitNameOpt")
                    .setRequired(true)
                    .setAutocomplete(true),
                )
                .addStringOption((o) =>
                  applyLocalizedBuilder(o, "commands:permitNode")
                    .setRequired(true)
                    .setAutocomplete(true),
                ),
            )
            .addSubcommand((s) =>
              applyLocalizedBuilder(s, "commands:permitNodesRemove")
                .addStringOption((o) =>
                  applyLocalizedBuilder(o, "commands:permitNameOpt")
                    .setRequired(true)
                    .setAutocomplete(true),
                )
                .addStringOption((o) =>
                  applyLocalizedBuilder(o, "commands:permitNode")
                    .setRequired(true)
                    .setAutocomplete(true),
                ),
            ),
        )
        .addSubcommand((s) =>
          applyLocalizedBuilder(s, "commands:permitAssign")
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:permitNameOpt")
                .setRequired(true)
                .setAutocomplete(true),
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
          applyLocalizedBuilder(s, "commands:permitUnassign")
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:permitNameOpt")
                .setRequired(true)
                .setAutocomplete(true),
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

  public override async autocompleteRun(
    interaction: AutocompleteInteraction,
  ): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) return respondWithChoices(interaction, []);

    const focused = interaction.options.getFocused(true);

    if (focused.name === "node") {
      const subcommand = interaction.options.getSubcommand(false);
      if (subcommand === "remove") {
        const name = interaction.options.getString("name");
        if (name) {
          const permit = await getService("permissions").findPermitByName(
            guildId,
            name.trim(),
          );
          if (permit) {
            return respondWithChoices(
              interaction,
              filterAutocompleteChoices(permit.nodes, focused.value),
            );
          }
        }
      }
      return respondWithChoices(
        interaction,
        filterAutocompleteChoices(KNOWN_PERMIT_NODES, focused.value),
      );
    }

    if (focused.name === "name") {
      const subcommand = interaction.options.getSubcommand(false);
      if (subcommand === "create") return respondWithChoices(interaction, []);

      const permits = await getService("permissions").listPermits(guildId);
      return respondWithChoices(
        interaction,
        filterAutocompleteChoices(
          permits.map((p) => p.name),
          focused.value,
        ),
      );
    }

    return respondWithChoices(interaction, []);
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

  private async requirePermitByName(ctx: CommandContext, name: string) {
    const perms = getService("permissions");
    const permit = await perms.findPermitByName(ctx.guildId!, name);
    if (!permit) {
      const t = await ctx.fetchT();
      await ctx.replyError(
        t("commands:permitNotFoundTitle"),
        t("commands:permitNotFound", { name }),
      );
      return null;
    }
    return permit;
  }

  public async create(ctx: CommandContext) {
    await ctx.defer();
    const t = await ctx.fetchT();
    const name = (await ctx.getString("name", { required: true }))!.trim();
    const node = (await ctx.getString("node", { required: true }))!.trim();

    const perms = getService("permissions");
    try {
      await perms.createPermit(ctx.guildId!, name, "custom", [node]);
    } catch (err: unknown) {
      logError(`permit create: guild=${ctx.guildId} name=${name}`, err);
      return ctx.replyError(
        t("commands:permitFailedTitle"),
        err instanceof Error ? err.message : t("commands:permitFailed"),
      );
    }

    return ctx.replySuccess(
      t("commands:permitCreatedTitle"),
      t("commands:permitCreated", { name }),
    );
  }

  public async delete(ctx: CommandContext) {
    await ctx.defer();
    const t = await ctx.fetchT();
    const name = (await ctx.getString("name", { required: true }))!.trim();

    const permit = await this.requirePermitByName(ctx, name);
    if (!permit) return;

    const perms = getService("permissions");
    try {
      await perms.deletePermit(ctx.guildId!, permit.id);
    } catch (err: unknown) {
      logError(`permit delete: guild=${ctx.guildId} name=${name}`, err);
      return ctx.replyError(
        t("commands:permitFailedTitle"),
        err instanceof Error ? err.message : t("commands:permitFailed"),
      );
    }

    return ctx.replySuccess(
      t("commands:permitDeletedTitle"),
      t("commands:permitDeleted", { name }),
    );
  }

  public async nodesAdd(ctx: CommandContext) {
    await ctx.defer();
    const t = await ctx.fetchT();
    const name = (await ctx.getString("name", { required: true }))!.trim();
    const node = (await ctx.getString("node", { required: true }))!.trim();

    const permit = await this.requirePermitByName(ctx, name);
    if (!permit) return;

    const perms = getService("permissions");
    try {
      await perms.updatePermitNodes(ctx.guildId!, permit.id, [
        ...permit.nodes,
        node,
      ]);
    } catch (err: unknown) {
      logError(`permit nodes add: guild=${ctx.guildId} name=${name}`, err);
      return ctx.replyError(
        t("commands:permitFailedTitle"),
        err instanceof Error ? err.message : t("commands:permitFailed"),
      );
    }

    return ctx.replySuccess(
      t("commands:permitNodeAddedTitle"),
      t("commands:permitNodeAdded", { node, name }),
    );
  }

  public async nodesRemove(ctx: CommandContext) {
    await ctx.defer();
    const t = await ctx.fetchT();
    const name = (await ctx.getString("name", { required: true }))!.trim();
    const node = (await ctx.getString("node", { required: true }))!.trim();

    const permit = await this.requirePermitByName(ctx, name);
    if (!permit) return;

    const remaining = permit.nodes.filter((n) => n !== node);
    if (remaining.length === permit.nodes.length) {
      return ctx.replyError(
        t("commands:permitFailedTitle"),
        t("commands:permitNodeNotFound", { node, name }),
      );
    }

    const perms = getService("permissions");
    try {
      await perms.updatePermitNodes(ctx.guildId!, permit.id, remaining);
    } catch (err: unknown) {
      logError(`permit nodes remove: guild=${ctx.guildId} name=${name}`, err);
      return ctx.replyError(
        t("commands:permitFailedTitle"),
        err instanceof Error ? err.message : t("commands:permitFailed"),
      );
    }

    return ctx.replySuccess(
      t("commands:permitNodeRemovedTitle"),
      t("commands:permitNodeRemoved", { node, name }),
    );
  }

  public async assign(ctx: CommandContext) {
    await ctx.defer();
    const t = await ctx.fetchT();
    const name = (await ctx.getString("name", { required: true }))!.trim();
    const target = await this.resolveTarget(ctx);
    if (!target) {
      return ctx.replyError(
        t("commands:permitNoTargetTitle"),
        t("commands:permitNoTarget"),
      );
    }

    const permit = await this.requirePermitByName(ctx, name);
    if (!permit) return;

    const perms = getService("permissions");
    try {
      await perms.assignPermit(
        ctx.guildId!,
        permit.id,
        target.targetType,
        target.targetId,
      );
    } catch (err: unknown) {
      logError(`permit assign: guild=${ctx.guildId} name=${name}`, err);
      return ctx.replyError(
        t("commands:permitFailedTitle"),
        err instanceof Error ? err.message : t("commands:permitFailed"),
      );
    }

    return ctx.replySuccess(
      t("commands:permitAssignedTitle"),
      t("commands:permitAssigned", { name }),
    );
  }

  public async unassign(ctx: CommandContext) {
    await ctx.defer();
    const t = await ctx.fetchT();
    const name = (await ctx.getString("name", { required: true }))!.trim();
    const target = await this.resolveTarget(ctx);
    if (!target) {
      return ctx.replyError(
        t("commands:permitNoTargetTitle"),
        t("commands:permitNoTarget"),
      );
    }

    const permit = await this.requirePermitByName(ctx, name);
    if (!permit) return;

    const perms = getService("permissions");
    try {
      await perms.unassignPermit(
        ctx.guildId!,
        permit.id,
        target.targetType,
        target.targetId,
      );
    } catch (err: unknown) {
      logError(`permit unassign: guild=${ctx.guildId} name=${name}`, err);
      return ctx.replyError(
        t("commands:permitFailedTitle"),
        err instanceof Error ? err.message : t("commands:permitFailed"),
      );
    }

    return ctx.replySuccess(
      t("commands:permitUnassignedTitle"),
      t("commands:permitUnassigned", { name }),
    );
  }

  public async list(ctx: CommandContext) {
    await ctx.defer();
    const t = await ctx.fetchT();
    const perms = getService("permissions");
    const permits = await perms.listPermits(ctx.guildId!);
    if (!permits.length) {
      return ctx.replyInfo(
        t("commands:permitListEmptyTitle"),
        t("commands:permitListEmpty"),
      );
    }
    const lines = permits.map((p) => {
      const targets = p.assignments
        .map((a) => `${a.targetType}:${a.targetId}`)
        .join(", ");
      return `${p.builtin ? "🔒 " : ""}**${p.name}** (${p.kind}) \`${p.nodes.join(", ")}\`${targets ? ` → ${targets}` : ""}`;
    });
    return ctx.replyInfo(
      t("commands:permitListTitle"),
      lines.slice(0, 40).join("\n"),
    );
  }
}
