import { isBotOwner } from "@lumi/permits";
import {
  type CardReply,
  createActionButton,
  createStringSelectMenu,
  makeCard,
  makeEmptyCard,
  row,
  settingRow,
} from "@lumi/ui";
import {
  ActionRowBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { backButton, cut, type HubInteraction, pageRow, panelOptions } from "./common.js";
import { ModulesPerPage } from "./modules.js";
import { paginate } from "./pages.js";
import type { HubServices } from "./services.js";

export type AddonView =
  | { kind: "home" }
  | { kind: "repos" }
  | { kind: "repo"; name: string }
  | { kind: "browse"; name: string; page: number }
  | { kind: "installed" }
  | { kind: "manage"; name: string }
  | { kind: "auto" };

const ReposPerPage = 25;
const IntervalChoices = [
  { label: "Every hour", value: "60" },
  { label: "Every 6 hours", value: "360" },
  { label: "Every 12 hours", value: "720" },
  { label: "Every day", value: "1440" },
  { label: "Every week", value: "10080" },
];

export function short(commit: string | null): string {
  return commit ? `\`${commit.slice(0, 7)}\`` : "*unknown*";
}

export function intervalLabel(minutes: number): string {
  if (minutes % 10080 === 0) return `${minutes / 10080} week(s)`;
  if (minutes % 1440 === 0) return `${minutes / 1440} day(s)`;
  if (minutes % 60 === 0) return `${minutes / 60} hour(s)`;
  return `${minutes} minute(s)`;
}

export function addRepoModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId("lumi:addon:addrepomodal")
    .setTitle("Add Repository")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("name")
          .setLabel("Repository name")
          .setPlaceholder("community-addons")
          .setMinLength(1)
          .setMaxLength(64)
          .setRequired(true)
          .setStyle(TextInputStyle.Short),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("url")
          .setLabel("HTTPS git URL")
          .setPlaceholder("https://github.com/owner/repo.git")
          .setMinLength(8)
          .setMaxLength(200)
          .setRequired(true)
          .setStyle(TextInputStyle.Short),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("branch")
          .setLabel("Branch (blank for default)")
          .setMaxLength(64)
          .setRequired(false)
          .setStyle(TextInputStyle.Short),
      ),
    );
}

function backRow(): ReturnType<typeof row> {
  return row(backButton("lumi:addon:home", "Back", "◀️"));
}

function notOwnerCard(interaction: HubInteraction): CardReply {
  return makeCard(
    undefined,
    "📦 Add-ons",
    [
      "Add-ons can only be managed by bot owners.",
      "-# Add your Discord user ID to `OWNER_IDS` to manage repositories and installs.",
    ],
    panelOptions(interaction, "addons", ["Hub", "Add-ons"]),
  );
}

async function renderHome(
  interaction: HubInteraction,
  services: HubServices,
  notice?: string,
): Promise<CardReply> {
  const [repos, installed, auto] = await Promise.all([
    services.addons.listRepos(),
    services.addons.listInstalled(),
    services.addons.getAutoUpdate(),
  ]);

  const sections = installed.slice(0, 5).map((addon) =>
    settingRow(
      [
        `${addon.pinned ? "📌" : "📦"} **${addon.name}** \`${addon.version ?? "unknown"}\``,
        `-# from ${addon.repoName}${addon.pinned ? " · pinned" : ""}`,
      ],
      {
        customId: `lumi:modopen:${addon.name}:0`,
        label: "Open",
        style: ButtonStyle.Primary,
      },
    ),
  );

  return makeCard(
    undefined,
    "📦 Add-ons",
    [
      ...(notice ? [`✅ ${notice}`, ""] : []),
      `**Repositories:** ${repos.length}`,
      `**Installed:** ${installed.length}`,
      `**Auto-update:** ${auto.enabled ? `every ${intervalLabel(auto.intervalMinutes)}` : "disabled"}`,
    ],
    {
      sections,
      ...panelOptions(interaction, "addons", ["Hub", "Add-ons"], [
        row(
          createActionButton({
            customId: "lumi:addon:repos",
            label: "Repositories",
            emoji: "🔗",
          }),
          createActionButton({
            customId: "lumi:addon:installed",
            label: "Installed",
            emoji: "📦",
          }),
          createActionButton({
            customId: "lumi:addon:auto",
            label: "Auto-update",
            emoji: "🔄",
          }),
        ),
      ]),
    },
  );
}

