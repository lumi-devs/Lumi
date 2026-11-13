import {
  type CardReply,
  createStringSelectMenu,
  makeCard,
  makeEmptyCard,
  row,
  settingRow,
} from "@lumi/ui";
import {
  type ActionRowBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import { cut, type HubInteraction, pageRow, panelOptions } from "./common.js";
import { isModuleFeatureEnabled } from "./moduleSettings.js";
import { ModulesPerPage, moduleItems } from "./modules.js";
import { paginate } from "./pages.js";
import type { BotServices } from "../../core/contracts.js";

export async function moduleStates(
  services: BotServices,
  guildId: string,
  modules: readonly { name: string }[],
): Promise<Map<string, boolean>> {
  const entries = await Promise.all(
    modules.map(
      async (module) =>
        [
          module.name,
          await isModuleFeatureEnabled(services, guildId, module.name),
        ] as const,
    ),
  );
  return new Map(entries);
}

export async function renderModules(
  interaction: HubInteraction,
  services: BotServices,
  page = 0,
  notice?: string,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const allModules = services.moduleLoader
    .listGlobal()
    .filter((module) => module.origin === "bundled");
  const states = await moduleStates(services, guildId, allModules);
  const modules = moduleItems(allModules, (name) => states.get(name) ?? false);

  if (modules.length === 0) {
    return makeEmptyCard(
      "Modules",
      "No modules are installed on this bot.",
      "Add a module under `modules/` and restart the bot.",
      panelOptions(interaction, "modules", ["Hub", "Modules"]),
    );
  }

  const {
    items: shown,
    page: currentPage,
    totalPages,
  } = paginate(modules, page, ModulesPerPage);

  const sections = shown.map((module, index) => {
    const previous = shown[index - 1];
    const lines =
      !previous || previous.category !== module.category
        ? [
            `**${module.category}**`,
            `${module.emoji} **${module.displayName}** — ${module.enabled ? "Enabled" : "Disabled"}`,
          ]
        : [
            `${module.emoji} **${module.displayName}** — ${module.enabled ? "Enabled" : "Disabled"}`,
          ];
    lines.push(`-# ${cut(module.description || "No description", 80)}`);
    return settingRow(lines, {
      customId: `lumi:modopen:${module.name}:0`,
      label: "Open",
      style: ButtonStyle.Primary,
    });
  });

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  if (totalPages > 1) {
    const jumpOptions = Array.from({ length: totalPages }, (_, index) => {
      const first = modules[index * ModulesPerPage]!;
      const last =
        modules[
          Math.min(modules.length - 1, (index + 1) * ModulesPerPage - 1)
        ]!;
      const section =
        first.category === last.category
          ? first.category
          : `${first.category} → ${last.category}`;
      return {
        label: cut(`${section} · ${index + 1}/${totalPages}`, 100),
        value: String(index),
        description: cut(
          `Modules ${index * ModulesPerPage + 1}-${Math.min(modules.length, (index + 1) * ModulesPerPage)} of ${modules.length}`,
          100,
        ),
      };
    }).slice(0, 25);
    rows.push(
      row(
        createStringSelectMenu({
          customId: "lumi:mods:jump",
          placeholder: "Jump to a page…",
          options: jumpOptions,
        }),
      ),
    );
    rows.push(pageRow("lumi:mods", currentPage, totalPages));
  }

  const enabledCount = modules.filter((module) => module.enabled).length;
  const footer = [
    `${enabledCount} of ${modules.length} modules enabled`,
    totalPages > 1 ? `page ${currentPage + 1}/${totalPages}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return makeCard(
    undefined,
    "⚙️ Feature Modules",
    notice ? `**${notice}**` : [],
    {
      sections,
      ...panelOptions(interaction, "modules", ["Hub", "Modules"], rows, footer),
    },
  );
}
