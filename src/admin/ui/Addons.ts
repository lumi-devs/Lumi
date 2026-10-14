import type { Container } from "#src/lib/Services.js";
import type { DownloaderUtility } from "#src/admin/utilities/DownloaderUtility.js";
import type { LumiT } from "#src/lib/i18n/Index.js";
import { formatPageFooter, row, type Row } from "#src/modules/onboarding/ui/Common.js";
import { hubTabRow } from "#src/modules/onboarding/ui/Hub.js";
import { resolveCardColor } from "#src/lib/ui/Palette.js";
import { makeCard, type CardReply } from "#src/lib/ui/Cards.js";
import {
  componentEmoji,
  createPaginationRow,
  createStringSelectMenu,
  settingRow,
} from "#src/lib/ui/Panels.js";
import {
  ButtonBuilder,
  StringSelectMenuOptionBuilder,
} from "@discordjs/builders";
import { time, TimestampStyles } from "@discordjs/formatters";
import { cutText } from "#src/shared/Index.ts";
import { ButtonStyle } from "discord.js";

const AddonRowsPerPage = 3;

interface AddonDashboardStats {
  repoCount: number;
  installedCount: number;
  pendingUpdates: string[];
}

interface AddonRepoRow {
  name: string;
  url: string;
  branch: string;
  installedCount: number;
  commit: string | null;
}

interface AddonInstalledRow {
  moduleName: string;
  version: string | null;
  repoName: string;
  installedAt: Date;
  enabled: boolean;
}

interface AddonRepoModuleRow {
  name: string;
  version: string;
  short?: string | undefined;
  description?: string;
  endUserDataStatement?: string;
  author?: string | string[] | undefined;
  minBotVersion?: string | undefined;
  hidden?: boolean | undefined;
  isInstalled: boolean;
}

interface AutoUpdateStatus {
  enabled: boolean;
  intervalMinutes: number;
}

const AutoUpdateIntervals: { label: string; minutes: number }[] = [
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
      .setLabel(t ? t("panels:backToAddons") : "Back to Add-ons")
      .setEmoji(componentEmoji("⬅️"))
      .setStyle(ButtonStyle.Secondary),
  );

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
      ? t("panels:addonsIntro")
      : "Add-ons let you expand Lumi with community modules. Every installed add-on works seamlessly alongside built-in features.",
    [
      `📦 **${t ? t("panels:addonsRepos") : "Tracked Repositories"}:** ${stats.repoCount}`,
      `📥 **${t ? t("panels:addonsInstalled") : "Installed Add-ons"}:** ${stats.installedCount}`,
    ].join("\n"),
  ];

  if (stats.pendingUpdates.length > 0) {
    body.push(
      `⚠️ **Updates available:** ${stats.pendingUpdates.map((m) => `\`${m}\``).join(", ")}`,
    );
  }

  const navButtons = row(
    new ButtonBuilder()
      .setCustomId("lumi:addon:repos")
      .setLabel(t ? t("panels:addonsBrowseRepos") : "Configure Repos")
      .setEmoji(componentEmoji("📦"))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("lumi:addon:installed")
      .setLabel(t ? t("panels:addonsBrowseInstalled") : "Configure Addons")
      .setEmoji(componentEmoji("📥"))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("lumi:addon:autoupdate")
      .setLabel("Auto-Update")
      .setEmoji(componentEmoji("⏱️"))
      .setStyle(ButtonStyle.Secondary),
  );

  return makeCard(
    resolveCardColor("primary"),
    `📦 ${t ? t("panels:addonsTitle") : "Add-ons & Updates"}`,
    body,
    {
      breadcrumbs: ["Hub", "Addons"],
      footer: t
        ? t("panels:addonsFooter")
        : "Bot Owner access is required to add repositories or run updates.",
      actionRows: [navButtons, hubTabRow("addons", t)],
      separatorAboveActionRows: true,
    },
  );
}

export async function buildAddonReposCard(
  services: Container,
  downloader: DownloaderUtility,
  t?: LumiT,
): Promise<CardReply> {
  const [repos, installed] = await Promise.all([
    downloader.listRepos(services),
    downloader.getInstalledModulesDetailed(services),
  ]);

  const installedByRepo = new Map<number, number>();
  for (const row of installed) {
    installedByRepo.set(row.repoId, (installedByRepo.get(row.repoId) ?? 0) + 1);
  }

  return buildAddonReposView(
    repos.map((repo) => ({
      name: repo.name,
      url: repo.url,
      branch: repo.branch,
      commit: repo.commit,
      installedCount: installedByRepo.get(repo.id) ?? 0,
    })),
    t,
  );
}

export function buildAddonReposView(
  repos: AddonRepoRow[],
  t?: LumiT,
): CardReply {
  const sorted = [...repos].sort((a, b) => a.name.localeCompare(b.name));
  const shown = sorted.slice(0, AddonRowsPerPage);

  const sections = shown.map((repo) =>
    settingRow(
      [
        `📦 **${repo.name}** (\`${repo.branch}\`)${repo.commit ? ` @ \`${repo.commit.slice(0, 7)}\`` : ""}`,
        `-# ${cutText(repo.url, 90)}`,
        `-# ${t ? t("panels:addonsInstalled") : "Installed Add-ons"}: **${repo.installedCount}**`,
      ],
      {
        customId: `lumi:addon:update_repo:${repo.name}`,
        label: t ? t("panels:addonsUpdateRepo") : "Update Repo",
        style: ButtonStyle.Primary,
      },
    ),
  );

  const rows: Row[] = [
    row(
      new ButtonBuilder()
        .setCustomId("lumi:addon:add_repo")
        .setLabel(t ? t("panels:addonsAddRepo") : "Add Repository")
        .setEmoji(componentEmoji("📦"))
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("lumi:addon:rm_repo")
        .setLabel(t ? t("panels:addonsRemoveRepo") : "Remove Repository")
        .setEmoji(componentEmoji("🗑️"))
        .setStyle(ButtonStyle.Danger),
    ),
    backToAddonsRow(t),
  ];

  return makeCard(
    resolveCardColor("primary"),
    `📦 ${t ? t("panels:addonsReposTitle") : "Configure Repositories"}`,
    sorted.length
      ? sorted.length > shown.length
        ? `-# +${sorted.length - shown.length} more`
        : ""
      : t
        ? t("panels:addonsReposEmpty")
        : "No repositories added yet. Click **Add Repository** to get started.",
    {
      breadcrumbs: ["Hub", "Addons", "Configure Repositories"],
      sections,
      footer:
        "Update pulls the repo's latest commit per installed module from it.",
      actionRows: rows,
    },
  );
}

