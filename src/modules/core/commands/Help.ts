import type { Container } from "#src/lib/Services.js";
import { toTitleCase } from "#src/shared/Index.ts";
import {
  SeparatorBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Message,
  MessageFlags,
  SeparatorSpacingSize,
  ButtonStyle,
  ComponentType,
  type StringSelectMenuInteraction,
  type ButtonInteraction,
} from "discord.js";
import { fetchTyped } from "#src/lib/i18n/Index.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import type { CommandContext } from "#src/lib/commands/Context.js";
import { commandRegistry } from "#src/lib/commands/CommandDef.js";
import { componentEmoji, createCategorySubmenuRow } from "#src/lib/ui/Panels.js";
import type { CardReply } from "#src/lib/ui/Cards.js";
import { Time } from "#src/shared/Index.ts";
import type { LumiT } from "#src/lib/i18n/Index.js";

export const HelpCommandsPerPage = 8;

export function getCategories(services: Container) {
  const seen = new Set<CommandDef>();
  const defs: CommandDef[] = [];
  for (const def of commandRegistry.values()) {
    if (seen.has(def)) continue;
    seen.add(def);
    defs.push(def);
  }

  const records = new Map(
    services.moduleStore.loaded().map((r) => [r.name, r]),
  );

  const categories: Record<string, CommandDef[]> = {};
  const categoryEmojis: Record<string, string> = {};
  let totalCommandsCount = 0;

  for (const def of defs) {
    const rawModule = def.module ?? "core";
    const record = records.get(rawModule);
    const moduleName = record?.meta.displayName ?? toTitleCase(rawModule);

    if (!categories[moduleName]) categories[moduleName] = [];
    categories[moduleName].push(def);
    categoryEmojis[moduleName] ??= record?.meta.emoji ?? "⚙️";
    totalCommandsCount++;
  }

  const sortedCategories = Object.keys(categories).sort((a, b) => {
    if (a === "Core") return -1;
    if (b === "Core") return 1;
    return a.localeCompare(b);
  });

  return { categories, categoryEmojis, sortedCategories, totalCommandsCount };
}

export interface HelpPage {
  category: string;
  chunk: CommandDef[];
  pageInCategory: number;
  pagesInCategory: number;
}

export function buildHelpPages(
  categories: Record<string, CommandDef[]>,
  sortedCategories: string[],
): HelpPage[] {
  const pages: HelpPage[] = [];
  for (const category of sortedCategories) {
    const cmds = categories[category] ?? [];
    const pagesInCategory = Math.max(1, Math.ceil(cmds.length / HelpCommandsPerPage));
    for (let i = 0; i < pagesInCategory; i++) {
      pages.push({
        category,
        chunk: cmds.slice(i * HelpCommandsPerPage, (i + 1) * HelpCommandsPerPage),
        pageInCategory: i,
        pagesInCategory,
      });
    }
  }
  return pages;
}

export function firstPageOfCategory(pages: HelpPage[], category: string): number {
  const idx = pages.findIndex((p) => p.category === category);
  return idx < 0 ? 0 : idx;
}

function subcommandLabels(def: CommandDef): string {
  const keys = Object.keys(def.handlers ?? {});
  if (keys.length === 0) return "";
  const parts = keys.map((k) => k.replaceAll(":", " "));
  return ` (${parts.join(", ")})`;
}

