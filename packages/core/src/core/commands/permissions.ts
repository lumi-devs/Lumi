import { ApplyOptions } from "@sapphire/decorators";
import { getService } from "#core/module-system/Service.js";
import {
  ApplicationCommandRegistry,
  container,
  type Args,
} from "@sapphire/framework";
import { BaseSubcommand } from "#lib/commands.js";
import { PermissionLevel, type PermissionModelType } from "#lib/permissions.js";
import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type Message,
  MessageFlags,
} from "discord.js";
import {
  userMention,
  channelMention,
  roleMention,
} from "@discordjs/formatters";
import {
  makeListCard,
  makeErrorCard,
  makeSuccessCard,
  ephemeralCard,
} from "#utilities/cards.js";
import { Emojis } from "#utilities/assets.js";
import { errorFrom } from "#utilities/errors.js";
import type { PermissionService } from "#core/services/PermissionService.js";

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
  const emoji = row.allow ? Emojis.CHECK : Emojis.CROSS;
  let mention: string;
  if (row.modelType === "everyone") mention = "@everyone";
  else if (row.modelType === "role") mention = roleMention(row.modelId);
  else if (row.modelType === "user") mention = userMention(row.modelId);
  else if (row.modelType === "category")
    mention = `category ${channelMention(row.modelId)}`;
  else mention = channelMention(row.modelId);
  return `${emoji} \`${row.commandPath}\` — ${row.modelType} ${mention}`;
}

@ApplyOptions<BaseSubcommand.Options>({
  name: "permissions",
  description: "Manage command permission overrides for this guild.",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.ADMIN,
  subcommands: [
    {
      name: "allow",
      messageRun: "messageRunAllow",
      chatInputRun: "chatInputRunAllow",
    },
    {
      name: "deny",
      messageRun: "messageRunDeny",
      chatInputRun: "chatInputRunDeny",
    },
    {
      name: "reset",
      messageRun: "messageRunReset",
      chatInputRun: "chatInputRunReset",
    },
    {
      name: "list",
      messageRun: "messageRunList",
      chatInputRun: "chatInputRunList",
    },
  ],
})
export class PermissionsCommand extends BaseSubcommand {
  private get permissionService(): PermissionService {
    return getService("permissions");
  }

