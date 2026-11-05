import type { ConfigService, GuildSettings } from "@lumi/admin";
import type { DbHelpers, PrismaClient } from "@lumi/db";
import * as ui from "@lumi/ui";
import type { ChatInputCommandInteraction, Client } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import {
  clearGuildBlacklisted,
  clearUserBlacklisted,
  setGuildBlacklisted,
  setUserBlacklisted,
} from "./blacklist.js";
import type { DataLifecycleService } from "./dataLifecycle.js";
import type { ErrorStore } from "./errorStore.js";
import type { BuiltinCommandDefinition } from "./modules.js";

interface OwnerCommandOptions {
  client: Client;
  prisma: PrismaClient;
  cache: DbHelpers["cache"];
  configService: ConfigService;
  dataLifecycle: DataLifecycleService;
  errorStore: ErrorStore;
}

async function replyJson(
  interaction: ChatInputCommandInteraction,
  filename: string,
  data: unknown,
): Promise<void> {
  await interaction.reply({
    content: "Export attached.",
    files: [
      {
        attachment: Buffer.from(JSON.stringify(data, null, 2)),
        name: filename,
      },
    ],
    ephemeral: true,
  });
}

export function createOwnerCommands(
  options: OwnerCommandOptions,
): BuiltinCommandDefinition[] {
  const { client, prisma, cache, configService, dataLifecycle, errorStore } =
    options;

  return [
    {
      ownerOnly: true,
      data: new SlashCommandBuilder()
        .setName("owner")
        .setDescription("Bot owner operations")
        .addSubcommand((command) =>
          command
            .setName("privacy_export")
            .setDescription("Export a user's stored data")
            .addUserOption((option) =>
              option
                .setName("user")
                .setDescription("User to export")
                .setRequired(true),
            )
            .addStringOption((option) =>
              option
                .setName("guild_id")
                .setDescription("Guild ID for guild-scoped data")
                .setRequired(true),
            ),
        )
        .addSubcommand((command) =>
          command
            .setName("privacy_delete")
            .setDescription("Delete or anonymise a user's stored data")
            .addUserOption((option) =>
              option
                .setName("user")
                .setDescription("User to delete")
                .setRequired(true),
            )
            .addStringOption((option) =>
              option
                .setName("guild_id")
                .setDescription("Guild ID for guild-scoped data")
                .setRequired(true),
            )
            .addBooleanOption((option) =>
              option
                .setName("confirm")
                .setDescription("Confirm permanent deletion")
                .setRequired(true),
            ),
        )
        .addSubcommand((command) =>
          command
            .setName("servers_list")
            .setDescription("List servers the bot is in"),
        )
        .addSubcommand((command) =>
          command
            .setName("servers_leave")
            .setDescription("Make the bot leave a server")
            .addStringOption((option) =>
              option
                .setName("guild_id")
                .setDescription("Guild ID to leave")
                .setRequired(true),
            )
            .addBooleanOption((option) =>
              option
                .setName("confirm")
                .setDescription("Confirm leaving")
                .setRequired(true),
            ),
        )
        .addSubcommand((command) =>
          command
            .setName("blacklist_guild_add")
            .setDescription("Block a guild")
            .addStringOption((option) =>
              option
                .setName("guild_id")
                .setDescription("Guild ID")
                .setRequired(true),
            )
            .addStringOption((option) =>
              option.setName("reason").setDescription("Reason"),
            ),
        )
        .addSubcommand((command) =>
          command
            .setName("blacklist_guild_remove")
            .setDescription("Unblock a guild")
            .addStringOption((option) =>
              option
                .setName("guild_id")
                .setDescription("Guild ID")
                .setRequired(true),
            ),
        )
        .addSubcommand((command) =>
          command
            .setName("blacklist_guild_list")
            .setDescription("List blocked guilds"),
        )
        .addSubcommand((command) =>
          command
            .setName("blacklist_user_add")
            .setDescription("Block a user")
            .addUserOption((option) =>
              option.setName("user").setDescription("User").setRequired(true),
            )
            .addStringOption((option) =>
              option.setName("reason").setDescription("Reason"),
            ),
        )
        .addSubcommand((command) =>
          command
            .setName("blacklist_user_remove")
            .setDescription("Unblock a user")
            .addUserOption((option) =>
              option.setName("user").setDescription("User").setRequired(true),
            ),
        )
        .addSubcommand((command) =>
          command
            .setName("blacklist_user_list")
            .setDescription("List blocked users"),
        )
        .addSubcommand((command) =>
          command
            .setName("config_export")
            .setDescription("Export a guild's configuration")
            .addStringOption((option) =>
              option
                .setName("guild_id")
                .setDescription("Guild ID")
                .setRequired(true),
            ),
        )
        .addSubcommand((command) =>
          command
            .setName("config_import")
            .setDescription("Import a guild configuration")
            .addStringOption((option) =>
              option
                .setName("guild_id")
                .setDescription("Guild ID")
                .setRequired(true),
            )
            .addAttachmentOption((option) =>
              option
                .setName("file")
                .setDescription("Configuration JSON")
                .setRequired(true),
            )
            .addBooleanOption((option) =>
              option
                .setName("confirm")
                .setDescription("Confirm replacing the current configuration")
                .setRequired(true),
            ),
        )
        .addSubcommand((command) =>
          command
            .setName("errors_list")
            .setDescription("List recent recorded errors")
            .addIntegerOption((option) =>
              option
                .setName("limit")
                .setDescription("Number of records (1-20)")
                .setMinValue(1)
                .setMaxValue(20),
            ),
        )
        .addSubcommand((command) =>
          command
            .setName("errors_trace")
            .setDescription("Show a recorded error trace")
            .addStringOption((option) =>
              option.setName("id").setDescription("Trace ID").setRequired(true),
            ),
        ),
      async execute(interaction): Promise<void> {
        const subcommand = interaction.options.getSubcommand();
        const reply = (title: string, body: string) =>
          interaction.reply(ui.ephemeralCard(ui.makeInfoCard(title, body)));
        const fail = (body: string) =>
          interaction.reply(
            ui.ephemeralCard(ui.makeErrorCard("Owner Action Failed", body)),
          );

        switch (subcommand) {
          case "privacy_export": {
            const user = interaction.options.getUser("user", true);
            const guildId = interaction.options.getString("guild_id", true);
            await replyJson(
              interaction,
              `user-data-${user.id}-${guildId}.json`,
              await dataLifecycle.exportUserData(guildId, user.id),
            );
            return;
          }
          case "privacy_delete": {
            const user = interaction.options.getUser("user", true);
            const guildId = interaction.options.getString("guild_id", true);
            if (!interaction.options.getBoolean("confirm", true)) {
              await fail("Set `confirm` to true to delete user data.");
              return;
            }
            const result = await dataLifecycle.deleteUserData(guildId, user.id);
            await reply(
              "User Data Deleted",
              [
                `Deleted rows: **${result.deleted}**`,
                `Anonymised rows: **${result.anonymised}**`,
                `Modules reporting: **${Object.keys(result.modules).length}**`,
                ...result.failures.map(
                  (failure) => `Failed ${failure.module}: ${failure.error}`,
                ),
              ].join("\n"),
            );
            return;
          }
          case "servers_list": {
            const guilds = [...client.guilds.cache.values()]
              .sort((left, right) => right.memberCount - left.memberCount)
              .slice(0, 30)
              .map(
                (guild) =>
                  `**${guild.name}** \`${guild.id}\` — ${guild.memberCount} members`,
              );
            await reply("Servers", ui.fitLines(guilds));
            return;
          }
          case "servers_leave": {
            const guildId = interaction.options.getString("guild_id", true);
            if (!interaction.options.getBoolean("confirm", true)) {
              await fail("Set `confirm` to true to leave the server.");
              return;
            }
            const guild =
              client.guilds.cache.get(guildId) ??
              (await client.guilds.fetch(guildId).catch(() => null));
            if (!guild) {
              await fail("That server is not available.");
              return;
            }
            await guild.leave();
            await reply(
              "Server Left",
              `Left **${guild.name}** (\`${guild.id}\`).`,
            );
            return;
          }
          case "blacklist_guild_add": {
            const guildId = interaction.options.getString("guild_id", true);
            const reason = interaction.options.getString("reason");
            await setGuildBlacklisted(prisma, cache, guildId, reason);
            await reply("Guild Blocked", `\`${guildId}\` is now blocked.`);
            return;
          }
          case "blacklist_guild_remove": {
            const guildId = interaction.options.getString("guild_id", true);
            await clearGuildBlacklisted(prisma, cache, guildId);
            await reply(
              "Guild Unblocked",
              `\`${guildId}\` is no longer blocked.`,
            );
            return;
          }
          case "blacklist_guild_list": {
            const rows = await prisma.guildBlacklist.findMany({
              orderBy: { createdAt: "desc" },
              take: 50,
            });
            await reply(
              "Blocked Guilds",
              ui.fitLines(
                rows.map(
                  (row) =>
                    `\`${row.guildId}\`${row.reason ? ` — ${row.reason}` : ""}`,
                ),
              ) || "No blocked guilds.",
            );
            return;
          }
          case "blacklist_user_add": {
            const user = interaction.options.getUser("user", true);
            const reason = interaction.options.getString("reason");
            await setUserBlacklisted(prisma, cache, user.id, reason);
            await reply("User Blocked", `${user.tag} is now blocked.`);
            return;
          }
          case "blacklist_user_remove": {
            const user = interaction.options.getUser("user", true);
            await clearUserBlacklisted(prisma, cache, user.id);
            await reply("User Unblocked", `${user.tag} is no longer blocked.`);
            return;
          }
          case "blacklist_user_list": {
            const rows = await prisma.userBlacklist.findMany({
              orderBy: { createdAt: "desc" },
              take: 50,
            });
            await reply(
              "Blocked Users",
              ui.fitLines(
                rows.map(
                  (row) =>
                    `\`${row.userId}\`${row.reason ? ` — ${row.reason}` : ""}`,
                ),
              ) || "No blocked users.",
            );
            return;
          }
          case "config_export": {
            const guildId = interaction.options.getString("guild_id", true);
            await replyJson(
              interaction,
              `guild-config-${guildId}.json`,
              await configService.getAll(guildId),
            );
            return;
          }
          case "config_import": {
            const guildId = interaction.options.getString("guild_id", true);
            if (!interaction.options.getBoolean("confirm", true)) {
              await fail("Set `confirm` to true to replace the configuration.");
              return;
            }
            const attachment = interaction.options.getAttachment("file", true);
            if (attachment.size > 1_000_000) {
              await fail("That file is too large.");
              return;
            }
            try {
              const response = await fetch(attachment.url);
              const parsed = (await response.json()) as unknown;
              if (
                !parsed ||
                typeof parsed !== "object" ||
                Array.isArray(parsed)
              ) {
                await fail("The file must contain a JSON object.");
                return;
              }
              await configService.replaceAll(guildId, parsed as GuildSettings);
              await reply("Configuration Imported", `Updated \`${guildId}\`.`);
            } catch (error) {
              await fail(
                `Import failed: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
            return;
          }
          case "errors_list": {
            const rows = await errorStore.recent(
              interaction.options.getInteger("limit") ?? 10,
            );
            await reply(
              "Recent Errors",
              ui.fitLines(
                rows.map(
                  (row) =>
                    `\`${row.id}\` ${row.at} **${row.source}** — ${row.message}`,
                ),
              ) || "No recorded errors.",
            );
            return;
          }
          case "errors_trace": {
            const row = await errorStore.get(
              interaction.options.getString("id", true),
            );
            if (!row) {
              await fail("No error exists with that ID.");
              return;
            }
            await reply(
              "Error Trace",
              ui.fitLines([
                `**Source:** ${row.source}`,
                `**At:** ${row.at}`,
                `**Guild:** ${row.guildId ?? "n/a"}`,
                `**User:** ${row.userId ?? "n/a"}`,
                `**Command:** ${row.command ?? "n/a"}`,
                "```",
                row.stack ?? row.message,
                "```",
              ]),
            );
            return;
          }
          default:
            await fail("Unknown owner subcommand.");
        }
      },
    },
  ];
}
