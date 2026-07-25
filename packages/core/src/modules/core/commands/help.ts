import { ApplyOptions } from "@sapphire/decorators";
import { Command, container } from "@sapphire/framework";
import { toTitleCase } from "@sapphire/utilities";
import { SeparatorBuilder, TextDisplayBuilder } from "@discordjs/builders";
import {
  type ChatInputCommandInteraction,
  type Message,
  MessageFlags,
  SeparatorSpacingSize,
} from "discord.js";
import { BaseCommand, fetchTyped } from "#lib/commands.js";
import { Emojis } from "#lib/utilities/assets.js";
import { paginateContainer } from "#lib/utilities/pagination.js";
import { LanguageKeys } from "#lib/i18n/keys.js";

function getCategories(containerInstance: typeof container) {
  const commands = [
    ...containerInstance.stores.get("commands").values(),
  ] as BaseCommand[];

  const categories: Record<string, BaseCommand[]> = {};
  let totalCommandsCount = 0;

  for (const cmd of commands) {
    if ((cmd.options as { hidden?: boolean }).hidden) continue;

    const rawModule = cmd.options.module ?? "core";
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

  return { categories, sortedCategories, totalCommandsCount };
}

@ApplyOptions<Command.Options>({
  name: "help",
  description: "Display all available commands with dynamic pagination.",
})
export class HelpCommand extends BaseCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder.setName(this.name).setDescription(this.description),
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const t = await fetchTyped(interaction);

    let prefix = ",";
    if (interaction.guildId) {
      const settings = await this.container.db.config.getGuildSettings(
        interaction.guildId,
      );
      prefix = settings.prefix ?? ",";
    }

    const { categories, sortedCategories, totalCommandsCount } = getCategories(
      this.container,
    );

    await paginateContainer({
      interactionOrMessage: interaction,
      totalPages: sortedCategories.length,
      userId: interaction.user.id,
      customIdPrefix: "help",
      render: (pageIndex, c) => {
        const categoryName = sortedCategories[pageIndex] || "Core";
        const categoryCommands = categories[categoryName] || [];

        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${Emojis.SHIELD} ${t(LanguageKeys.Commands.HelpTitle)}`,
          ),
        );
        c.addSeparatorComponents(
          new SeparatorBuilder()
            .setSpacing(SeparatorSpacingSize.Small)
            .setDivider(true),
        );

        const commandListText = categoryCommands
          .map((cmd) => {
            const desc = cmd.description || t(LanguageKeys.Commands.HelpNoDescription);
            return `• **\`${prefix}${cmd.name}\`** or **\`/${cmd.name}\`**\n  ┕ *${desc}*`;
          })
          .join("\n\n");

        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `### **${t(LanguageKeys.Commands.HelpModuleHeader, { category: categoryName.toUpperCase() })}**\n\n${commandListText || t(LanguageKeys.Commands.HelpNoCommands)}`,
          ),
        );

        c.addSeparatorComponents(
          new SeparatorBuilder()
            .setSpacing(SeparatorSpacingSize.Small)
            .setDivider(false),
        );

        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `-# ${t(LanguageKeys.Commands.HelpFooter, { page: pageIndex + 1, total: sortedCategories.length, count: totalCommandsCount })}`,
          ),
        );
      },
    });
  }

  public override async messageRun(message: Message) {
    const t = await fetchTyped(message);
    let prefix = ",";
    if (message.guildId) {
      const settings = await this.container.db.config.getGuildSettings(
        message.guildId,
      );
      prefix = settings.prefix ?? ",";
    }

    const { categories, sortedCategories, totalCommandsCount } = getCategories(
      this.container,
    );

    await paginateContainer({
      interactionOrMessage: message,
      totalPages: sortedCategories.length,
      userId: message.author.id,
      customIdPrefix: "help",
      render: (pageIndex, c) => {
        const categoryName = sortedCategories[pageIndex] || "Core";
        const categoryCommands = categories[categoryName] || [];

        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${Emojis.SHIELD} ${t(LanguageKeys.Commands.HelpTitle)}`,
          ),
        );
        c.addSeparatorComponents(
          new SeparatorBuilder()
            .setSpacing(SeparatorSpacingSize.Small)
            .setDivider(true),
        );

        const commandListText = categoryCommands
          .map((cmd) => {
            const desc = cmd.description || t(LanguageKeys.Commands.HelpNoDescription);
            return `• **\`${prefix}${cmd.name}\`** or **\`/${cmd.name}\`**\n  ┕ *${desc}*`;
          })
          .join("\n\n");

        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `### **${t(LanguageKeys.Commands.HelpModuleHeader, { category: categoryName.toUpperCase() })}**\n\n${commandListText || t(LanguageKeys.Commands.HelpNoCommands)}`,
          ),
        );

        c.addSeparatorComponents(
          new SeparatorBuilder()
            .setSpacing(SeparatorSpacingSize.Small)
            .setDivider(false),
        );

        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `-# ${t(LanguageKeys.Commands.HelpFooter, { page: pageIndex + 1, total: sortedCategories.length, count: totalCommandsCount })}`,
          ),
        );
      },
    });
  }
}