async function renderRepos(
  interaction: HubInteraction,
  services: HubServices,
  notice?: string,
): Promise<CardReply> {
  const repos = await services.addons.listRepos();
  const options = panelOptions(interaction, "addons", ["Hub", "Add-ons", "Repositories"], [
    row(
      createActionButton({
        customId: "lumi:addon:addrepo",
        label: "Add Repository",
        emoji: "➕",
        style: ButtonStyle.Success,
      }),
      backButton("lumi:addon:home", "Back", "◀️"),
    ),
  ]);

  if (repos.length === 0) {
    return makeEmptyCard(
      "No repositories",
      "Track a git repository to browse and install its add-ons.",
      undefined,
      options,
    );
  }

  return makeCard(
    undefined,
    "🔗 Repositories",
    [
      ...(notice ? [`✅ ${notice}`, ""] : []),
      `**Tracked:** ${repos.length}`,
      "-# Select a repository to browse its add-ons.",
    ],
    {
      ...options,
      actionRows: [
        row(
          createStringSelectMenu({
            customId: "lumi:addon:repo",
            placeholder: "Select a repository",
            options: repos.slice(0, ReposPerPage).map((repo) => ({
              label: repo.name,
              value: repo.name,
              description: `${repo.branch ?? "default branch"} · ${short(repo.commit)} · ${repo.installed} installed`,
            })),
          }),
        ),
        ...(options.actionRows ?? []),
      ],
    },
  );
}

async function renderRepo(
  interaction: HubInteraction,
  services: HubServices,
  name: string,
  notice?: string,
): Promise<CardReply> {
  const repo = (await services.addons.listRepos()).find((entry) => entry.name === name);
  if (!repo) {
    return makeCard(
      undefined,
      "🔗 Repository",
      ["That repository is no longer tracked."],
      panelOptions(interaction, "addons", ["Hub", "Add-ons", "Repositories"], [backRow()]),
    );
  }

  return makeCard(
    undefined,
    `🔗 ${repo.name}`,
    [
      ...(notice ? [`✅ ${notice}`, ""] : []),
      `**URL:** ${repo.url}`,
      `**Branch:** ${repo.branch ?? "*default*"}`,
      `**Commit:** ${short(repo.commit)}`,
      `**Installed:** ${repo.installed}`,
    ],
    {
      ...panelOptions(interaction, "addons", ["Hub", "Add-ons", "Repositories", repo.name], [
        row(
          createActionButton({
            customId: `lumi:addon:browse:${repo.name}:0`,
            label: "Browse",
            emoji: "📚",
            style: ButtonStyle.Primary,
          }),
          createActionButton({
            customId: `lumi:addon:update:${repo.name}`,
            label: "Update",
            emoji: "🔄",
          }),
          createActionButton({
            customId: `lumi:addon:remove:${repo.name}`,
            label: "Remove",
            emoji: "🗑️",
            style: ButtonStyle.Danger,
            disabled: repo.installed > 0,
          }),
          backButton("lumi:addon:repos", "Back", "◀️"),
        ),
      ]),
    },
  );
}

async function renderBrowse(
  interaction: HubInteraction,
  services: HubServices,
  name: string,
  page: number,
  notice?: string,
): Promise<CardReply> {
  const modules = await services.addons.listRepoModules(name).catch(() => []);
  const { items, page: current, totalPages } = paginate(
    modules,
    page,
    ModulesPerPage,
  );

  const options = panelOptions(
    interaction,
    "addons",
    ["Hub", "Add-ons", "Repositories", name],
    [
      pageRow(`lumi:addon:browse:${name}`, current, totalPages),
      row(
        createActionButton({
          customId: `lumi:addon:view:${name}`,
          label: "Repository",
          emoji: "🔗",
          style: ButtonStyle.Secondary,
        }),
        backButton("lumi:addon:repos", "All Repositories", "◀️"),
      ),
    ],
  );

  if (modules.length === 0) {
    return makeEmptyCard(
      "No add-ons found",
      `**${name}** has no modules with a valid manifest.`,
      "Update the repository and try again",
      options,
    );
  }

  return makeCard(
    undefined,
    `📚 ${name}`,
    [
      ...(notice ? [`✅ ${notice}`, ""] : []),
      `**Modules:** ${modules.length} · page ${current + 1}/${totalPages}`,
    ],
    {
      sections: items.map((module) =>
        settingRow(
          [
            `${module.emoji} **${module.displayName}** \`${module.name}\` v${module.version}`,
            `-# ${cut(module.description, 120)}`,
          ],
          module.installed
            ? {
                customId: "lumi:addon:installed",
                label: "Installed",
                disabled: true,
              }
            : {
                customId: `lumi:addon:install:${name}:${module.name}`,
                label: "Install",
                style: ButtonStyle.Success,
              },
        ),
      ),
      ...options,
    },
  );
}

