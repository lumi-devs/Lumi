import { ApplyOptions } from "@sapphire/decorators";
import { Command, container } from "@sapphire/framework";
import { toTitleCase } from "@sapphire/utilities";
import { SeparatorBuilder, TextDisplayBuilder } from "@discordjs/builders";
import {
  type ChatInputCommandInteraction,
  type Message,
  SeparatorSpacingSize,
} from "discord.js";
import type { ContainerBuilder } from "@discordjs/builders";
import { BaseCommand, fetchTyped } from "#lib/commands.js";
import { Emojis } from "#lib/utilities/assets.js";
import { paginateContainer } from "#lib/utilities/pagination.js";
import { LanguageKeys } from "#lib/i18n/keys.js";
import type { LumiT } from "#lib/i18n/index.js";

export function getCategories(containerInstance: typeof container) {
  const commands = [
    ...containerInstance.stores.get("commands").values(),
  ] as BaseCommand[];

  const categories: Record<string, BaseCommand[]> = {};
  const categoryEmojis: Record<string, string> = {};
  let totalCommandsCount = 0;

  for (const cmd of commands) {
    if ((cmd.options as { hidden?: boolean }).hidden) continue;

    const rawModule = cmd.options.module ?? "core";
    const record = containerInstance.moduleStore.getRecord(rawModule);
    const moduleName = record?.meta.displayName ?? toTitleCase(rawModule);

    if (!categories[moduleName]) categories[moduleName] = [];
    categories[moduleName].push(cmd);
    categoryEmojis[moduleName] ??= record?.meta.emoji ?? Emojis.GEAR;
    totalCommandsCount++;
  }

  const sortedCategories = Object.keys(categories).sort((a, b) => {
    if (a === "Core") return -1;
    if (b === "Core") return 1;
    return a.localeCompare(b);
  });

  return { categories, categoryEmojis, sortedCategories, totalCommandsCount };
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
    await interaction.deferReply({ ephemeral: true });
    await this.showHelp(interaction);
  }

  public override async messageRun(message: Message) {
    await this.showHelp(message);
  }

  private async showHelp(target: ChatInputCommandInteraction | Message) {
    const t = await fetchTyped(target);

    let prefix = ",";
    if (target.guildId) {
      const settings = await this.container.db.config.getGuildSettings(
        target.guildId,
      );
      prefix = settings.prefix ?? ",";
    }

    const { categories, categoryEmojis, sortedCategories, totalCommandsCount } =
      getCategories(this.container);

    await paginateContainer({
      interactionOrMessage: target,
      totalPages: sortedCategories.length,
      userId: "user" in target ? target.user.id : target.author.id,
      customIdPrefix: "help",
      render: (pageIndex, c) =>
        this.renderPage(c, t, prefix, {
          categories,
          categoryEmojis,
          sortedCategories,
          totalCommandsCount,
          pageIndex,
        }),
    });
  }

  private renderPage(
    c: ContainerBuilder,
    t: LumiT,
    prefix: string,
    data: {
      categories: Record<string, BaseCommand[]>;
      categoryEmojis: Record<string, string>;
      sortedCategories: string[];
      totalCommandsCount: number;
      pageIndex: number;
    },
  ) {
    const categoryName = data.sortedCategories[data.pageIndex] || "Core";
    const categoryCommands = data.categories[categoryName] || [];
    const categoryEmoji = data.categoryEmojis[categoryName] ?? Emojis.GEAR;

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
        const desc =
          cmd.description || t(LanguageKeys.Commands.HelpNoDescription);
        return `**\`/${cmd.name}\`** or **\`${prefix}${cmd.name}\`** — ${desc}`;
      })
      .join("\n");

    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${categoryEmoji} ${t(LanguageKeys.Commands.HelpModuleHeader, { category: categoryName })}\n\n${commandListText || t(LanguageKeys.Commands.HelpNoCommands)}`,
      ),
    );

    c.addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(false),
    );

    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# ${t(LanguageKeys.Commands.HelpFooter, { page: data.pageIndex + 1, total: data.sortedCategories.length, count: data.totalCommandsCount })}`,
      ),
    );
  }
}
