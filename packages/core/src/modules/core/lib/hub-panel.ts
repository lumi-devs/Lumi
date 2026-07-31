import {
  ActionRowBuilder,
  ButtonBuilder,
  SectionBuilder,
  StringSelectMenuOptionBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import { ButtonStyle } from "discord.js";
import { cutText } from "@sapphire/utilities";
import {
  channelMention,
  roleMention,
  time,
  TimestampStyles,
  userMention,
} from "@discordjs/formatters";
import {
  CARD_ACCENTS,
  makeCard,
  noPingCard,
  type CardReply,
} from "#lib/utilities/cards.js";
import { Emojis } from "#lib/utilities/assets.js";
import { SUPPORTED_LANGUAGES, type LumiT } from "#lib/i18n/index.js";
import { PanelsKeys } from "#lib/i18n/keys.js";
import {
  createMentionableSelectMenu,
  createPaginationRow,
  createStringSelectMenu,
  settingRow,
  tabRow,
  type Tab,
} from "#utilities/panels.js";

export const DEFAULT_PREFIX = ",";
export const PERMS_PER_PAGE = 6;
export const ADDON_ROWS_PER_PAGE = 8;

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

const row = (...components: MessageActionRowComponentBuilder[]): Row =>
  new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    ...components,
  );

export type HubTabId =
  | "home"
  | "modules"
  | "permissions"
  | "settings"
  | "addons";

const hubTabs = (t?: LumiT): Tab[] => [
  { id: "home", label: t ? t(PanelsKeys.TabHome) : "Hub", emoji: Emojis.BOT },
  {
    id: "modules",
    label: t ? t(PanelsKeys.TabModules) : "Modules",
    emoji: Emojis.GEAR,
  },
  {
    id: "permissions",
    label: t ? t(PanelsKeys.TabPermissions) : "Permissions",
    emoji: Emojis.SHIELD,
  },
  {
    id: "settings",
    label: t ? t(PanelsKeys.TabSettings) : "Settings",
    emoji: Emojis.GUILD,
  },
  {
    id: "addons",
    label: t ? t(PanelsKeys.TabAddons) : "Addons",
    emoji: Emojis.REPO,
  },
];

/** The persistent tab bar shown on every hub view. */
export function hubTabRow(active: HubTabId, t?: LumiT): Row {
  return tabRow("lumi:tab", hubTabs(t), active);
}

export function backToHubRow(t?: LumiT): Row {
  return row(
    new ButtonBuilder()
      .setCustomId("lumi:tab:home")
      .setLabel(t ? t(PanelsKeys.BackToHub) : "Back to Hub")
      .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
      .setStyle(ButtonStyle.Secondary),
  );
}

export interface HubOverview {
  moduleCount: number;
  enabledCount: number;
  prefix: string | null;
  locale: string;
  iconUrl?: string | null;
}