export function renderHelpCard(
  c: ContainerBuilder,
  t: LumiT,
  prefix: string,
  data: {
    categories: Record<string, CommandDef[]>;
    categoryEmojis: Record<string, string>;
    sortedCategories: string[];
    totalCommandsCount: number;
    pages: HelpPage[];
    activePage: number;
    disabled?: boolean;
  },
) {
  const page = data.pages[data.activePage] ?? data.pages[0];
  const categoryName = page?.category ?? "Core";
  const categoryCommands = page?.chunk ?? [];
  const categoryEmoji = data.categoryEmojis[categoryName] ?? "⚙️";

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## 🛡️ ${t("commands:helpTitle")}`,
    ),
  );
  c.addSeparatorComponents(
    new SeparatorBuilder()
      .setSpacing(SeparatorSpacingSize.Small)
      .setDivider(true),
  );

  const commandListText = categoryCommands
    .map((def) => {
      const desc =
        def.description || t("commands:helpNoDescription");
      return `**\`/${def.name}\`**${subcommandLabels(def)} or **\`${prefix}${def.name}\`** - ${desc}`;
    })
    .join("\n");

  const chunkSuffix =
    page && page.pagesInCategory > 1
      ? ` (${page.pageInCategory + 1}/${page.pagesInCategory})`
      : "";
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### ${categoryEmoji} ${t("commands:helpModuleHeader", { category: categoryName })}${chunkSuffix}\n\n${commandListText || t("commands:helpNoCommands")}`,
    ),
  );

  c.addSeparatorComponents(
    new SeparatorBuilder()
      .setSpacing(SeparatorSpacingSize.Small)
      .setDivider(true),
  );

  c.addActionRowComponents(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      createCategorySubmenuRow(
        "help:select",
        data.sortedCategories.map((name) => ({
          id: name,
          label: `${name}`,
          emoji: data.categoryEmojis[name] ?? "⚙️",
          count: (data.categories[name] ?? []).length,
        })),
        categoryName,
        t("commands:helpSelectPlaceholder"),
      ).components,
    ),
  );

  const totalPages = data.pages.length;
  c.addActionRowComponents(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("help:prev")
        .setLabel("Previous")
        .setEmoji(componentEmoji("⬅️"))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!!data.disabled || data.activePage <= 0),
      new ButtonBuilder()
        .setCustomId("help:indicator")
        .setLabel(`Page ${data.activePage + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId("help:next")
        .setLabel("Next")
        .setEmoji(componentEmoji("➡️"))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!!data.disabled || data.activePage >= totalPages - 1),
    ),
  );

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# ${t("commands:helpFooter", { page: data.activePage + 1, total: totalPages, count: data.totalCommandsCount })}`,
    ),
  );
}

async function showHelp(services: Container, target: ChatInputCommandInteraction | Message) {
  const t = await fetchTyped(target);

  let prefix = ",";
  if (target.guildId) {
    const settings = await services.db.config.getGuildSettings(
      target.guildId,
    );
    prefix = settings.prefix ?? ",";
  }

  const { categories, categoryEmojis, sortedCategories, totalCommandsCount } =
    getCategories(services);
  const pages = buildHelpPages(categories, sortedCategories);
  const userId = "user" in target ? target.user.id : target.author.id;
  let activePage = 0;

  const render = (disabled = false): CardReply => {
    const c = new ContainerBuilder();
    renderHelpCard(c, t, prefix, {
      categories,
      categoryEmojis,
      sortedCategories,
      totalCommandsCount,
      pages,
      activePage,
      disabled,
    });
    return {
      flags: MessageFlags.IsComponentsV2,
      components: [c],
      allowedMentions: { parse: [] as [] },
    };
  };

  const isInteraction = "editReply" in target;
  if (isInteraction && !target.deferred && !target.replied) {
    await target.deferReply({ flags: MessageFlags.Ephemeral });
  }

  let msg: Message;
  if (isInteraction) {
    msg = await target.editReply(render());
  } else {
    msg = await target.reply(render());
  }

  const collector = msg.createMessageComponentCollector({
    filter: (i) =>
      (i.componentType === ComponentType.Button ||
        i.componentType === ComponentType.StringSelect) &&
      i.customId.startsWith("help:"),
    time: Time.Minute * 5,
  });

  collector.on("collect", async (i: ButtonInteraction | StringSelectMenuInteraction) => {
    if (i.user.id !== userId) {
      await i.deferUpdate().catch(() => undefined);
      return;
    }
    if (i.isStringSelectMenu()) {
      const category = i.values[0];
      if (category) activePage = firstPageOfCategory(pages, category);
    } else if (i.customId === "help:prev") {
      activePage = Math.max(0, activePage - 1);
    } else if (i.customId === "help:next") {
      activePage = Math.min(pages.length - 1, activePage + 1);
    } else {
      return;
    }
    await i.update(render());
  });

  collector.on("end", async () => {
    const disabled = render(true);
    if (isInteraction) {
      await target.editReply(disabled).catch(() => null);
    } else {
      await msg.edit(disabled).catch(() => null);
    }
  });
}

export const helpDef: CommandDef = {
  name: "help",
  description: "Display all available commands with dynamic pagination.",
  build: () =>
    new SlashCommandBuilder()
      .setName("help")
      .setDescription("Display all available commands with dynamic pagination."),
  run: async (ctx: CommandContext) => {
    if (ctx.isSlash) {
      const interaction = ctx.interaction;
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      }
    }
    return showHelp(ctx.services, ctx.source);
  },
};
