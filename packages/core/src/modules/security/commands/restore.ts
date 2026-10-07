import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#lib/commands/command-def.js";
import { time, TimestampStyles } from "@discordjs/formatters";
import type { CommandContext } from "#lib/command-context.js";
import { restoreFromBackup } from "@lumi/application/services/security/backup.js";
import { confirmPrompt } from "#lib/utilities/confirm.js";
import { makeErrorCard } from "#lib/ui/cards.js";

export const restoreDef: CommandDef = {
  name: "restore",
  description: "Restore server structure from a role/channel backup",
  guildOnly: true,
  requiredPermit: "admin.*",
  build: () => {
    const b = new SlashCommandBuilder().setName("restore");
    return (
    b
            .setName("restore")
            .setDescription("Restore server structure from a role/channel backup")
            .addSubcommand((s) =>
              s.setName("list").setDescription("List recent backups for this server"),
            )
            .addSubcommand((s) =>
              s
                .setName("latest")
                .setDescription(
                  "Recreate any role/channel missing since the most recent backup",
                ),
            )
    );
  },
  handlers: {
  "list": async (ctx: CommandContext) => {
    await ctx.defer();
    const guild = ctx.guild!;
    const backups = await ctx.services.db.security.listBackups(guild.id, 10);

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
  },
  "latest": async (ctx: CommandContext) => {
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

    const result = await restoreFromBackup(guild.id);
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
};
