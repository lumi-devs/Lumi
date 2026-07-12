import { ApplyOptions } from "@sapphire/decorators";
import type { ApplicationCommandRegistry } from "@sapphire/framework";
import { BaseSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import {
  ChannelType,
  channelMention,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { ephemeralCard } from "#utilities/cards.js";
import { paginateList } from "#utilities/pagination.js";
import { TEMPVC_MAX_GENERATORS } from "../index.js";
import {
  getVcRecord,
  listGenerators,
  removeGenerator,
  setGenerator,
} from "../data.js";
import { buildPanel } from "../ui/panel.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "tempvc",
  description: "Temporary voice channel controls.",
  preconditions: ["GuildOnly", "ModuleEnabled"],
  module: "tempvc",
  permissionLevel: PermissionLevel.USER,
  subcommands: [
    { name: "panel", chatInputRun: "chatInputPanel" },
    {
      name: "generator",
      type: "group",
      entries: [
        { name: "add", chatInputRun: "chatInputGenAdd" },
        { name: "remove", chatInputRun: "chatInputGenRemove" },
        { name: "list", chatInputRun: "chatInputGenList" },
      ],
    },
  ],
})
export class TempVcCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((sub) =>
          sub
            .setName("panel")
            .setDescription("Open the control panel for your current temp VC."),
        )
        .addSubcommandGroup((group) =>
          group
            .setName("generator")
            .setDescription("Manage temp VC generator (trigger) channels.")
            .addSubcommand((sub) =>
              sub
                .setName("add")
                .setDescription("Register a voice channel as a generator.")
                .addChannelOption((opt) =>
                  opt
                    .setName("channel")
                    .setDescription("Voice channel members join to spawn a VC.")
                    .addChannelTypes(ChannelType.GuildVoice)
                    .setRequired(true),
                )
                .addStringOption((opt) =>
                  opt
                    .setName("name")
                    .setDescription(
                      'Name template for created channels. Use {} where the number goes, e.g. "Gaming {}".',
                    )
                    .setMaxLength(90)
                    .setRequired(true),
                )
                .addIntegerOption((opt) =>
                  opt
                    .setName("limit")
                    .setDescription("User limit (0 = unlimited).")
                    .setMinValue(0)
                    .setMaxValue(99)
                    .setRequired(false),
                ),
            )
            .addSubcommand((sub) =>
              sub
                .setName("remove")
                .setDescription("Unregister a generator channel.")
                .addChannelOption((opt) =>
                  opt
                    .setName("channel")
                    .setDescription("The generator channel to remove.")
                    .addChannelTypes(ChannelType.GuildVoice)
                    .setRequired(true),
                ),
            )
            .addSubcommand((sub) =>
              sub
                .setName("list")
                .setDescription("List configured generator channels."),
            ),
        ),
    );
  }

  public async chatInputPanel(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const member = interaction.member as GuildMember | null;
    const channel = member?.voice.channel;
    if (!channel) {
      return this.replyError(
        interaction,
        "Not in a Voice Channel",
        "Join your temp VC first, then run this command.",
      );
    }

    const record = await getVcRecord(interaction.guildId!, channel.id);
    if (!record) {
      return this.replyError(
        interaction,
        "Unmanaged Channel",
        "This voice channel is not a temp VC managed by the bot.",
      );
    }

    const panel = buildPanel(channel, record);
    await this.reply(interaction, ephemeralCard(panel));
  }

  public async chatInputGenAdd(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    await this.checkPermission(interaction, PermissionLevel.ADMIN);
    const guildId = interaction.guildId!;

    const channel = interaction.options.getChannel("channel", true);
    const name = interaction.options.getString("name", true).trim();
    const limit = interaction.options.getInteger("limit") ?? 0;

    if (!name) {
      return this.replyError(
        interaction,
        "Invalid Name",
        "Provide a non-empty name template.",
      );
    }

    const existing = await listGenerators(guildId);
    if (!existing.has(channel.id) && existing.size >= TEMPVC_MAX_GENERATORS) {
      return this.replyError(
        interaction,
        "Too Many Generators",
        `You can configure at most ${TEMPVC_MAX_GENERATORS} generators.`,
      );
    }

    await setGenerator(guildId, channel.id, { name, limit });
    return this.replySuccess(
      interaction,
      "Generator Saved",
      `${channelMention(channel.id)} will now spawn temp VCs using the template **${name}** with a limit of **${limit || "∞"}**.`,
    );
  }

  public async chatInputGenRemove(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    await this.checkPermission(interaction, PermissionLevel.ADMIN);
    const channel = interaction.options.getChannel("channel", true);
    const removed = await removeGenerator(interaction.guildId!, channel.id);
    if (!removed) {
      return this.replyError(
        interaction,
        "Not a Generator",
        `${channelMention(channel.id)} is not a configured generator.`,
      );
    }
    return this.replySuccess(
      interaction,
      "Generator Removed",
      `${channelMention(channel.id)} is no longer a generator.`,
    );
  }

  public async chatInputGenList(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    await this.checkPermission(interaction, PermissionLevel.ADMIN);
    const generators = await listGenerators(interaction.guildId!);
    const lines = [...generators.entries()].map(
      ([id, cfg]) =>
        `${channelMention(id)} — **${cfg.name}** · limit ${cfg.limit || "∞"}`,
    );
    await paginateList({
      interactionOrMessage: interaction,
      userId: interaction.user.id,
      title: "🔊 Temp VC Generators",
      items: lines,
      perPage: 5,
      ephemeral: true,
    });
  }
}
