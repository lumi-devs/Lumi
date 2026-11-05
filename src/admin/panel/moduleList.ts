import {
  type CardReply,
  makeCard,
  makeEmptyCard,
  makeErrorCard,
  row,
  settingRow,
} from "@lumi/ui";
import {
  type ActionRowBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import {
  backButton,
  cut,
  type HubInteraction,
  pageRow,
  panelOptions,
} from "./common.js";
import { isModuleFeatureEnabled } from "./moduleSettings.js";
import {
  ModulesPerPage,
  moduleListRowId,
  submoduleItems,
  supermoduleItems,
} from "./modules.js";
import { paginate } from "./pages.js";
import type { BotServices } from "../../core/contracts.js";

const SubmodulesPerPage = 3;

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
  const allModules = services.moduleLoader.listGlobal();
  const states = await moduleStates(services, guildId, allModules);
  const modules = supermoduleItems(
    allModules,
    (name) => states.get(name) ?? false,
  );

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

  const sections = shown.map((module) =>
    settingRow(
      [
        `${module.emoji} **${module.displayName}**`,
        `-# ${module.enabledCount}/${module.submoduleCount} enabled · ${module.submoduleCount} submodules · ${cut(module.description || "No description", 80)}`,
      ],
      {
        customId: moduleListRowId(module.name, currentPage),
        label: "Submodules",
        style: ButtonStyle.Primary,
      },
    ),
  );

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  if (totalPages > 1) rows.push(pageRow("lumi:mods", currentPage, totalPages));

  const enabledCount = modules.reduce(
    (total, module) => total + module.enabledCount,
    0,
  );
  const totalCount = modules.reduce(
    (total, module) => total + module.submoduleCount,
    0,
  );
  const footer = [
    `${enabledCount} of ${totalCount} modules enabled`,
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

export async function renderSubmodules(
  interaction: HubInteraction,
  services: BotServices,
  supermoduleName: string,
  originPage = 0,
  page = 0,
  notice?: string,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const modules = services.moduleLoader.listGlobal();
  const parent = modules.find(
    (module) => module.name === supermoduleName && !module.isSubmodule,
  );
  const back = backButton(`lumi:mods:${originPage}`, "Back", null);
  const backRow = row(back);

  if (!parent) {
    return makeErrorCard(
      "Unknown Module",
      `No supermodule named \`${supermoduleName}\` is loaded.`,
      panelOptions(interaction, "modules", ["Hub", "Modules"], [backRow]),
    );
  }

  const breadcrumbs = ["Hub", "Modules", parent.displayName];
  const states = await moduleStates(services, guildId, modules);
  const children = submoduleItems(
    modules,
    supermoduleName,
    (name) => states.get(name) ?? false,
  );
  const {
    items: shown,
    page: currentPage,
    totalPages,
  } = paginate(children, page, SubmodulesPerPage);

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  if (totalPages > 1) {
    rows.push(
      pageRow(
        moduleListRowId(supermoduleName, originPage),
        currentPage,
        totalPages,
      ),
    );
  }
  rows.push(row(back));

  if (children.length === 0) {
    return makeEmptyCard(
      "No submodules",
      `**${parent.displayName}** has no submodules.`,
      undefined,
      panelOptions(interaction, "modules", breadcrumbs, rows),
    );
  }

  const enabledCount = children.filter((module) => module.enabled).length;
  const sections = shown.map((module) =>
    settingRow(
      [
        `${module.emoji} **${module.displayName}** — ${module.enabled ? "Enabled" : "Disabled"}`,
        `-# ${cut(module.description || "No description", 90)}`,
      ],
      {
        customId: `lumi:modopen:${module.name}:0`,
        label: "Open",
        style: ButtonStyle.Primary,
      },
    ),
  );

  const body = [
    parent.description || "No description provided.",
    `**Submodules:** ${children.length} · ${enabledCount} enabled`,
  ];
  if (notice) body.unshift(`**${notice}**`);

  return makeCard(undefined, `${parent.emoji} ${parent.displayName}`, body, {
    sections,
    ...panelOptions(
      interaction,
      "modules",
      breadcrumbs,
      rows,
      totalPages > 1
        ? `page ${currentPage + 1}/${totalPages} · Open a submodule to enable, disable, or configure it.`
        : "Open a submodule to enable, disable, or configure it.",
    ),
  });
}
