import {
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import { ButtonStyle } from "discord.js";
import { cutText } from "@sapphire/utilities";
import {
  channelMention,
  roleMention,
  userMention,
} from "@discordjs/formatters";
import { makeCard, noPingCard, type CardReply } from "#lib/utilities/cards.js";
import { Emojis } from "#lib/utilities/assets.js";
import { SUPPORTED_LANGUAGES } from "#lib/i18n/index.js";

export const DEFAULT_PREFIX = ",";

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

const row = (...components: MessageActionRowComponentBuilder[]): Row =>
  new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    ...components,
  );

export function hubRow(): Row {
  return row(
    new ButtonBuilder()
      .setCustomId("lumi:tab:modules")
      .setLabel("Modules")
      .setEmoji(Emojis.parse(Emojis.GEAR))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("lumi:tab:permissions")
      .setLabel("Permissions")
      .setEmoji(Emojis.parse(Emojis.SHIELD))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("lumi:tab:settings")
      .setLabel("Settings")
      .setEmoji(Emojis.parse(Emojis.GUILD))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("lumi:tab:addons")
      .setLabel("Addons")
      .setEmoji(Emojis.parse(Emojis.REPO))
      .setStyle(ButtonStyle.Primary),
  );
}

export function backToHubRow(): Row {
  return row(
    new ButtonBuilder()
      .setCustomId("lumi:home")
      .setLabel("Back to Hub")
      .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
      .setStyle(ButtonStyle.Secondary),
  );
}

export interface HubOverview {
  moduleCount: number;
  enabledCount: number;
  prefix: string | null;
  locale: string;
}

export function buildHubView(o: HubOverview): CardReply {
  const glance = [
    `${Emojis.GEAR} **${o.enabledCount}** of **${o.moduleCount}** modules enabled`,
    `${Emojis.GUILD} Language \`${o.locale}\`  •  Prefix \`${o.prefix ?? DEFAULT_PREFIX}\``,
  ].join("\n");

  const tabs = [
    `${Emojis.GEAR} **Modules** — enable, disable, and configure every feature`,
    `${Emojis.SHIELD} **Permissions** — per-command allow / deny overrides`,
    `${Emojis.GUILD} **Settings** — server language and command prefix`,
    `${Emojis.REPO} **Addons** — extend Lumi with add-on modules`,
  ].join("\n");

  return makeCard(
    0,
    `${Emojis.BOT} Lumi Control Panel`,
    [
      "Manage everything for this server from one place — no scattered commands to remember.",
      glance,
      tabs,
    ],
    {
      footer: "Select an option below to continue.",
      actionRows: [hubRow()],
    },
  );
}

export function buildSettingsView(settings: {
  prefix: string | null;
  locale: string;
}): CardReply {
  const body = [
    `${Emojis.GUILD} **Language** — \`${settings.locale}\``,
    `${Emojis.TERMINAL} **Prefix** — \`${settings.prefix ?? DEFAULT_PREFIX}\`${
      settings.prefix ? "" : "  -# *(default)*"
    }`,
  ].join("\n");

  const langSelect = new StringSelectMenuBuilder()
    .setCustomId("lumi:setlang")
    .setPlaceholder("Change language…")
    .addOptions(
      SUPPORTED_LANGUAGES.map((lang) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(lang)
          .setValue(lang)
          .setDefault(lang === settings.locale),
      ),
    );

  const prefixButtons = row(
    new ButtonBuilder()
      .setCustomId("lumi:prefix:set")
      .setLabel("Set Prefix")
      .setEmoji(Emojis.parse(Emojis.EDIT))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("lumi:prefix:reset")
      .setLabel("Reset to Default")
      .setEmoji(Emojis.parse(Emojis.UNINSTALL))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(settings.prefix === null),
  );

  const updateButtons = row(
    new ButtonBuilder()
      .setCustomId("lumi:update_all")
      .setLabel("Update Addons")
      .setEmoji(Emojis.parse("🔄"))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("lumi:check_core")
      .setLabel("Check Core")
      .setEmoji(Emojis.parse(Emojis.BOT))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("lumi:update_core")
      .setLabel("Update Lumi Core")
      .setEmoji(Emojis.parse(Emojis.BOT))
      .setStyle(ButtonStyle.Primary),
  );

  return makeCard(0, `${Emojis.GUILD} Server Settings`, body, {
    footer:
      "Prefix commands work for a curated set of moderation and utility commands.",
    actionRows: [backToHubRow(), row(langSelect), prefixButtons, updateButtons],
  });
}

export interface PermissionOverrideRow {
  commandPath: string;
  modelType: string;
  modelId: string;
  allow: boolean;
}

const formatOverride = (o: PermissionOverrideRow): string => {
  const dot = o.allow ? Emojis.CHECK : Emojis.CROSS;
  let mention: string;
  if (o.modelType === "everyone") mention = "@everyone";
  else if (o.modelType === "role") mention = roleMention(o.modelId);
  else if (o.modelType === "user") mention = userMention(o.modelId);
  else if (o.modelType === "category")
    mention = `category ${channelMention(o.modelId)}`;
  else mention = channelMention(o.modelId);
  return `${dot} \`${o.commandPath}\` — ${o.modelType} ${mention}`;
};