export function buildHubView(o: HubOverview, t?: LumiT): CardReply {
  const prefix = o.prefix ?? DEFAULT_PREFIX;
  const glanceLines = [
    t
      ? t(PanelsKeys.HubIntro)
      : "Manage everything for this server from one place - no scattered commands to remember.",
    `${Emojis.GEAR} ${
      t
        ? t(PanelsKeys.HubGlanceModules, { enabled: o.enabledCount, total: o.moduleCount })
        : `**${o.enabledCount}** of **${o.moduleCount}** modules enabled`
    }`,
    `${Emojis.GUILD} ${
      t
        ? t(PanelsKeys.HubGlanceLocale, { locale: o.locale, prefix })
        : `Language \`${o.locale}\`  •  Prefix \`${prefix}\``
    }`,
  ];

  const hints = [
    `${Emojis.GEAR} **${t ? t(PanelsKeys.TabModules) : "Modules"}** - ${t ? t(PanelsKeys.TabHintModules) : "enable, disable, and configure every feature"}`,
    `${Emojis.SHIELD} **${t ? t(PanelsKeys.TabPermissions) : "Permissions"}** - ${t ? t(PanelsKeys.TabHintPermissions) : "permit grants and per-command overrides"}`,
    `${Emojis.GUILD} **${t ? t(PanelsKeys.TabSettings) : "Settings"}** - ${t ? t(PanelsKeys.TabHintSettings) : "server language and command prefix"}`,
    `${Emojis.REPO} **${t ? t(PanelsKeys.TabAddons) : "Addons"}** - ${t ? t(PanelsKeys.TabHintAddons) : "extend Lumi with add-on modules"}`,
  ].join("\n");

  return makeCard(
    CARD_ACCENTS.PRIMARY,
    `${Emojis.BOT} ${t ? t(PanelsKeys.HubTitle) : "Lumi Control Panel"}`,
    [glanceLines.join("\n"), hints],
    {
      footer: t ? t(PanelsKeys.HubFooter) : "Select a tab below to continue.",
      thumbnailUrl: o.iconUrl ?? undefined,
      actionRows: [hubTabRow("home", t)],
    },
  );
}

export function buildSettingsView(
  settings: { prefix: string | null; locale: string },
  t?: LumiT,
): CardReply {
  const prefixLabel = t ? t(PanelsKeys.SettingsPrefix) : "Prefix";
  const prefixValue = `\`${settings.prefix ?? DEFAULT_PREFIX}\`${
    settings.prefix
      ? ""
      : ` *${t ? t(PanelsKeys.SettingsPrefixDefault) : "(default)"}*`
  }`;

  const sections: SectionBuilder[] = [
    settingRow(
      [
        `${Emojis.TERMINAL} **${prefixLabel}** - ${prefixValue}`,
        `-# ${t ? t(PanelsKeys.SettingsFooter) : "Prefix commands work for a curated set of moderation and utility commands."}`,
      ],
      {
        customId: "lumi:prefix:set",
        label: t ? t(PanelsKeys.SettingsEdit) : "Edit",
        emoji: Emojis.EDIT,
      },
    ),
  ];

  const langSelect = createStringSelectMenu({
    customId: "lumi:setlang",
    placeholder: t ? t(PanelsKeys.SettingsChangeLanguage) : "Change language…",
    options: SUPPORTED_LANGUAGES.slice(0, 25).map((lang) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(lang)
        .setValue(lang)
        .setDefault(lang === settings.locale),
    ),
  });

  const maintenanceButtons = row(
    new ButtonBuilder()
      .setCustomId("lumi:prefix:reset")
      .setLabel(t ? t(PanelsKeys.SettingsReset) : "Reset")
      .setEmoji(Emojis.parse(Emojis.UNINSTALL))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(settings.prefix === null),
    new ButtonBuilder()
      .setCustomId("lumi:update_all")
      .setLabel(t ? t(PanelsKeys.SettingsUpdateAddons) : "Update Addons")
      .setEmoji(Emojis.parse("🔄"))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("lumi:check_core")
      .setLabel(t ? t(PanelsKeys.SettingsCheckCore) : "Check Core")
      .setEmoji(Emojis.parse(Emojis.BOT))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("lumi:update_core")
      .setLabel(t ? t(PanelsKeys.SettingsUpdateCore) : "Update Lumi Core")
      .setEmoji(Emojis.parse(Emojis.BOT))
      .setStyle(ButtonStyle.Primary),
  );

  return makeCard(
    CARD_ACCENTS.PRIMARY,
    `${Emojis.GUILD} ${t ? t(PanelsKeys.SettingsTitle) : "Server Settings"}`,
    `${Emojis.GUILD} **${t ? t(PanelsKeys.SettingsLanguage) : "Language"}** - \`${settings.locale}\``,
    {
      sections,
      actionRows: [row(langSelect), maintenanceButtons, hubTabRow("settings", t)],
    },
  );
}

export interface PermissionOverrideRow {
  /** The permit node granted, e.g. `mod.*` or `admin.config`. */
  commandPath: string;
  modelType: string;
  modelId: string;
  /** True for an un-quarantinable enforced permit; false for a custom permit. */
  enforced: boolean;
}

const overrideMention = (o: PermissionOverrideRow): string => {
  if (o.modelType === "everyone") return "@everyone";
  if (o.modelType === "role") return roleMention(o.modelId);
  if (o.modelType === "user") return userMention(o.modelId);
  if (o.modelType === "category") return `category ${channelMention(o.modelId)}`;
  return channelMention(o.modelId);
};

