import { ApplyOptions } from "@sapphire/decorators";
import { Command, container } from "@sapphire/framework";
import { toTitleCase } from "@sapphire/utilities";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import {
  type ChatInputCommandInteraction,
  type Message,
  ButtonStyle,
  MessageFlags,
  SeparatorSpacingSize,
  ApplicationIntegrationType,
} from "discord.js";
import { BaseCommand } from "#lib/commands.js";
import { Colors } from "#utilities/branding.js";
import { Emojis } from "#utilities/assets.js";

export function buildHelpCard(
  containerInstance: typeof container,
  pageIndex: number,
  userId: string,
  prefix: string,
) {
  const commands = [
    ...containerInstance.stores.get("commands").values(),
  ] as BaseCommand[];

  const categories: Record<string, BaseCommand[]> = {};
  let totalCommandsCount = 0;

  for (const cmd of commands) {
    if ((cmd.options as { hidden?: boolean }).hidden) continue;

    const rawModule = (cmd.options.module as string | undefined) ?? "core";
    const record = containerInstance.moduleStore.getRecord(rawModule);
    const moduleName = record?.meta.displayName ?? toTitleCase(rawModule);

    if (!categories[moduleName]) categories[moduleName] = [];
    categories[moduleName]!.push(cmd);
    totalCommandsCount++;
  }

  const sortedCategories = Object.keys(categories).sort((a, b) => {
    if (a === "Core") return -1;
    if (b === "Core") return 1;
    return a.localeCompare(b);
  });

  const totalCategories = sortedCategories.length;
  const activePage = Math.max(0, Math.min(pageIndex, totalCategories - 1));
  const categoryName = sortedCategories[activePage] || "Core";
  const categoryCommands = categories[categoryName] || [];

  const c = new ContainerBuilder();
  c.setAccentColor(Colors.PRIMARY);

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${Emojis.SHIELD} Lumi Command Reference`,
    ),
  );
  c.addSeparatorComponents(
    new SeparatorBuilder()
      .setSpacing(SeparatorSpacingSize.Small)
      .setDivider(true),
  );

  const commandListText = categoryCommands
    .map((cmd) => {
      const desc = cmd.description || "No description provided.";
      return `• **\`${prefix}${cmd.name}\`** or **\`/${cmd.name}\`**\n  ┕ *${desc}*`;
    })
    .join("\n\n");

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### **${categoryName.toUpperCase()} MODULE**\n\n${commandListText || "No commands loaded."}`,
    ),
  );

  c.addSeparatorComponents(
    new SeparatorBuilder()
      .setSpacing(SeparatorSpacingSize.Small)
      .setDivider(false),
  );

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# Page ${activePage + 1} of ${totalCategories} • Total ${totalCommandsCount} commands`,
    ),
  );

  if (totalCategories > 1) {
    const row =
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`help:page:${userId}:${activePage - 1}`)
          .setLabel("Previous")
          .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(activePage <= 0),
        new ButtonBuilder()
          .setCustomId("help:indicator")
          .setLabel(`Page ${activePage + 1}/${totalCategories}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`help:page:${userId}:${activePage + 1}`)
          .setLabel("Next")
          .setEmoji(Emojis.parse(Emojis.ARROW_RIGHT))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(activePage >= totalCategories - 1),
      );

    c.addActionRowComponents((builder) => {
      builder.addComponents(...row.components);
      return builder;
    });
  }

  return {
    flags: MessageFlags.IsComponentsV2 as number,
    components: [c],
  };
}

@ApplyOptions<Command.Options>({
  name: "help",
  description: "Display all available commands with dynamic pagination.",
})
export class HelpCommand extends BaseCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .setDefaultMemberPermissions(this.defaultMemberPermissions ?? null)
        .setContexts(...this.contexts)
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall]),
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let prefix = ",";
    if (interaction.guildId) {
      const settings = await this.container.db.config.getGuildSettings(
        interaction.guildId,
      );
      prefix = settings.prefix ?? ",";
    }

    const card = buildHelpCard(this.container, 0, interaction.user.id, prefix);
    return interaction.editReply(card);
  }

  public override async messageRun(message: Message) {
    let prefix = ",";
    if (message.guildId) {
      const settings = await this.container.db.config.getGuildSettings(
        message.guildId,
      );
      prefix = settings.prefix ?? ",";
    }

    const card = buildHelpCard(this.container, 0, message.author.id, prefix);
    return message.reply(card);
  }
}