const overrideLabel = (o: PermissionOverrideRow): string => {
  const target = o.modelType === "everyone" ? "everyone" : o.modelId;
  return `${o.allow ? "✓" : "✕"} ${o.commandPath} · ${o.modelType} ${target}`;
};

export function buildPermissionsView(
  overrides: PermissionOverrideRow[],
): CardReply {
  const shown = overrides.slice(0, 25);
  const lines = shown.length
    ? shown.map(formatOverride)
    : [
        "*No permission overrides set — every command uses its default access.*",
      ];

  const addRow = row(
    new ButtonBuilder()
      .setCustomId("lumi:perm:allow")
      .setLabel("Allow…")
      .setEmoji(Emojis.parse(Emojis.CHECK))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("lumi:perm:deny")
      .setLabel("Deny…")
      .setEmoji(Emojis.parse(Emojis.CROSS))
      .setStyle(ButtonStyle.Danger),
  );

  const rows: Row[] = [backToHubRow(), addRow];
  if (shown.length) {
    rows.push(
      row(
        new StringSelectMenuBuilder()
          .setCustomId("lumi:permrm")
          .setPlaceholder("Remove an override…")
          .addOptions(
            shown.map((o) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(overrideLabel(o).slice(0, 100))
                .setValue(`${o.modelType}|${o.modelId}|${o.commandPath}`)
                .setEmoji(Emojis.parse(o.allow ? Emojis.CHECK : Emojis.CROSS)),
            ),
          ),
      ),
    );
  }

  return noPingCard(
    makeCard(
      0,
      `${Emojis.SHIELD} Command Permissions`,
      [
        lines.join("\n"),
        `-# ${Emojis.CHECK} allow · ${Emojis.CROSS} deny. Overrides take priority over a command's default access level.`,
      ],
      {
        footer:
          overrides.length > shown.length
            ? `Showing ${shown.length} of ${overrides.length} overrides.`
            : `${overrides.length} override${overrides.length === 1 ? "" : "s"}`,
        actionRows: rows,
      },
    ),
  );
}

export interface AddonDashboardStats {
  repoCount: number;
  installedCount: number;
}

export interface AddonRepoRow {
  name: string;
  url: string;
  branch: string;
  installedCount: number;
}

export interface AddonInstalledRow {
  moduleName: string;
  version: string | null;
  repoName: string;
  installedAt: Date;
}

export interface AddonRepoModuleRow {
  name: string;
  version: string;
  short?: string;
  hidden?: boolean;
  isInstalled: boolean;
}

export function buildAddonsView(
  stats: AddonDashboardStats = { repoCount: 0, installedCount: 0 },
): CardReply {
  const body = [
    "Add-ons let you expand Lumi with community modules. Every installed add-on works seamlessly alongside built-in features.",
    `${Emojis.REPO} **Tracked Repositories:** ${stats.repoCount}`,
    `${Emojis.DOWNLOAD} **Installed Add-ons:** ${stats.installedCount}`,
    [
      `• **Repositories** — View all downloaded repositories and explore their modules`,
      `• **Installed Add-ons** — Manage and review currently installed add-ons`,
      `• **Add Repository** — Add a new community repository by URL`,
    ].join("\n"),
  ];

  const browseButtons = row(
    new ButtonBuilder()
      .setCustomId("lumi:addon:repos")
      .setLabel("Downloaded Repositories")
      .setEmoji(Emojis.parse(Emojis.REPO))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("lumi:addon:installed")
      .setLabel("Installed Add-ons")
      .setEmoji(Emojis.parse(Emojis.DOWNLOAD))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("lumi:addon:refresh")
      .setLabel("Refresh")
      .setEmoji(Emojis.parse("🔄"))
      .setStyle(ButtonStyle.Secondary),
  );

  const repoActions = row(
    new ButtonBuilder()
      .setCustomId("lumi:addon:add_repo")
      .setLabel("Add Repository")
      .setEmoji(Emojis.parse(Emojis.REPO))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("lumi:addon:rm_repo")
      .setLabel("Remove Repository")
      .setEmoji(Emojis.parse(Emojis.UNINSTALL))
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("lumi:update_all")
      .setLabel("Update All Add-ons")
      .setEmoji(Emojis.parse("🔄"))
      .setStyle(ButtonStyle.Secondary),
  );

  const coreActions = row(
    new ButtonBuilder()
      .setCustomId("lumi:check_core")
      .setLabel("Check Core Version")
      .setEmoji(Emojis.parse(Emojis.BOT))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("lumi:update_core")
      .setLabel("Self Update Lumi Core")
      .setEmoji(Emojis.parse(Emojis.BOT))
      .setStyle(ButtonStyle.Primary),
  );

  return makeCard(0, `${Emojis.REPO} Add-ons & Updates`, body, {
    footer: "Bot Owner access is required to add repositories or run updates.",
    actionRows: [backToHubRow(), browseButtons, repoActions, coreActions],
  });
}