export function buildPermissionsView(
  overrides: PermissionOverrideRow[],
  page = 0,
  t?: LumiT,
): CardReply {
  const totalPages = Math.max(1, Math.ceil(overrides.length / PERMS_PER_PAGE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const shown = overrides.slice(
    safePage * PERMS_PER_PAGE,
    (safePage + 1) * PERMS_PER_PAGE,
  );

  const sections = shown.map((o) =>
    settingRow(
      [
        `${o.enforced ? Emojis.SHIELD : Emojis.CHECK} \`${o.commandPath}\``,
        `-# ${o.enforced ? "enforced" : "custom"} · ${o.modelType} ${overrideMention(o)}`,
      ],
      {
        customId: `lumi:permdel:${o.enforced ? "e" : "c"}|${o.modelType}|${o.modelId}|${o.commandPath}`,
        label: t ? t(PanelsKeys.PermsRevoke) : "Revoke",
        style: ButtonStyle.Danger,
      },
    ),
  );

  const addRow = row(
    new ButtonBuilder()
      .setCustomId("lumi:permit:grant:custom")
      .setLabel(t ? t(PanelsKeys.PermsGrantCustom) : "Grant Custom…")
      .setEmoji(Emojis.parse(Emojis.CHECK))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("lumi:permit:grant:enforced")
      .setLabel(t ? t(PanelsKeys.PermsGrantEnforced) : "Grant Enforced…")
      .setEmoji(Emojis.parse(Emojis.SHIELD))
      .setStyle(ButtonStyle.Primary),
  );

  const rows: Row[] = [addRow];
  if (totalPages > 1) {
    rows.push(
      createPaginationRow({
        customIdPrefix: "lumi:permpage",
        currentPage: safePage,
        totalPages,
      }),
    );
  }
  rows.push(hubTabRow("permissions", t));

  const footer =
    totalPages > 1
      ? t
        ? t(PanelsKeys.PermsPageFooter, {
            page: safePage + 1,
            total: totalPages,
            count: overrides.length,
          })
        : `Page ${safePage + 1} of ${totalPages} · ${overrides.length} override(s)`
      : t
        ? t(PanelsKeys.PermsCountFooter, { count: overrides.length })
        : `${overrides.length} override(s)`;

  return noPingCard(
    makeCard(
      CARD_ACCENTS.PRIMARY,
      `${Emojis.SHIELD} ${t ? t(PanelsKeys.PermsTitle) : "Command Permissions"}`,
      shown.length
        ? `-# ${Emojis.CHECK} ${t ? t(PanelsKeys.PermsLegend) : "custom · enforced. Enforced permits survive anti-nuke quarantine."}`
        : (t
            ? t(PanelsKeys.PermsEmpty)
            : "*No permission overrides set - every command uses its default access.*"),
      { sections, footer, actionRows: rows },
    ),
  );
}

export type PermitKind = "custom" | "enforced";

/** Step 1 of granting a permit: pick who it applies to. */
export function buildPermitTargetPickerView(
  kind: PermitKind,
  t?: LumiT,
): CardReply {
  const select = createMentionableSelectMenu({
    customId: `lumi:permit:target:${kind}`,
    placeholder: t ? t(PanelsKeys.PermsPickTarget) : "Pick a role or member…",
  });

  return makeCard(
    CARD_ACCENTS.PRIMARY,
    `${Emojis.SHIELD} ${t ? (kind === "enforced" ? t(PanelsKeys.PermsGrantEnforced) : t(PanelsKeys.PermsGrantCustom)) : "Grant Permit"}`,
    t ? t(PanelsKeys.PermsPickTarget) : "Pick a role or member to grant a permit to.",
    {
      actionRows: [row(select), backToPermissionsRow(t)],
    },
  );
}

/** Step 2 of granting a permit: pick which node to grant the chosen target. */
export function buildPermitNodePickerView(
  kind: PermitKind,
  targetType: "role" | "user",
  targetId: string,
  nodes: string[],
  t?: LumiT,
): CardReply {
  const mention = targetType === "role" ? roleMention(targetId) : userMention(targetId);

  if (nodes.length === 0) {
    return makeCard(
      CARD_ACCENTS.PRIMARY,
      `${Emojis.SHIELD} ${t ? t(PanelsKeys.PermsPickNode) : "Pick a Permit Node"}`,
      t ? t(PanelsKeys.PermsNoNodes) : "No permit nodes are registered by any loaded command.",
      { actionRows: [backToPermissionsRow(t)] },
    );
  }

  const select = createStringSelectMenu({
    customId: `lumi:permit:node:${kind}:${targetType}:${targetId}`,
    placeholder: t ? t(PanelsKeys.PermsPickNode) : "Pick the permit node…",
    options: nodes.slice(0, 25).map((node) =>
      new StringSelectMenuOptionBuilder().setLabel(node).setValue(node),
    ),
  });

  return makeCard(
    CARD_ACCENTS.PRIMARY,
    `${Emojis.SHIELD} ${t ? t(PanelsKeys.PermsPickNode) : "Pick a Permit Node"}`,
    `${t ? t(PanelsKeys.PermsPickNode) : "Pick the permit node to grant"} ${mention}.`,
    {
      actionRows: [row(select), backToPermissionsRow(t)],
    },
  );
}

const backToPermissionsRow = (t?: LumiT): Row =>
  row(
    new ButtonBuilder()
      .setCustomId("lumi:tab:permissions")
      .setLabel(t ? t(PanelsKeys.BackToHub) : "Back")
      .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
      .setStyle(ButtonStyle.Secondary),
  );

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

  const browseButtons = row(
    new ButtonBuilder()
      .setCustomId("lumi:addon:repos")
      .setLabel(t ? t(PanelsKeys.AddonsBrowseRepos) : "Downloaded Repositories")
      .setEmoji(Emojis.parse(Emojis.REPO))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("lumi:addon:installed")
      .setLabel(t ? t(PanelsKeys.AddonsBrowseInstalled) : "Installed Add-ons")
      .setEmoji(Emojis.parse(Emojis.DOWNLOAD))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("lumi:addon:refresh")
      .setLabel(t ? t(PanelsKeys.AddonsRefresh) : "Refresh")
      .setEmoji(Emojis.parse("🔄"))
      .setStyle(ButtonStyle.Secondary),
  );

  const repoActions = row(
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
    new ButtonBuilder()
      .setCustomId("lumi:update_all")
      .setLabel(t ? t(PanelsKeys.AddonsUpdateAll) : "Update All Add-ons")
      .setEmoji(Emojis.parse("🔄"))
      .setStyle(ButtonStyle.Secondary),
  );

  return makeCard(
    CARD_ACCENTS.PRIMARY,
    `${Emojis.REPO} ${t ? t(PanelsKeys.AddonsTitle) : "Add-ons & Updates"}`,
    body,
    {
      footer:
        t
          ? t(PanelsKeys.AddonsFooter)
          : "Bot Owner access is required to add repositories or run updates.",
      actionRows: [browseButtons, repoActions, hubTabRow("addons", t)],
    },
  );
}

const backToAddonsRow = (t?: LumiT): Row =>
  row(
    new ButtonBuilder()
      .setCustomId("lumi:tab:addons")
      .setLabel(t ? t(PanelsKeys.BackToAddons) : "Back to Add-ons")
      .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("lumi:addon:refresh")
      .setLabel(t ? t(PanelsKeys.AddonsRefresh) : "Refresh")
      .setEmoji(Emojis.parse("🔄"))
      .setStyle(ButtonStyle.Secondary),
  );

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
        customId: `lumi:addon:browse:${repo.name}`,
        label: t ? t(PanelsKeys.AddonsBrowse) : "Browse",
        style: ButtonStyle.Primary,
      },
    ),
  );

  const rows: Row[] = [
    row(
      new ButtonBuilder()
        .setCustomId("lumi:tab:addons")
        .setLabel(t ? t(PanelsKeys.BackToAddons) : "Back to Add-ons")
        .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("lumi:addon:add_repo")
        .setLabel(t ? t(PanelsKeys.AddonsAddRepo) : "Add Repository")
        .setEmoji(Emojis.parse(Emojis.REPO))
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("lumi:addon:refresh")
        .setLabel(t ? t(PanelsKeys.AddonsRefresh) : "Refresh")
        .setEmoji(Emojis.parse("🔄"))
        .setStyle(ButtonStyle.Secondary),
    ),
  ];

  return makeCard(
    CARD_ACCENTS.PRIMARY,
    `${Emojis.REPO} ${t ? t(PanelsKeys.AddonsReposTitle) : "Downloaded Repositories"}`,
    sorted.length
      ? sorted.length > shown.length
        ? `-# +${sorted.length - shown.length} more`
        : ""
      : (t
          ? t(PanelsKeys.AddonsReposEmpty)
          : "No repositories added yet. Click **Add Repository** to get started."),
    {
      sections,
      footer:
        t
          ? t(PanelsKeys.AddonsReposFooter)
          : "Browse a repository to see its available modules.",
      actionRows: rows,
    },
  );
}

