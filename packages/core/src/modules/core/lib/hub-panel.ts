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

export function buildAddonsView(stats: AddonDashboardStats): CardReply {
  const body = [
    "Add-ons are community-built modules that install and behave exactly like first-party features. Once installed, they show up in the Modules tab for regular enable/disable and configuration.",
    `${Emojis.REPO} **Repositories tracked:** ${stats.repoCount}`,
    `${Emojis.DOWNLOAD} **Installed add-on modules:** ${stats.installedCount}`,
    [
      `${Emojis.REPO} **Browse Repositories** — see all tracked sources and pick one to inspect`,
      `${Emojis.DOWNLOAD} **Browse Modules** — see available modules in a selected repository`,
      `${Emojis.GEAR} **Installed Modules** — review what is currently installed`,
    ].join("\n"),
  ];

  const browseButtons = row(
    new ButtonBuilder()
      .setCustomId("lumi:addon:refresh")
      .setLabel("Refresh")
      .setEmoji(Emojis.parse("🔄"))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("lumi:addon:repos")
      .setLabel("Repositories")
      .setEmoji(Emojis.parse(Emojis.REPO))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("lumi:addon:modules")
      .setLabel("Repo Modules")
      .setEmoji(Emojis.parse(Emojis.GEAR))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("lumi:addon:installed")
      .setLabel("Installed")
      .setEmoji(Emojis.parse(Emojis.DOWNLOAD))
      .setStyle(ButtonStyle.Primary),
  );

  const repoActions = row(
    new ButtonBuilder()
      .setCustomId("lumi:addon:add_repo")
      .setLabel("Add Repository")
      .setEmoji(Emojis.parse(Emojis.REPO))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("lumi:addon:rm_repo")
      .setLabel("Remove Repository")
      .setEmoji(Emojis.parse(Emojis.UNINSTALL))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("lumi:addon:update_repo")
      .setLabel("Update Repository")
      .setEmoji(Emojis.parse("🔄"))
      .setStyle(ButtonStyle.Secondary),
  );

  const moduleActions = row(
    new ButtonBuilder()
      .setCustomId("lumi:addon:install")
      .setLabel("Install Module")
      .setEmoji(Emojis.parse(Emojis.DOWNLOAD))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("lumi:addon:uninstall")
      .setLabel("Uninstall Module")
      .setEmoji(Emojis.parse(Emojis.CROSS))
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
      .setLabel("Check Core Updates")
      .setEmoji(Emojis.parse(Emojis.BOT))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("lumi:update_core")
      .setLabel("Update Lumi Core")
      .setEmoji(Emojis.parse(Emojis.BOT))
      .setStyle(ButtonStyle.Primary),
  );

  return makeCard(0, `${Emojis.REPO} Addons`, body, {
    footer:
      "Add-on and core update management requires Bot Owner permission.",
    actionRows: [backToHubRow(), browseButtons, repoActions, moduleActions, coreActions],
  });
}

export function buildAddonReposView(repos: AddonRepoRow[]): CardReply {
  const sorted = [...repos].sort((a, b) => a.name.localeCompare(b.name));
  const lines = sorted.length
    ? sorted.map(
        (repo) =>
          `**${repo.name}** (${repo.branch})\n${repo.url}\nInstalled from this repo: **${repo.installedCount}** module(s)`,
      )
    : ["No repositories added yet. Add one to start browsing modules."];

  const rows: Row[] = [
    row(
      new ButtonBuilder()
        .setCustomId("lumi:tab:addons")
        .setLabel("Back to Add-ons")
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
          .setCustomId("lumi:addon:repo_pick")
          .setPlaceholder("Select a repository to view modules...")
          .addOptions(
            sorted.slice(0, 25).map((repo) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(cutText(repo.name, 100))
                .setValue(repo.name)
                .setDescription(
                  cutText(
                    `${repo.installedCount} installed • ${repo.branch}`,
                    100,
                  ),
                ),
            ),
          ),
      ),
    );
  }

  return makeCard(0, `${Emojis.REPO} Repositories`, lines, {
    footer:
      "Tip: pick a repository from the menu to list available modules.",
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
          `**${mod.moduleName}** (${mod.version ?? "unknown version"})\nRepository: **${mod.repoName}**\nInstalled: <t:${Math.floor(mod.installedAt.getTime() / 1000)}:R>`,
      )
    : ["No add-on modules are installed yet."];

  return makeCard(0, `${Emojis.DOWNLOAD} Installed Add-ons`, lines, {
    footer: "Use uninstall if you no longer need a module.",
    actionRows: [
      row(
        new ButtonBuilder()
          .setCustomId("lumi:tab:addons")
          .setLabel("Back to Add-ons")
          .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
          .setStyle(ButtonStyle.Secondary),
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
    ? sorted.map((moduleInfo) => {
        const marker = moduleInfo.isInstalled ? "Installed" : "Available";
        const desc = moduleInfo.short
          ? cutText(moduleInfo.short, 120)
          : "No description provided.";
        return `**${moduleInfo.name}** (v${moduleInfo.version}) - ${marker}\n${desc}`;
      })
    : ["No visible modules were found in this repository."];

  return makeCard(0, `${Emojis.GEAR} Modules in ${repoName}`, lines, {
    footer:
      "Use Install Module for a first install, or Update All Add-ons for bulk updates.",
    actionRows: [
      row(
        new ButtonBuilder()
          .setCustomId("lumi:addon:repos")
          .setLabel("Back to Repositories")
          .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("lumi:addon:install")
          .setLabel("Install Module")
          .setEmoji(Emojis.parse(Emojis.DOWNLOAD))
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("lumi:addon:refresh")
          .setLabel("Refresh")
          .setEmoji(Emojis.parse("🔄"))
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  });
}
