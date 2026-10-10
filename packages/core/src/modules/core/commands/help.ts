import type { Container } from "@lumi/lib/services.js";
import { toTitleCase } from "@lumi/shared";
import { SeparatorBuilder, TextDisplayBuilder } from "@discordjs/builders";
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Message,
  MessageFlags,
  SeparatorSpacingSize,
} from "discord.js";
import type { ContainerBuilder } from "@discordjs/builders";
import { fetchTyped } from "@lumi/lib/i18n/index.js";
import type { CommandDef } from "@lumi/lib/commands/command-def.js";
import type { CommandContext } from "@lumi/lib/commands/context.js";
import { commandRegistry } from "@lumi/lib/commands/command-def.js";
import { paginateContainer } from "@lumi/lib/utilities/pagination.js";
import type { LumiT } from "@lumi/lib/i18n/index.js";

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

/** Lists a subcommand group's entries from the same mapping that drives dispatch. */
function subcommandLabels(def: CommandDef): string {
  const keys = Object.keys(def.handlers ?? {});
  if (keys.length === 0) return "";
  const parts = keys.map((k) => k.split(":").join(" "));
  return ` (${parts.join(", ")})`;
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

  await paginateContainer({
    interactionOrMessage: target,
    totalPages: sortedCategories.length,
    userId: "user" in target ? target.user.id : target.author.id,
    customIdPrefix: "help",
    render: (pageIndex, c) =>
      renderPage(c, t, prefix, {
        categories,
        categoryEmojis,
        sortedCategories,
        totalCommandsCount,
        pageIndex,
      }),
  });
}

function renderPage(
  c: ContainerBuilder,
  t: LumiT,
  prefix: string,
  data: {
    categories: Record<string, CommandDef[]>;
    categoryEmojis: Record<string, string>;
    sortedCategories: string[];
    totalCommandsCount: number;
    pageIndex: number;
  },
) {
  const categoryName = data.sortedCategories[data.pageIndex] || "Core";
  const categoryCommands = data.categories[categoryName] || [];
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
      return `**\`/${def.name}\`**${subcommandLabels(def)} or **\`${prefix}${def.name}\`** — ${desc}`;
    })
    .join("\n");

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### ${categoryEmoji} ${t("commands:helpModuleHeader", { category: categoryName })}\n\n${commandListText || t("commands:helpNoCommands")}`,
    ),
  );

  c.addSeparatorComponents(
    new SeparatorBuilder()
      .setSpacing(SeparatorSpacingSize.Small)
      .setDivider(false),
  );

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# ${t("commands:helpFooter", { page: data.pageIndex + 1, total: data.sortedCategories.length, count: data.totalCommandsCount })}`,
    ),
  );
}

export const helpDef: CommandDef = {
  name: "help",
  description: "Display all available commands with dynamic pagination.",
  build: () => {
    const b = new SlashCommandBuilder().setName("help");
    return (
      b
        .setName("help")
        .setDescription("Display all available commands with dynamic pagination.")
    );
  },
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
