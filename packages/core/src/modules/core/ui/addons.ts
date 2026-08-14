import type { LumiT } from "#lib/i18n/index.js";
import { PanelsKeys } from "#lib/i18n/keys.js";
import { row, type Row } from "#modules/core/ui/common.js";
import { hubTabRow } from "#modules/core/ui/hub.js";
import { Emojis } from "#utilities/assets.js";
import { resolveCardColor, makeCard, type CardReply } from "#utilities/cards.js";
import {
  createPaginationRow,
  createStringSelectMenu,
  settingRow,
} from "#utilities/panels.js";
import {
  ButtonBuilder,
  StringSelectMenuOptionBuilder,
} from "@discordjs/builders";
import { time, TimestampStyles } from "@discordjs/formatters";
import { cutText } from "@sapphire/utilities";
import { ButtonStyle } from "discord.js";

// Each row here is a Section with 2-3 text lines + 1 button = 4-5 real
// components once nested, and card chrome already eats ~10-19 of Discord's
// 40-component budget per message, so page sizes stay well under naive counts.
export const ADDON_ROWS_PER_PAGE = 5;

export interface AddonDashboardStats {
  repoCount: number;
  installedCount: number;
  pendingUpdates: string[];
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
  enabled: boolean;
}

export interface AddonRepoModuleRow {
  name: string;
  version: string;
  short?: string;
  hidden?: boolean;
  isInstalled: boolean;
}

export interface AutoUpdateStatus {
  enabled: boolean;
  intervalMinutes: number;
}

export const AUTO_UPDATE_INTERVALS: { label: string; minutes: number }[] = [
  { label: "Every Hour", minutes: 60 },
  { label: "Every 6 Hours", minutes: 360 },
  { label: "Every 12 Hours", minutes: 720 },
  { label: "Every 24 Hours", minutes: 1440 },
  { label: "Every 7 Days", minutes: 10080 },
];

const backToAddonsRow = (t?: LumiT): Row =>
  row(
    new ButtonBuilder()
      .setCustomId("lumi:tab:addons")
      .setLabel(t ? t(PanelsKeys.BackToAddons) : "Back to Add-ons")
      .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
      .setStyle(ButtonStyle.Secondary),
  );

/** The add-ons tab landing card: repository and install counts plus navigation. */
export function buildAddonsView(
  stats: AddonDashboardStats = {
    repoCount: 0,
    installedCount: 0,
    pendingUpdates: [],
  },
  t?: LumiT,
): CardReply {
  const body = [
    t
      ? t(PanelsKeys.AddonsIntro)
      : "Add-ons let you expand Lumi with community modules. Every installed add-on works seamlessly alongside built-in features.",
    [
      `${Emojis.REPO} **${t ? t(PanelsKeys.AddonsRepos) : "Tracked Repositories"}:** ${stats?.repoCount ?? 0}`,
      `${Emojis.DOWNLOAD} **${t ? t(PanelsKeys.AddonsInstalled) : "Installed Add-ons"}:** ${stats?.installedCount ?? 0}`,
    ].join("\n"),
  ];

  if (stats.pendingUpdates.length > 0) {
    body.push(
      `${Emojis.WARNING_SIGN} **Updates available:** ${stats.pendingUpdates.map((m) => `\`${m}\``).join(", ")}`,
    );
  }

  const navButtons = row(
    new ButtonBuilder()
      .setCustomId("lumi:addon:repos")
      .setLabel(t ? t(PanelsKeys.AddonsBrowseRepos) : "Configure Repos")
      .setEmoji(Emojis.parse(Emojis.REPO))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("lumi:addon:installed")
      .setLabel(t ? t(PanelsKeys.AddonsBrowseInstalled) : "Configure Addons")
      .setEmoji(Emojis.parse(Emojis.DOWNLOAD))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("lumi:addon:autoupdate")
      .setLabel("Auto-Update")
      .setEmoji(Emojis.parse("⏱️"))
      .setStyle(ButtonStyle.Secondary),
  );

  return makeCard(
    resolveCardColor("primary"),
    `${Emojis.REPO} ${t ? t(PanelsKeys.AddonsTitle) : "Add-ons & Updates"}`,
    body,
    {
      footer: t
        ? t(PanelsKeys.AddonsFooter)
        : "Bot Owner access is required to add repositories or run updates.",
      actionRows: [navButtons, hubTabRow("addons", t)],
      separatorAboveActionRows: true,
    },
  );
}

/**
 * The tracked-repository list. Only the first {@linkcode ADDON_ROWS_PER_PAGE}
 * repositories get a row; the remainder is summarised as a `+n more` line.
 */
export function buildAddonReposView(
  repos: AddonRepoRow[],
  t?: LumiT,
): CardReply {
  const sorted = [...repos].sort((a, b) => a.name.localeCompare(b.name));
  const shown = sorted.slice(0, ADDON_ROWS_PER_PAGE);

  const sections = shown.map((repo) =>
    settingRow(
      [
        `${Emojis.REPO} **${repo.name}** (\`${repo.branch}\`)`,
        `-# ${cutText(repo.url, 90)}`,
        `-# ${t ? t(PanelsKeys.AddonsInstalled) : "Installed Add-ons"}: **${repo.installedCount}**`,
      ],
      {
        customId: `lumi:addon:update_repo:${repo.name}`,
        label: t ? t(PanelsKeys.AddonsUpdateRepo) : "Update Repo",
        style: ButtonStyle.Primary,
      },
    ),
  );

  const rows: Row[] = [
    row(
      new ButtonBuilder()
        .setCustomId("lumi:addon:add_repo")
        .setLabel(t ? t(PanelsKeys.AddonsAddRepo) : "Add Repository")
        .setEmoji(Emojis.parse(Emojis.REPO))
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("lumi:addon:rm_repo")
        .setLabel(t ? t(PanelsKeys.AddonsRemoveRepo) : "Remove Repository")
        .setEmoji(Emojis.parse(Emojis.UNINSTALL))
        .setStyle(ButtonStyle.Danger),
    ),
    backToAddonsRow(t),
  ];

  return makeCard(
    resolveCardColor("primary"),
    `${Emojis.REPO} ${t ? t(PanelsKeys.AddonsReposTitle) : "Configure Repositories"}`,
    sorted.length
      ? sorted.length > shown.length
        ? `-# +${sorted.length - shown.length} more`
        : ""
      : t
        ? t(PanelsKeys.AddonsReposEmpty)
        : "No repositories added yet. Click **Add Repository** to get started.",
    {
      sections,
      footer:
        "Update pulls the repo's latest commit for every installed module from it.",
      actionRows: rows,
    },
  );
}

