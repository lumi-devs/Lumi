import {
  type ActionRowBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import {
  createActionButton,
  makeCard,
  makeEmptyCard,
  makeErrorCard,
  row,
  settingRow,
  type CardReply,
} from "@lumi/ui";
import { cut, pageRow, panelOptions, type HubInteraction } from "./common.js";
import type { HubServices } from "./services.js";
import {
  ModulesPerPage,
  moduleListRowId,
  submoduleItems,
  submodulePagePrefix,
  submoduleToggleId,
  supermoduleItems,
} from "./modules.js";
import { paginate } from "./pages.js";

const SubmodulesPerPage = 3;

export async function renderModules(
  interaction: HubInteraction,
  services: HubServices,
  page = 0,
  notice?: string,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const modules = supermoduleItems(
    services.moduleLoader.listGlobal(),
    (name) => services.moduleLoader.isEnabled(guildId, name),
  );

  if (modules.length === 0) {
    return makeEmptyCard(
      "Modules",
      "No modules are installed on this bot.",
      "Add a module under `modules/` and restart the bot.",
      panelOptions(interaction, "modules", ["Hub", "Modules"]),
    );
  }

  const { items: shown, page: currentPage, totalPages } = paginate(
    modules,
    page,
    ModulesPerPage,
  );

  const sections = shown.map((module) =>
    settingRow(
      [
        `${module.emoji} **${module.displayName}**`,
        `-# ${module.enabled ? "Enabled" : "Disabled"} · ${module.submoduleCount} submodules · ${cut(module.description || "No description", 80)}`,
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

  const enabledCount = modules.filter((module) => module.enabled).length;
  const footer = [
    `${enabledCount} of ${modules.length} enabled`,
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
  services: HubServices,
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
  const backButton = createActionButton({
    customId: `lumi:mods:${originPage}`,
    label: "Back",
    style: ButtonStyle.Secondary,
  });
  const backRow = row(backButton);

  if (!parent) {
    return makeErrorCard(
      "Unknown Module",
      `No supermodule named \`${supermoduleName}\` is loaded.`,
      panelOptions(interaction, "modules", ["Hub", "Modules"], [backRow]),
    );
  }

  const breadcrumbs = ["Hub", "Modules", parent.displayName];
  const children = submoduleItems(
    modules,
    supermoduleName,
    (name) => services.moduleLoader.isEnabled(guildId, name),
  );
  const { items: shown, page: currentPage, totalPages } = paginate(
    children,
    page,
    SubmodulesPerPage,
  );

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  for (const module of shown) {
    rows.push(
      row(
        createActionButton({
          customId: `lumi:modopen:${module.name}:0`,
          label: `Open ${module.displayName}`,
          style: ButtonStyle.Primary,
        }),
        createActionButton({
          customId: submoduleToggleId(
            module.name,
            originPage,
            currentPage,
          ),
          label: `${module.enabled ? "Disable" : "Enable"} ${module.displayName}`,
          style: module.enabled
            ? ButtonStyle.Danger
            : ButtonStyle.Success,
        }),
      ),
    );
  }
  if (totalPages > 1) {
    rows.push(
      pageRow(submodulePagePrefix(supermoduleName, originPage), currentPage, totalPages),
    );
  }
  rows.push(
    row(
      ...(parent.configFields.length > 0
        ? [
            createActionButton({
              customId: `lumi:modopen:${supermoduleName}:0`,
              label: "Module Settings",
              style: ButtonStyle.Primary,
            }),
          ]
        : []),
      backButton,
    ),
  );

  if (children.length === 0) {
    return makeEmptyCard(
      "No submodules",
      `**${parent.displayName}** has no submodules.`,
      undefined,
      panelOptions(interaction, "modules", breadcrumbs, rows),
    );
  }

  const enabledCount = children.filter((module) => module.enabled).length;
  const modulesList = shown.map(
    (module) =>
      `${module.emoji} **${module.displayName}** — ${module.enabled ? "Enabled" : "Disabled"} · ${cut(module.description || "No description", 90)}`,
  );

  const body = [
    parent.description || "No description provided.",
    `**Submodules:** ${children.length} · ${enabledCount} enabled`,
    ...modulesList,
  ];
  if (notice) body.unshift(`**${notice}**`);

  return makeCard(
    undefined,
    `${parent.emoji} ${parent.displayName}`,
    body,
    {
      ...panelOptions(
        interaction,
        "modules",
        breadcrumbs,
        rows,
        totalPages > 1 ? `page ${currentPage + 1}/${totalPages}` : undefined,
      ),
    },
  );
}