export function buildAddonReposView(repos: AddonRepoRow[]): CardReply {
  const sorted = [...repos].sort((a, b) => a.name.localeCompare(b.name));
  const lines = sorted.length
    ? sorted.map(
        (repo) =>
          `**${repo.name}** (\`${repo.branch}\`)\n-# ${repo.url}\n-# Installed add-ons from this repo: **${repo.installedCount}**`,
      )
    : ["No repositories added yet. Click **Add Repository** to get started."];

  const rows: Row[] = [
    row(
      new ButtonBuilder()
        .setCustomId("lumi:tab:addons")
        .setLabel("Back to Add-ons")
        .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("lumi:addon:add_repo")
        .setLabel("Add Repository")
        .setEmoji(Emojis.parse(Emojis.REPO))
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("lumi:addon:refresh")
        .setLabel("Refresh")
        .setEmoji(Emojis.parse("🔄"))
        .setStyle(ButtonStyle.Secondary),
    ),
  ];

  if (sorted.length > 0) {
    rows.push(
      row(
        new StringSelectMenuBuilder()
          .setCustomId("lumi:addon:repo_pick")
          .setPlaceholder("Select a repository to view available modules...")
          .addOptions(
            sorted.slice(0, 25).map((repo) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(cutText(repo.name, 100))
                .setValue(repo.name)
                .setDescription(
                  cutText(
                    `Branch: ${repo.branch} • ${repo.installedCount} module(s) installed`,
                    100,
                  ),
                ),
            ),
          ),
      ),
    );
  }

  return makeCard(0, `${Emojis.REPO} Downloaded Repositories`, lines, {
    footer: "Select any repository from the dropdown to see its available modules.",
    actionRows: rows,
  });
}

export function buildAddonInstalledView(
  installed: AddonInstalledRow[],
): CardReply {
  const sorted = [...installed].sort((a, b) =>
    a.moduleName.localeCompare(b.moduleName),
  );
  const lines = sorted.length
    ? sorted.map(
        (mod) =>
          `**${mod.moduleName}** (v${mod.version ?? "1.0.0"})\n-# Repository: **${mod.repoName}** · Installed <t:${Math.floor(mod.installedAt.getTime() / 1000)}:R>`,
      )
    : ["No add-on modules are currently installed."];

  return makeCard(0, `${Emojis.DOWNLOAD} Installed Add-ons`, lines, {
    footer: "Installed add-ons automatically appear in the Modules tab.",
    actionRows: [
      row(
        new ButtonBuilder()
          .setCustomId("lumi:tab:addons")
          .setLabel("Back to Add-ons")
          .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("lumi:addon:uninstall")
          .setLabel("Uninstall Add-on")
          .setEmoji(Emojis.parse(Emojis.CROSS))
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("lumi:addon:refresh")
          .setLabel("Refresh")
          .setEmoji(Emojis.parse("🔄"))
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  });
}

export function buildAddonRepoModulesView(
  repoName: string,
  modules: AddonRepoModuleRow[],
): CardReply {
  const visible = modules.filter((moduleInfo) => !moduleInfo.hidden);
  const sorted = [...visible].sort((a, b) => a.name.localeCompare(b.name));

  const lines = sorted.length
    ? sorted.map((m) => {
        const statusBadge = m.isInstalled ? "✓ Installed" : "Available";
        const desc = m.short ? cutText(m.short, 100) : "No description.";
        return `**${m.name}** (v${m.version}) — *${statusBadge}*\n-# ${desc}`;
      })
    : ["No modules found in this repository."];

  const rows: Row[] = [
    row(
      new ButtonBuilder()
        .setCustomId("lumi:addon:repos")
        .setLabel("Back to Repositories")
        .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("lumi:addon:refresh")
        .setLabel("Refresh")
        .setEmoji(Emojis.parse("🔄"))
        .setStyle(ButtonStyle.Secondary),
    ),
  ];

  if (sorted.length > 0) {
    rows.push(
      row(
        new StringSelectMenuBuilder()
          .setCustomId(`lumi:addon:mod_action:${repoName}`)
          .setPlaceholder("Pick a module to install or uninstall...")
          .addOptions(
            sorted.slice(0, 25).map((m) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(cutText(`${m.name} (v${m.version})`, 100))
                .setValue(`${m.isInstalled ? "uninstall" : "install"}:${repoName}:${m.name}`)
                .setDescription(
                  cutText(
                    m.isInstalled
                      ? `Click to uninstall ${m.name}`
                      : `Click to install ${m.name}`,
                    100,
                  ),
                )
                .setEmoji(Emojis.parse(m.isInstalled ? Emojis.CROSS : Emojis.DOWNLOAD)),
            ),
          ),
      ),
    );
  }

  return makeCard(0, `${Emojis.GEAR} Available Modules in ${repoName}`, lines, {
    footer: "Choose any module from the menu above to install or uninstall it with 1 click.",
    actionRows: rows,
  });
}