async function renderInstalled(
  interaction: HubInteraction,
  services: HubServices,
  notice?: string,
): Promise<CardReply> {
  const installed = await services.addons.listInstalled();
  const options = panelOptions(interaction, "addons", ["Hub", "Add-ons", "Installed"], [
    row(
      createActionButton({
        customId: "lumi:addon:repos",
        label: "Repositories",
        emoji: "🔗",
      }),
      backButton("lumi:addon:home", "Back", "◀️"),
    ),
  ]);

  if (installed.length === 0) {
    return makeEmptyCard(
      "No add-ons installed",
      "Browse a tracked repository and install a module.",
      undefined,
      options,
    );
  }

  return makeCard(
    undefined,
    "📦 Installed",
    [
      ...(notice ? [`✅ ${notice}`, ""] : []),
      ...installed
        .slice(0, 10)
        .map(
          (addon) =>
            `${addon.pinned ? "📌" : "📦"} **${addon.name}** \`${addon.version ?? "unknown"}\` · ${addon.repoName}`,
        ),
      ...(installed.length > 10 ? [`-# ...and ${installed.length - 10} more.`] : []),
    ],
    {
      ...options,
      actionRows: [
        row(
          createStringSelectMenu({
            customId: "lumi:addon:manage",
            placeholder: "Manage an add-on",
            options: installed.slice(0, 25).map((addon) => ({
              label: addon.name,
              value: addon.name,
              description: `v${addon.version ?? "?"} · ${addon.repoName}${addon.pinned ? " · pinned" : ""}`,
            })),
          }),
        ),
        ...(options.actionRows ?? []),
      ],
    },
  );
}

async function renderManage(
  interaction: HubInteraction,
  services: HubServices,
  name: string,
  notice?: string,
): Promise<CardReply> {
  const addon = (await services.addons.listInstalled()).find((entry) => entry.name === name);
  if (!addon) {
    return makeCard(
      undefined,
      "📦 Add-on",
      ["That add-on is no longer installed."],
      panelOptions(interaction, "addons", ["Hub", "Add-ons", "Installed"], [backRow()]),
    );
  }

  return makeCard(
    undefined,
    `📦 ${addon.name}`,
    [
      ...(notice ? [`✅ ${notice}`, ""] : []),
      `**Repository:** ${addon.repoName}`,
      `**Version:** ${addon.version ?? "unknown"}`,
      `**Commit:** ${short(addon.commit)}`,
      `**Pinned:** ${addon.pinned ? "Yes — excluded from updates" : "No"}`,
      `**Installed:** <t:${Math.floor(addon.installedAt.getTime() / 1000)}:R>`,
    ],
    {
      ...panelOptions(interaction, "addons", ["Hub", "Add-ons", "Installed", addon.name], [
        row(
          createActionButton({
            customId: `lumi:modopen:${addon.name}:0`,
            label: "Open",
            emoji: "⚙️",
            style: ButtonStyle.Primary,
          }),
          createActionButton({
            customId: `lumi:addon:pin:${addon.name}`,
            label: addon.pinned ? "Unpin" : "Pin",
            emoji: "📌",
            style: ButtonStyle.Secondary,
          }),
          createActionButton({
            customId: `lumi:addon:uninstall:${addon.name}`,
            label: "Uninstall",
            emoji: "🗑️",
            style: ButtonStyle.Danger,
          }),
        ),
        row(backButton("lumi:addon:installed", "Back", "◀️")),
      ]),
    },
  );
}

async function renderAutoUpdate(
  interaction: HubInteraction,
  services: HubServices,
  notice?: string,
): Promise<CardReply> {
  const auto = await services.addons.getAutoUpdate();

  return makeCard(
    undefined,
    "🔄 Auto-update",
    [
      ...(notice ? [`✅ ${notice}`, ""] : []),
      `**Status:** ${auto.enabled ? "enabled" : "disabled"}`,
      `**Interval:** every ${intervalLabel(auto.intervalMinutes)}`,
      `**Last check:** ${auto.lastCheckedAt ? `<t:${Math.floor(Date.parse(auto.lastCheckedAt) / 1000)}:R>` : "*never*"}`,
      "-# Updates apply automatically. Failed updates roll back.",
    ],
    {
      ...panelOptions(interaction, "addons", ["Hub", "Add-ons", "Auto-update"], [
        row(
          createActionButton({
            customId: "lumi:addon:autotoggle",
            label: auto.enabled ? "Disable" : "Enable",
            emoji: auto.enabled ? "⏸️" : "▶️",
            style: auto.enabled ? ButtonStyle.Danger : ButtonStyle.Success,
          }),
          backButton("lumi:addon:home", "Back", "◀️"),
        ),
        row(
          createStringSelectMenu({
            customId: "lumi:addon:interval",
            placeholder: "Update interval",
            options: IntervalChoices,
          }),
        ),
      ]),
    },
  );
}

export async function renderAddonPanel(
  interaction: HubInteraction,
  services: HubServices,
  view: AddonView,
  notice?: string,
): Promise<CardReply> {
  if (!isBotOwner(interaction.user.id)) {
    return notOwnerCard(interaction);
  }

  switch (view.kind) {
    case "repos":
      return renderRepos(interaction, services, notice);
    case "repo":
      return renderRepo(interaction, services, view.name, notice);
    case "browse":
      return renderBrowse(interaction, services, view.name, view.page, notice);
    case "installed":
      return renderInstalled(interaction, services, notice);
    case "manage":
      return renderManage(interaction, services, view.name, notice);
    case "auto":
      return renderAutoUpdate(interaction, services, notice);
    default:
      return renderHome(interaction, services, notice);
  }
}
