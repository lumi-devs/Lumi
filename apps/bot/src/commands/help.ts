import {
  ActionRowBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  ButtonBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import {
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import type { CommandDef, LoadedModule, LumiServices } from "@lumi/module-kit";
import { componentEmoji, row } from "@lumi/ui";

const CommandsPerPage = 8;

interface HelpEntry {
  name: string;
  description: string;
}

interface HelpCategory {
  name: string;
  emoji: string;
  commands: HelpEntry[];
}

interface HelpPage {
  category: HelpCategory;
  chunk: HelpEntry[];
  pageInCategory: number;
  pagesInCategory: number;
}

function collectCategories(
  services: LumiServices,
  builtins: readonly CommandDef[],
): HelpCategory[] {
  const categories = new Map<string, HelpCategory>();
  const seen = new Set<string>();

  const add = (category: string, emoji: string, command: CommandDef): void => {
    if (seen.has(command.name)) return;
    seen.add(command.name);
    const entry = categories.get(category) ?? { name: category, emoji, commands: [] };
    entry.commands.push({ name: command.name, description: command.description });
    categories.set(category, entry);
  };

  for (const command of builtins) {
    if (command.name === "help") continue;
    add("Core", "⚙️", command);
  }

  const moduleNames = new Map<string, LoadedModule>();
  for (const module of services.modules.all()) {
    moduleNames.set(module.definition.name, module);
  }

  for (const module of moduleNames.values()) {
    for (const command of module.commands.values()) {
      add(module.definition.displayName, module.definition.emoji, command);
    }
  }

  return [...categories.values()].sort((a, b) => {
    if (a.name === "Core") return -1;
    if (b.name === "Core") return 1;
    return a.name.localeCompare(b.name);
  });
}

function buildPages(categories: readonly HelpCategory[]): HelpPage[] {
  const pages: HelpPage[] = [];
  for (const category of categories) {
    const pagesInCategory = Math.max(1, Math.ceil(category.commands.length / CommandsPerPage));
    for (let index = 0; index < pagesInCategory; index++) {
      pages.push({
        category,
        chunk: category.commands.slice(index * CommandsPerPage, (index + 1) * CommandsPerPage),
        pageInCategory: index,
        pagesInCategory,
      });
    }
  }
  return pages;
}

function buildCard(
  categories: readonly HelpCategory[],
  pages: readonly HelpPage[],
  pageIndex: number,
  userId: string,
  prefix: string,
): ContainerBuilder {
  const safePage = Math.max(0, Math.min(pageIndex, pages.length - 1));
  const page = pages[safePage];
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent("## 🛡️ Lumi Commands"),
  );
  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(1).setDivider(true),
  );

  if (!page) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("No commands are registered."),
    );
    return container;
  }

  const chunkSuffix =
    page.pagesInCategory > 1 ? ` (${page.pageInCategory + 1}/${page.pagesInCategory})` : "";
  const commandLines = page.chunk.map(
    (command) =>
      `**\`/${command.name}\`** or **\`${prefix}${command.name}\`** - ${command.description}`,
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### ${page.category.emoji} ${page.category.name}${chunkSuffix}\n\n${
        commandLines.length > 0 ? commandLines.join("\n") : "-# No commands in this category."
      }`,
    ),
  );
  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(1).setDivider(true),
  );

  const categoryMenu = new StringSelectMenuBuilder()
    .setCustomId(`help:cat:${userId}`)
    .setPlaceholder("Jump to a category…")
    .addOptions(
      categories.slice(0, 25).map((category) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(category.name)
          .setValue(category.name)
          .setEmoji(componentEmoji(category.emoji))
          .setDefault(category.name === page.category.name),
      ),
    );
  container.addActionRowComponents(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(categoryMenu),
  );

  container.addActionRowComponents(
    row(
      new ButtonBuilder()
        .setCustomId(`help:page:${Math.max(0, safePage - 1)}:${userId}`)
        .setLabel("Previous")
        .setEmoji(componentEmoji("⬅️"))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage === 0),
      new ButtonBuilder()
        .setCustomId(`help:indicator:${userId}`)
        .setLabel(`Page ${safePage + 1}/${pages.length}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`help:page:${Math.min(pages.length - 1, safePage + 1)}:${userId}`)
        .setLabel("Next")
        .setEmoji(componentEmoji("➡️"))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= pages.length - 1),
    ),
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# ${pages.length} page(s) · Slash and \`${prefix}\` prefix forms are both accepted.`,
    ),
  );

  return container;
}

function categoriesFor(services: LumiServices, builtins: readonly CommandDef[]): HelpCategory[] {
  return collectCategories(services, builtins);
}

export function makeHelpCommand(builtins: readonly CommandDef[]): CommandDef {
  return {
    name: "help",
    description: "List every command with category navigation and pagination.",
    module: null,
    prefix: true,
    build: () =>
      new SlashCommandBuilder()
        .setName("help")
        .setDescription("List every command with category navigation and pagination."),
    async run(ctx) {
      const prefix = ctx.guildId
        ? (await ctx.services.db.guild.get(ctx.guildId))?.prefix ?? ctx.services.runtime.defaultPrefix
        : ctx.services.runtime.defaultPrefix;
      const categories = categoriesFor(ctx.services, builtins);
      const pages = buildPages(categories);
      const card: { flags: number; components: ContainerBuilder[] } = {
        flags: MessageFlags.IsComponentsV2,
        components: [buildCard(categories, pages, 0, ctx.user.id, prefix)],
      };
      if (!ctx.isSlash) return ctx.reply({ ...card });
      const interaction = ctx.source;
      if ("deferReply" in interaction && !interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      }
      return ctx.reply({ ...card, flags: card.flags | MessageFlags.Ephemeral });
    },
  };
}

export async function handleHelpInteraction(
  services: LumiServices,
  builtins: readonly CommandDef[],
  interaction: ButtonInteraction | StringSelectMenuInteraction,
): Promise<void> {
  const parts = interaction.customId.split(":");
  if (parts[0] !== "help") return;

  const action = parts[1];
  const userId = interaction.isStringSelectMenu() ? parts[2] : parts[parts.length - 1];
  if (!userId || interaction.user.id !== userId) {
    await interaction
      .reply({
        content: "These controls belong to the user who ran the command.",
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => undefined);
    return;
  }

  const prefix = interaction.guildId
    ? (await services.db.guild.get(interaction.guildId))?.prefix ?? services.runtime.defaultPrefix
    : services.runtime.defaultPrefix;
  const categories = categoriesFor(services, builtins);
  const pages = buildPages(categories);

  let pageIndex = 0;
  if (interaction.isStringSelectMenu()) {
    const selected = interaction.values[0];
    const index = pages.findIndex((page) => page.category.name === selected);
    pageIndex = index < 0 ? 0 : index;
  } else if (action === "page") {
    const raw = Number(parts[2]);
    pageIndex = Number.isFinite(raw) ? raw : 0;
  } else {
    return;
  }

  await interaction.update({
    components: [buildCard(categories, pages, pageIndex, userId, prefix)],
  });
}

export type { HelpCategory, HelpEntry };
