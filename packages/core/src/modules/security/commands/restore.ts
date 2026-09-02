import { ApplyOptions } from "@sapphire/decorators";
import { time, TimestampStyles } from "@discordjs/formatters";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { BaseSubcommand, type CommandContext } from "#lib/commands.js";
import { getUtility } from "#lib/module-system/Utility.js";
import { confirmPrompt } from "#lib/utilities/confirm.js";
import { makeErrorCard } from "#lib/utilities/cards.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "restore",
  description: "Restore server structure from a role/channel backup",
  preconditions: ["GuildOnly"],
  requiredPermit: "admin.*",
  subcommands: [
    { name: "list", run: "list" },
    { name: "latest", run: "latest" },
  ],
})
export class RestoreCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      b
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((s) =>
          s.setName("list").setDescription("List recent backups for this server"),
        )
        .addSubcommand((s) =>
          s
            .setName("latest")
            .setDescription(
              "Recreate any role/channel missing since the most recent backup",
            ),
        ),
    );
  }

  public async list(ctx: CommandContext) {
    await ctx.defer();
    const guild = ctx.guild!;
    const backups = await this.container.db.security.listBackups(guild.id, 10);

    if (backups.length === 0) {
      return ctx.replyError(
        "No Backups Yet",
        "No structural backups exist for this server yet. Enable Anti-Nuke to start the hourly backup sweep, or check back later.",
      );
    }

    const lines = backups.map((b) => {
      const data = b.data as { roles?: unknown[]; channels?: unknown[] };
      const roles = Array.isArray(data.roles) ? data.roles.length : 0;
      const channels = Array.isArray(data.channels) ? data.channels.length : 0;
      return `#${b.id} - ${time(b.createdAt, TimestampStyles.RelativeTime)} (${roles} roles, ${channels} channels)`;
    });

    return ctx.replySuccess("Recent Backups", lines.join("\n"));
  }

  public async latest(ctx: CommandContext) {
    const { confirmed, message } = await confirmPrompt(ctx, {
      title: "Confirm Restore",
      body: "You're about to recreate any role or channel missing since the most recent backup. This can create a large number of roles/channels at once.",
      confirmLabel: "I understand, restore it",
    });
    if (!confirmed) {
      await message.edit({
        ...makeErrorCard("Cancelled", "Restore was not performed."),
      });
      return;
    }

    await ctx.defer();
    const guild = ctx.guild!;
    const security = getUtility("security");

    const result = await security.restoreFromBackup(guild);
    if (!result) {
      return ctx.replyError(
        "No Backups Yet",
        "No structural backups exist for this server yet.",
      );
    }

    return ctx.replySuccess(
      "Restore Complete",
      `Recreated ${result.rolesRestored} role(s) and ${result.channelsRestored} channel(s) that were missing since the most recent backup.`,
    );
  }
}