export function buildRepoUpdateConfirmView(
  repoName: string,
  changelog: string,
  t?: LumiT,
): CardReply {
  const rows: Row[] = [
    row(
      new ButtonBuilder()
        .setCustomId(`lumi:addon:update_repo_confirm:${repoName}`)
        .setLabel(t ? t("panels:addonsUpdateRepo") : "Update")
        .setEmoji(componentEmoji("📥"))
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`lumi:addon:update_repo_skip:${repoName}`)
        .setLabel("Skip")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];

  return makeCard(
    resolveCardColor("warning"),
    `📦 Update available for ${repoName}`,
    changelog
      ? `\`\`\`\n${cutText(changelog, 820)}\n\`\`\``
      : "New commits are available on the tracked branch.",
    {
      footer: "Update pulls the repo's latest commit for every installed module from it.",
      actionRows: rows,
    },
  );
}

export function buildAddonInstalledView(
  installed: AddonInstalledRow[],
  repos: { name: string }[],
  t?: LumiT,
): CardReply {
  const sorted = [...installed].sort((a, b) =>
    a.moduleName.localeCompare(b.moduleName),
  );
  const shown = sorted.slice(0, AddonRowsPerPage);

  const sections = shown.map((mod) =>
    settingRow(
      [
        `${mod.enabled ? "🟢" : "🔴"} **${mod.moduleName}** (v${mod.version ?? "1.0.0"})`,
        `-# ${mod.repoName} · ${time(mod.installedAt, TimestampStyles.RelativeTime)}`,
      ],
      {
        customId: `lumi:addon:toggle:${mod.moduleName}`,
        label: mod.enabled
          ? t
            ? t("panels:detailDisable")
            : "Disable"
          : t
            ? t("panels:detailEnable")
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
    `📥 ${t ? t("panels:addonsInstalledTitle") : "Configure Addons"}`,
    sorted.length
      ? sorted.length > shown.length
        ? `-# +${sorted.length - shown.length} more`
        : ""
      : t
        ? t("panels:addonsInstalledEmpty")
        : "No add-on modules are currently installed.",
    {
      breadcrumbs: ["Hub", "Addons", "Configure Addons"],
      sections,
      footer: t
        ? t("panels:addonsInstalledFooter")
        : "Toggling a module applies instantly - no restart needed.",
      actionRows: rows,
    },
  );
}

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
    Math.ceil(sorted.length / AddonRowsPerPage),
  );
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const start = safePage * AddonRowsPerPage;
  const shown = sorted.slice(start, start + AddonRowsPerPage);

  const sections = shown.map((m) => {
    const status = m.isInstalled
      ? `✅ ${t ? t("panels:addonsStatusInstalled") : "Installed"}`
      : t
        ? t("panels:addonsStatusAvailable")
        : "Available";

    const lines = [
      `**${m.name}** (v${m.version}) - *${status}*`,
      `-# ${m.short ? cutText(m.short, 90) : m.description ? cutText(m.description, 90) : "No description."}`,
    ];
    if (m.endUserDataStatement) {
      lines.push(`-# 🛡️ **Privacy:** ${cutText(m.endUserDataStatement, 80)}`);
    }

    return settingRow(
      lines,
      {
        customId: `lumi:addon:modact:${m.isInstalled ? "uninstall" : "install"}:${repoName}:${m.name}`,
        label: m.isInstalled
          ? t
            ? t("panels:addonsUninstall")
            : "Uninstall"
          : t
            ? t("panels:addonsInstall")
            : "Install",
        style: m.isInstalled ? ButtonStyle.Danger : ButtonStyle.Success,
      },
    );
  });

  const rows: Row[] = [];

  const infoButtons = shown.map((m) =>
    new ButtonBuilder()
      .setCustomId(`lumi:addon:modinfo:${repoName}:${m.name}`)
      .setLabel(`ℹ️ ${m.name}`)
      .setStyle(ButtonStyle.Secondary),
  );

  if (infoButtons.length > 0) {
    rows.push(row(...infoButtons));
  }

  rows.push(
    row(
      new ButtonBuilder()
        .setCustomId("lumi:addon:installed")
        .setLabel(t ? t("panels:backToRepos") : "Back to Configure Addons")
        .setEmoji(componentEmoji("⬅️"))
        .setStyle(ButtonStyle.Secondary),
    ),
  );
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
    `⚙️ ${
      t
        ? t("panels:addonsModulesTitle", { repo: repoName })
        : `Available Modules in ${repoName}`
    }`,
    sorted.length
      ? ""
      : t
        ? t("panels:addonsModulesEmpty")
        : "No modules found in this repository.",
    {
      breadcrumbs: ["Hub", "Addons", "Configure Addons", repoName],
      sections,
      footer:
        totalPages > 1
          ? formatPageFooter(
              safePage,
              totalPages,
              t
                ? t("panels:addonsModulesFooter")
                : "Install or uninstall any module with one click.",
            )
          : t
            ? t("panels:addonsModulesFooter")
            : "Install or uninstall any module with one click.",
      actionRows: rows,
    },
  );
}

export function buildAutoUpdateSettingsView(
  status: AutoUpdateStatus,
  t?: LumiT,
): CardReply {
  const intervalLabel =
    AutoUpdateIntervals.find((i) => i.minutes === status.intervalMinutes)
      ?.label ?? `Every ${status.intervalMinutes} Minutes`;

  const toggleRow = row(
    new ButtonBuilder()
      .setCustomId("lumi:addon:autoupdate_toggle")
      .setLabel(status.enabled ? "Disable Auto-Update" : "Enable Auto-Update")
      .setEmoji(componentEmoji(status.enabled ? "❌" : "✅"))
      .setStyle(status.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
  );

  const intervalSelect = createStringSelectMenu({
    customId: "lumi:addon:autoupdate_interval",
    placeholder: `⏱️ Check Interval: ${intervalLabel}`,
    options: AutoUpdateIntervals.map((i) =>
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
      `**Status:** ${status.enabled ? `🟢 \`ENABLED\`` : `🔴 \`DISABLED\``}`,
    ],
    {
      footer:
        "A restart is scheduled automatically only if an applied update needs one.",
      actionRows: [toggleRow, row(intervalSelect), backToAddonsRow(t)],
    },
  );
}