export function buildAddonInstalledView(
  installed: AddonInstalledRow[],
  t?: LumiT,
): CardReply {
  const sorted = [...installed].sort((a, b) =>
    a.moduleName.localeCompare(b.moduleName),
  );
  const shown = sorted.slice(0, ADDON_ROWS_PER_PAGE);

  const sections = shown.map((mod) =>
    settingRow(
      [
        `${Emojis.DOWNLOAD} **${mod.moduleName}** (v${mod.version ?? "1.0.0"})`,
        `-# ${mod.repoName} · ${time(mod.installedAt, TimestampStyles.RelativeTime)}`,
      ],
      {
        customId: `lumi:addon:rm_mod:${mod.moduleName}`,
        label: t ? t(PanelsKeys.AddonsUninstall) : "Uninstall",
        style: ButtonStyle.Danger,
      },
    ),
  );

  return makeCard(
    CARD_ACCENTS.PRIMARY,
    `${Emojis.DOWNLOAD} ${t ? t(PanelsKeys.AddonsInstalledTitle) : "Installed Add-ons"}`,
    sorted.length
      ? sorted.length > shown.length
        ? `-# +${sorted.length - shown.length} more`
        : ""
      : (t
          ? t(PanelsKeys.AddonsInstalledEmpty)
          : "No add-on modules are currently installed."),
    {
      sections,
      footer:
        t
          ? t(PanelsKeys.AddonsInstalledFooter)
          : "Installed add-ons automatically appear in the Modules tab.",
      actionRows: [backToAddonsRow(t)],
    },
  );
}

