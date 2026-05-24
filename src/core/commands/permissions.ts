import { ApplyOptions } from "@sapphire/decorators";
import { ApplicationCommandRegistry, container } from "@sapphire/framework";
import { Subcommand } from "@sapphire/plugin-subcommands";
import { EmberSubcommand } from "#lib/commands.js";
import { PermissionLevel, type PermissionModelType } from "#lib/permissions.js";
import { MessageFlags, ApplicationIntegrationType } from "discord.js";
import { ephemeralCard, makeListCard } from "#utilities/cards.js";
import { fetchT } from "@sapphire/plugin-i18next";
import { EmberEmojis } from "#utilities/assets.js";

const MODEL_TYPES = [
  "role",
  "user",
  "channel",
  "category",
  "everyone",
] as const satisfies readonly PermissionModelType[];
type ModelType = (typeof MODEL_TYPES)[number];

interface PermissionOverrideRow {
  commandPath: string;
  modelType: string;
  modelId: string;
  allow: boolean;
}

function formatOverride(row: PermissionOverrideRow): string {
  const emoji = row.allow ? EmberEmojis.CHECK : EmberEmojis.CROSS;
  let mention: string;
  if (row.modelType === "everyone") mention = "@everyone";
  else if (row.modelType === "role") mention = `<@&${row.modelId}>`;
  else if (row.modelType === "user") mention = `<@${row.modelId}>`;
  else if (row.modelType === "category") mention = `category <#${row.modelId}>`;
  else mention = `<#${row.modelId}>`;
  return `${emoji} \`${row.commandPath}\` — ${row.modelType} ${mention}`;
}

@ApplyOptions<EmberSubcommand.Options>({
  name: "permissions",
  description: "Manage command permission overrides for this guild.",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.ADMIN,
  subcommands: [
    { name: "allow", chatInputRun: "chatInputAllow" },
    { name: "deny", chatInputRun: "chatInputDeny" },
    { name: "reset", chatInputRun: "chatInputReset" },
    { name: "list", chatInputRun: "chatInputList" },
  ],
})
export class PermissionsCommand extends EmberSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ): void {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("permissions")
        .setDescription("Manage command permission overrides for this guild.")
        .setDefaultMemberPermissions(this.defaultMemberPermissions ?? null)
        .setContexts(...this.contexts)
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
        .addSubcommand((sub) =>
          sub
            .setName("allow")
            .setDescription("Add an allow override for a command.")
            .addStringOption((o) =>
              o
                .setName("command_path")
                .setDescription(
                  "Command path e.g. birthday:birthday:set or birthday:*",
                )
                .setRequired(true),
            )
            .addStringOption((o) =>
              o
                .setName("type")
                .setDescription("Target type")
                .setRequired(true)
                .addChoices(
                  { name: "Role", value: "role" },
                  { name: "User", value: "user" },
                  { name: "Channel", value: "channel" },
                  { name: "Category", value: "category" },
                  { name: "Everyone", value: "everyone" },
                ),
            )
            .addStringOption((o) =>
              o
                .setName("target")
                .setDescription(
                  "Mention or snowflake ID (not needed for everyone)",
                )
                .setRequired(false),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("deny")
            .setDescription("Add a deny override for a command.")
            .addStringOption((o) =>
              o
                .setName("command_path")
                .setDescription(
                  "Command path e.g. birthday:birthday:set or birthday:*",
                )
                .setRequired(true),
            )
            .addStringOption((o) =>
              o
                .setName("type")
                .setDescription("Target type")
                .setRequired(true)
                .addChoices(
                  { name: "Role", value: "role" },
                  { name: "User", value: "user" },
                  { name: "Channel", value: "channel" },
                  { name: "Category", value: "category" },
                  { name: "Everyone", value: "everyone" },
                ),
            )
            .addStringOption((o) =>
              o
                .setName("target")
                .setDescription(
                  "Mention or snowflake ID (not needed for everyone)",
                )
                .setRequired(false),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("reset")
            .setDescription("Remove one or all overrides for a command.")
            .addStringOption((o) =>
              o
                .setName("command_path")
                .setDescription("Command path to reset overrides for")
                .setRequired(true),
            )
            .addStringOption((o) =>
              o
                .setName("type")
                .setDescription(
                  "Target type (omit to remove all for this command)",
                )
                .setRequired(false)
                .addChoices(
                  { name: "Role", value: "role" },
                  { name: "User", value: "user" },
                  { name: "Channel", value: "channel" },
                  { name: "Category", value: "category" },
                  { name: "Everyone", value: "everyone" },
                ),
            )
            .addStringOption((o) =>
              o
                .setName("target")
                .setDescription("Mention or snowflake ID")
                .setRequired(false),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("list")
            .setDescription("List permission overrides for this guild.")
            .addStringOption((o) =>
              o
                .setName("command_path")
                .setDescription("Filter by command path")
                .setRequired(false),
            ),
        ),
    );
  }

  private get permissionService(): import("#core/services/PermissionService.js").PermissionService {
    return this.container.stores
      .get("services")
      .get(
        "permissions",
      ) as import("#core/services/PermissionService.js").PermissionService;
  }

  public async chatInputAllow(
    interaction: Subcommand.ChatInputCommandInteraction,
  ): Promise<void> {
    return this.#write(interaction, true);
  }

  public async chatInputDeny(
    interaction: Subcommand.ChatInputCommandInteraction,
  ): Promise<void> {
    return this.#write(interaction, false);
  }

  public async chatInputReset(
    interaction: Subcommand.ChatInputCommandInteraction,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const commandPath = interaction.options.getString("command_path", true);
    const type = interaction.options.getString(
      "type",
      false,
    ) as ModelType | null;
    const targetRaw = interaction.options.getString("target", false);
    const guildId = interaction.guildId!;

    try {
      const deleted = await this.permissionService.resetOverride(
        guildId,
        commandPath,
        type,
        targetRaw,
      );
      await this.replySuccess(
        interaction,
        "Overrides reset",
        `Removed **${deleted}** override${deleted === 1 ? "" : "s"} for \`${commandPath}\`.`,
      );
    } catch (err: unknown) {
      const error = err as Error;
      await this.replyWarning(interaction, "Reset Failed", error.message);
    }
  }

  public async chatInputList(
    interaction: Subcommand.ChatInputCommandInteraction,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const commandPath = interaction.options.getString("command_path", false);
    const guildId = interaction.guildId!;
    const settings = await container.db.getAllPermissionOverrides(
      guildId,
      commandPath ?? undefined,
    );
    const title = commandPath
      ? `Overrides for \`${commandPath}\``
      : "Permission Overrides";
    const t = await fetchT(interaction);
    await this.reply(
      interaction,
      ephemeralCard(makeListCard(t, title, settings.map(formatOverride))),
    );
  }

  async #write(
    interaction: Subcommand.ChatInputCommandInteraction,
    allow: boolean,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const commandPath = interaction.options.getString("command_path", true);
    const type = interaction.options.getString("type", true) as ModelType;
    const targetRaw = interaction.options.getString("target", false);
    const guildId = interaction.guildId!;

    try {
      await this.permissionService.addOverride(
        guildId,
        commandPath,
        type,
        targetRaw,
        allow,
      );
      const verb = allow ? "allowed" : "denied";
      await this.replySuccess(
        interaction,
        `Override ${verb}`,
        `\`${commandPath}\` is now **${verb}** for ${type === "everyone" ? "@everyone" : `the specified ${type}`}.`,
      );
    } catch (err: unknown) {
      const error = err as Error;
      await this.replyError(interaction, "Invalid target", error.message);
    }
  }
}