/** The confirmation card shown after checking a repo, when a pending update was found. */
export function buildRepoUpdateConfirmView(
  repoName: string,
  changelog: string,
  t?: LumiT,
): CardReply {
  const rows: Row[] = [
    row(
      new ButtonBuilder()
        .setCustomId(`lumi:addon:update_repo_confirm:${repoName}`)
        .setLabel(t ? t(PanelsKeys.AddonsUpdateRepo) : "Update")
        .setEmoji(Emojis.parse(Emojis.DOWNLOAD))
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`lumi:addon:update_repo_skip:${repoName}`)
        .setLabel("Skip")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];

  return makeCard(
    resolveCardColor("warning"),
    `${Emojis.REPO} Update available for ${repoName}`,
    changelog
      ? `-# \`\`\`\n${cutText(changelog, 900)}\n\`\`\``
      : "New commits are available on the tracked branch.",
    {
      footer: "Update pulls the repo's latest commit for every installed module from it.",
      actionRows: rows,
    },
  );
}

/**
 * The installed add-on list with per-module enable/disable accessories, plus a
 * repository picker that jumps to {@linkcode buildAddonRepoModulesView}.
 */
export function buildAddonInstalledView(
  installed: AddonInstalledRow[],
  repos: { name: string }[],
  t?: LumiT,
): CardReply {
  const sorted = [...installed].sort((a, b) =>
    a.moduleName.localeCompare(b.moduleName),
  );
  const shown = sorted.slice(0, ADDON_ROWS_PER_PAGE);

  const sections = shown.map((mod) =>
    settingRow(
      [
        `${mod.enabled ? Emojis.SUCCESS : Emojis.ERROR} **${mod.moduleName}** (v${mod.version ?? "1.0.0"})`,
        `-# ${mod.repoName} · ${time(mod.installedAt, TimestampStyles.RelativeTime)}`,
      ],
      {
        customId: `lumi:addon:toggle:${mod.moduleName}`,
        label: mod.enabled
          ? t
            ? t(PanelsKeys.DetailDisable)
            : "Disable"
          : t
            ? t(PanelsKeys.DetailEnable)
            : "Enable",
        style: mod.enabled ? ButtonStyle.Danger : ButtonStyle.Success,
      },
    ),
  );

  const rows: Row[] = [backToAddonsRow(t)];
  if (repos.length > 0) {
    const sortedRepos = [...repos].sort((a, b) => a.name.localeCompare(b.name));
    rows.push(
      row(
        createStringSelectMenu({
          customId: "lumi:addon:repo_pick",
          placeholder: "📦 Browse a repository to install more…",
          options: sortedRepos
            .slice(0, 25)
            .map((repo) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(repo.name)
                .setValue(repo.name),
            ),
        }),
      ),
    );
  }

  return makeCard(
    resolveCardColor("primary"),
    `${Emojis.DOWNLOAD} ${t ? t(PanelsKeys.AddonsInstalledTitle) : "Configure Addons"}`,
    sorted.length
      ? sorted.length > shown.length
        ? `-# +${sorted.length - shown.length} more`
        : ""
      : t
        ? t(PanelsKeys.AddonsInstalledEmpty)
        : "No add-on modules are currently installed.",
    {
      sections,
      footer: t
        ? t(PanelsKeys.AddonsInstalledFooter)
        : "Toggling a module applies instantly - no restart needed.",
      actionRows: rows,
    },
  );
}

