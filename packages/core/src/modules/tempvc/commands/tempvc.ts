import { ApplyOptions } from "@sapphire/decorators";
import type { ApplicationCommandRegistry } from "@sapphire/framework";
import {
  BaseSubcommand,
  replyError,
  sendReply,
  assertPermit,
  replySuccess,
  fetchTyped,
} from "#lib/commands.js";
import {
  ChannelType,
  channelMention,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { ephemeralCard } from "#lib/utilities/cards.js";
import { paginateList } from "#lib/utilities/pagination.js";
import { getMaxGenerators } from "../index.js";
import { getUtility } from "#lib/module-system/Utility.js";
import type TempVcUtility from "../utilities/TempVcUtility.js";
import { getVcRecord } from "../data.js";
import { buildPanel } from "../ui/panel.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "tempvc",
  description: "Temporary voice channel controls.",
  preconditions: ["GuildOnly", "ModuleEnabled"],
  module: "tempvc",
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
                      'Name template: supports {}/{number}, {username}, {name}, {position}. E.g. "Gaming {}".',
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

  private get tempVcService(): TempVcUtility {
    return getUtility("tempvc");
  }

  public async chatInputPanel(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const t = await fetchTyped(interaction);
    const member = interaction.member as GuildMember | null;
    const channel = member?.voice.channel;
    if (!channel) {
      return replyError(
        interaction,
        t("tempvc:notInVcTitle"),
        t("tempvc:notInVcMessage"),
      );
    }

    const record = await getVcRecord(interaction.guildId!, channel.id);
    if (!record) {
      return replyError(
        interaction,
        t("tempvc:unmanagedChannelTitle"),
        t("tempvc:unmanagedChannelMessage"),
      );
    }

    const panel = buildPanel(channel, record, t);
    await sendReply(interaction, ephemeralCard(panel));
  }

  public async chatInputGenAdd(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    await assertPermit(interaction, "admin.*");
    const t = await fetchTyped(interaction);
    const guildId = interaction.guildId!;

    const channel = interaction.options.getChannel("channel", true);
    const name = interaction.options.getString("name", true).trim();
    const limit = interaction.options.getInteger("limit") ?? 0;

    if (!name) {
      return replyError(
        interaction,
        t("tempvc:invalidNameTitle"),
        t("tempvc:invalidNameMessage"),
      );
    }

    const existing = await this.tempVcService.listGenerators(guildId);
    const maxGenerators = await getMaxGenerators(guildId);
    if (!existing.has(channel.id) && existing.size >= maxGenerators) {
      return replyError(
        interaction,
        t("tempvc:tooManyGeneratorsTitle"),
        t("tempvc:tooManyGeneratorsMessage", { max: maxGenerators }),
      );
    }

    await this.tempVcService.addGenerator(guildId, channel.id, { name, limit });
    return replySuccess(
      interaction,
      t("tempvc:generatorSavedTitle"),
      t("tempvc:generatorSavedMessage", {
        channel: channelMention(channel.id),
        name,
        limit: limit || t("tempvc:unlimited"),
      }),
    );
  }

  public async chatInputGenRemove(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    await assertPermit(interaction, "admin.*");
    const t = await fetchTyped(interaction);
    const channel = interaction.options.getChannel("channel", true);
    const removed = await this.tempVcService.removeGenerator(
      interaction.guildId!,
      channel.id,
    );
    if (!removed) {
      return replyError(
        interaction,
        t("tempvc:notAGeneratorTitle"),
        t("tempvc:notAGeneratorMessage", {
          channel: channelMention(channel.id),
        }),
      );
    }
    return replySuccess(
      interaction,
      t("tempvc:generatorRemovedTitle"),
      t("tempvc:generatorRemovedMessage", {
        channel: channelMention(channel.id),
      }),
    );
  }

  public async chatInputGenList(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    await assertPermit(interaction, "admin.*");
    const t = await fetchTyped(interaction);
    const generators = await this.tempVcService.listGenerators(
      interaction.guildId!,
    );
    const lines = [...generators.entries()].map(
      ([id, cfg]) =>
        `${channelMention(id)} - **${cfg.name}** · limit ${cfg.limit || t("tempvc:unlimited")}`,
    );
    await paginateList({
      interactionOrMessage: interaction,
      userId: interaction.user.id,
      title: t("tempvc:generatorsListTitle"),
      items: lines,
      perPage: 5,
      ephemeral: true,
    });
  }
}