  // ── Application Command Registration ───────────────────────────────────────

  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((sub) =>
          sub
            .setName("allow")
            .setDescription(
              "Allow a command for a target (role, user, channel, category, everyone)",
            )
            .addStringOption((opt) =>
              opt
                .setName("command_path")
                .setDescription(
                  "The command path to allow (e.g. ban, config set)",
                )
                .setRequired(true)
                .setAutocomplete(true),
            )
            .addStringOption((opt) =>
              opt
                .setName("type")
                .setDescription("The target type")
                .setRequired(true)
                .addChoices(...MODEL_TYPES.map((t) => ({ name: t, value: t }))),
            )
            .addStringOption((opt) =>
              opt
                .setName("target")
                .setDescription(
                  "The target ID or mention (omit for 'everyone')",
                )
                .setRequired(false),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("deny")
            .setDescription("Deny a command for a target")
            .addStringOption((opt) =>
              opt
                .setName("command_path")
                .setDescription("The command path to deny")
                .setRequired(true)
                .setAutocomplete(true),
            )
            .addStringOption((opt) =>
              opt
                .setName("type")
                .setDescription("The target type")
                .setRequired(true)
                .addChoices(...MODEL_TYPES.map((t) => ({ name: t, value: t }))),
            )
            .addStringOption((opt) =>
              opt
                .setName("target")
                .setDescription(
                  "The target ID or mention (omit for 'everyone')",
                )
                .setRequired(false),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("reset")
            .setDescription("Remove overrides for a command")
            .addStringOption((opt) =>
              opt
                .setName("command_path")
                .setDescription("The command path to reset")
                .setRequired(true)
                .setAutocomplete(true),
            )
            .addStringOption((opt) =>
              opt
                .setName("type")
                .setDescription("Narrow to a specific target type (optional)")
                .setRequired(false)
                .addChoices(...MODEL_TYPES.map((t) => ({ name: t, value: t }))),
            )
            .addStringOption((opt) =>
              opt
                .setName("target")
                .setDescription("The target ID or mention (optional)")
                .setRequired(false),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("list")
            .setDescription(
              "List permission overrides, optionally filtered to a command",
            )
            .addStringOption((opt) =>
              opt
                .setName("command_path")
                .setDescription("Filter by command path (optional)")
                .setRequired(false)
                .setAutocomplete(true),
            ),
        ),
    );
  }

  // ── Autocomplete ────────────────────────────────────────────────────────────

  public override autocompleteRun(interaction: AutocompleteInteraction) {
    const focused = (
      interaction.options.getFocused(true).value as string
    ).toLowerCase();

    const paths = this.container.stores
      .get("commands")
      .map((cmd) => cmd.name)
      .filter((name) => name.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((name) => ({ name, value: name }));

    return interaction.respond(paths);
  }

  // ── Message Commands ────────────────────────────────────────────────────────

  public async messageRunAllow(message: Message, args: Args): Promise<void> {
    return this.#writeMessage(message, args, true);
  }

  public async messageRunDeny(message: Message, args: Args): Promise<void> {
    return this.#writeMessage(message, args, false);
  }

  public async messageRunReset(message: Message, args: Args): Promise<void> {
    const commandPath = await args.pick("string").catch(() => null);
    const typeRaw = await args.pick("string").catch(() => null);
    const targetRaw = await args.pick("string").catch(() => null);

    if (!commandPath) {
      await message.reply(
        makeErrorCard(
          "Missing Arguments",
          "Usage: `,permissions reset <command_path> [type] [target]`",
        ),
      );
      return;
    }

    const type = typeRaw ? (typeRaw.toLowerCase() as ModelType) : null;
    if (type && !MODEL_TYPES.includes(type)) {
      await message.reply(
        makeErrorCard(
          "Invalid Type",
          `Type must be one of: ${MODEL_TYPES.join(", ")}`,
        ),
      );
      return;
    }

    try {
      const deleted = await this.permissionService.resetOverride(
        message.guildId!,
        commandPath,
        type,
        targetRaw,
      );
      await message.reply(
        makeSuccessCard(
          "Overrides reset",
          `Removed **${deleted}** override${deleted === 1 ? "" : "s"} for \`${commandPath}\`.`,
        ),
      );
    } catch (err: unknown) {
      await message.reply(
        makeErrorCard("Reset Failed", errorFrom(err).message),
      );
    }
  }

  public async messageRunList(message: Message, args: Args): Promise<void> {
    const commandPath = await args.pick("string").catch(() => null);
    const settings = await container.db.permissions.getAllPermissionOverrides(
      message.guildId!,
      commandPath ?? undefined,
    );
    const title = commandPath
      ? `Overrides for \`${commandPath}\``
      : "Permission Overrides";
    await message.reply(makeListCard(title, settings.map(formatOverride)));
  }

  // ── Slash Commands ──────────────────────────────────────────────────────────

  public async chatInputRunAllow(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    return this.#writeSlash(interaction, true);
  }

  public async chatInputRunDeny(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    return this.#writeSlash(interaction, false);
  }

  public async chatInputRunReset(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const commandPath = interaction.options.getString("command_path", true);
    const typeRaw = interaction.options.getString("type") as ModelType | null;
    const targetRaw = interaction.options.getString("target");

    try {
      const deleted = await this.permissionService.resetOverride(
        interaction.guildId!,
        commandPath,
        typeRaw,
        targetRaw,
      );
      await interaction.editReply(
        ephemeralCard(
          makeSuccessCard(
            "Overrides reset",
            `Removed **${deleted}** override${deleted === 1 ? "" : "s"} for \`${commandPath}\`.`,
          ),
        ),
      );
    } catch (err: unknown) {
      await interaction.editReply(
        ephemeralCard(makeErrorCard("Reset Failed", errorFrom(err).message)),
      );
    }
  }

  public async chatInputRunList(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const commandPath = interaction.options.getString("command_path");
    const settings = await container.db.permissions.getAllPermissionOverrides(
      interaction.guildId!,
      commandPath ?? undefined,
    );
    const title = commandPath
      ? `Overrides for \`${commandPath}\``
      : "Permission Overrides";
    await interaction.editReply(
      ephemeralCard(makeListCard(title, settings.map(formatOverride))),
    );
  }

  // ── Shared helpers ──────────────────────────────────────────────────────────

  async #writeMessage(
    message: Message,
    args: Args,
    allow: boolean,
  ): Promise<void> {
    const commandPath = await args.pick("string").catch(() => null);
    const typeRaw = await args.pick("string").catch(() => null);
    const targetRaw = await args.pick("string").catch(() => null);

    if (!commandPath || !typeRaw) {
      await message.reply(
        makeErrorCard(
          "Missing Arguments",
          "Usage: `,permissions [allow|deny] <command_path> <type> [target]`",
        ),
      );
      return;
    }

    const type = typeRaw.toLowerCase() as ModelType;
    if (!MODEL_TYPES.includes(type)) {
      await message.reply(
        makeErrorCard(
          "Invalid Type",
          `Type must be one of: ${MODEL_TYPES.join(", ")}`,
        ),
      );
      return;
    }

    try {
      await this.permissionService.addOverride(
        message.guildId!,
        commandPath,
        type,
        targetRaw,
        allow,
      );
      const verb = allow ? "allowed" : "denied";
      await message.reply(
        makeSuccessCard(
          `Override ${verb}`,
          `\`${commandPath}\` is now **${verb}** for ${type === "everyone" ? "@everyone" : `the specified ${type}`}.`,
        ),
      );
    } catch (err: unknown) {
      await message.reply(
        makeErrorCard("Invalid target", errorFrom(err).message),
      );
    }
  }

  async #writeSlash(
    interaction: ChatInputCommandInteraction,
    allow: boolean,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const commandPath = interaction.options.getString("command_path", true);
    const type = interaction.options.getString("type", true) as ModelType;
    const targetRaw = interaction.options.getString("target");

    try {
      await this.permissionService.addOverride(
        interaction.guildId!,
        commandPath,
        type,
        targetRaw,
        allow,
      );
      const verb = allow ? "allowed" : "denied";
      await interaction.editReply(
        ephemeralCard(
          makeSuccessCard(
            `Override ${verb}`,
            `\`${commandPath}\` is now **${verb}** for ${type === "everyone" ? "@everyone" : `the specified ${type}`}.`,
          ),
        ),
      );
    } catch (err: unknown) {
      await interaction.editReply(
        ephemeralCard(makeErrorCard("Invalid target", errorFrom(err).message)),
      );
    }
  }
}