/**
 * The browsable module list of one repository. Modules flagged `hidden` are
 * dropped before pagination, so page counts follow the visible set.
 *
 * @param page - Zero-based page index; out-of-range values are clamped.
 */
export function buildAddonRepoModulesView(
  repoName: string,
  modules: AddonRepoModuleRow[],
  page = 0,
  t?: LumiT,
): CardReply {
  const visible = modules.filter((moduleInfo) => !moduleInfo.hidden);
  const sorted = [...visible].sort((a, b) => a.name.localeCompare(b.name));
  const totalPages = Math.max(
    1,
    Math.ceil(sorted.length / ADDON_ROWS_PER_PAGE),
  );
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const start = safePage * ADDON_ROWS_PER_PAGE;
  const shown = sorted.slice(start, start + ADDON_ROWS_PER_PAGE);

  const sections = shown.map((m) => {
    const status = m.isInstalled
      ? `${Emojis.CHECK} ${t ? t(PanelsKeys.AddonsStatusInstalled) : "Installed"}`
      : t
        ? t(PanelsKeys.AddonsStatusAvailable)
        : "Available";
    return settingRow(
      [
        `**${m.name}** (v${m.version}) - *${status}*`,
        `-# ${m.short ? cutText(m.short, 90) : "No description."}`,
      ],
      {
        customId: `lumi:addon:modact:${m.isInstalled ? "uninstall" : "install"}:${repoName}:${m.name}`,
        label: m.isInstalled
          ? t
            ? t(PanelsKeys.AddonsUninstall)
            : "Uninstall"
          : t
            ? t(PanelsKeys.AddonsInstall)
            : "Install",
        style: m.isInstalled ? ButtonStyle.Danger : ButtonStyle.Success,
      },
    );
  });

  const rows: Row[] = [
    row(
      new ButtonBuilder()
        .setCustomId("lumi:addon:installed")
        .setLabel(t ? t(PanelsKeys.BackToRepos) : "Back to Configure Addons")
        .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
  if (totalPages > 1) {
    rows.push(
      createPaginationRow({
        customIdPrefix: `lumi:addon:browsepage:${repoName}`,
        currentPage: safePage,
        totalPages,
      }),
    );
  }

  return makeCard(
    resolveCardColor("primary"),
    `${Emojis.GEAR} ${
      t
        ? t(PanelsKeys.AddonsModulesTitle, { repo: repoName })
        : `Available Modules in ${repoName}`
    }`,
    sorted.length
      ? ""
      : t
        ? t(PanelsKeys.AddonsModulesEmpty)
        : "No modules found in this repository.",
    {
      sections,
      footer:
        totalPages > 1
          ? `Page ${safePage + 1}/${totalPages} · Install or uninstall any module with one click.`
          : t
            ? t(PanelsKeys.AddonsModulesFooter)
            : "Install or uninstall any module with one click.",
      actionRows: rows,
    },
  );
}

/** The auto-update settings card: on/off toggle plus the check-interval picker. */
export function buildAutoUpdateSettingsView(
  status: AutoUpdateStatus,
  t?: LumiT,
): CardReply {
  const intervalLabel =
    AUTO_UPDATE_INTERVALS.find((i) => i.minutes === status.intervalMinutes)
      ?.label ?? `Every ${status.intervalMinutes} Minutes`;

  const toggleRow = row(
    new ButtonBuilder()
      .setCustomId("lumi:addon:autoupdate_toggle")
      .setLabel(status.enabled ? "Disable Auto-Update" : "Enable Auto-Update")
      .setEmoji(Emojis.parse(status.enabled ? Emojis.CROSS : Emojis.CHECK))
      .setStyle(status.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
  );

  const intervalSelect = createStringSelectMenu({
    customId: "lumi:addon:autoupdate_interval",
    placeholder: `⏱️ Check Interval: ${intervalLabel}`,
    options: AUTO_UPDATE_INTERVALS.map((i) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(i.label)
        .setValue(String(i.minutes))
        .setDefault(i.minutes === status.intervalMinutes),
    ),
  });

  return makeCard(
    resolveCardColor("primary"),
    "⏱️ Auto-Update Settings",
    [
      "When enabled, Lumi periodically checks every tracked repository and pulls updates for installed add-ons automatically.",
      `**Status:** ${status.enabled ? `${Emojis.SUCCESS} \`ENABLED\`` : `${Emojis.ERROR} \`DISABLED\``}`,
    ],
    {
      footer:
        "A restart is scheduled automatically only if an applied update needs one.",
      actionRows: [toggleRow, row(intervalSelect), backToAddonsRow(t)],
    },
  );
}