export function buildAddonRepoModulesView(
  repoName: string,
  modules: AddonRepoModuleRow[],
  t?: LumiT,
): CardReply {
  const visible = modules.filter((moduleInfo) => !moduleInfo.hidden);
  const sorted = [...visible].sort((a, b) => a.name.localeCompare(b.name));
  const shown = sorted.slice(0, ADDON_ROWS_PER_PAGE);

  const sections = shown.map((m) => {
    const status = m.isInstalled
      ? `${Emojis.CHECK} ${t ? t(PanelsKeys.AddonsStatusInstalled) : "Installed"}`
      : (t ? t(PanelsKeys.AddonsStatusAvailable) : "Available");
    return settingRow(
      [
        `**${m.name}** (v${m.version}) - *${status}*`,
        `-# ${m.short ? cutText(m.short, 90) : "No description."}`,
      ],
      {
        customId: `lumi:addon:modact:${m.isInstalled ? "uninstall" : "install"}:${repoName}:${m.name}`,
        label: m.isInstalled
          ? (t ? t(PanelsKeys.AddonsUninstall) : "Uninstall")
          : (t ? t(PanelsKeys.AddonsInstall) : "Install"),
        style: m.isInstalled ? ButtonStyle.Danger : ButtonStyle.Success,
      },
    );
  });

  const rows: Row[] = [
    row(
      new ButtonBuilder()
        .setCustomId("lumi:addon:repos")
        .setLabel(t ? t(PanelsKeys.BackToRepos) : "Back to Repositories")
        .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`lumi:addon:browse:${repoName}`)
        .setLabel(t ? t(PanelsKeys.AddonsRefresh) : "Refresh")
        .setEmoji(Emojis.parse("🔄"))
        .setStyle(ButtonStyle.Secondary),
    ),
  ];

  return makeCard(
    CARD_ACCENTS.PRIMARY,
    `${Emojis.GEAR} ${
      t
        ? t(PanelsKeys.AddonsModulesTitle, { repo: repoName })
        : `Available Modules in ${repoName}`
    }`,
    sorted.length
      ? sorted.length > shown.length
        ? `-# +${sorted.length - shown.length} more`
        : ""
      : (t
          ? t(PanelsKeys.AddonsModulesEmpty)
          : "No modules found in this repository."),
    {
      sections,
      footer:
        t
          ? t(PanelsKeys.AddonsModulesFooter)
          : "Install or uninstall any module with one click.",
      actionRows: rows,
    },
  );
}
