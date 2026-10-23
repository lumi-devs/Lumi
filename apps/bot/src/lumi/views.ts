import {
  ButtonBuilder,
  StringSelectMenuOptionBuilder,
} from "@discordjs/builders";
import { ButtonStyle, ChannelType, roleMention, userMention, channelMention } from "discord.js";
import type { ModuleStatus } from "@lumi/contracts";
import type { PermitWithAssignments } from "@lumi/db";
import type { ModuleConfigField } from "@lumi/bot-kit";
import {
  componentEmoji,
  createActionButton,
  createBackButton,
  createChannelSelectMenu,
  createPaginationRow,
  createRoleSelectMenu,
  createStringSelectMenu,
  createUserSelectMenu,
  formatPageFooter,
  makeCard,
  noPingCard,
  resolveCardColor,
  row,
  settingRow,
  tabRow,
  type CardReply,
  type Row,
} from "@lumi/ui";
import { HubId, type HubTab } from "./state.ts";

export const ModulesPerPage = 4;
export const PermissionsPerPage = 4;
export const PermitOrderPerPage = 3;
export const ExplainNodesPerPage = 25;

interface TabDef {
  id: HubTab;
  label: string;
  emoji: string;
}

const Tabs: readonly TabDef[] = [
  { id: "home", label: "Hub", emoji: "🤖" },
  { id: "modules", label: "Modules", emoji: "⚙️" },
  { id: "permissions", label: "Permissions", emoji: "🛡️" },
  { id: "settings", label: "Settings", emoji: "🏰" },
  { id: "addons", label: "Addons", emoji: "📦" },
];

export function hubTabRow(active: HubTab): Row {
  return tabRow("lumi:tab", Tabs, active);
}

export interface HubOverview {
  moduleCount: number;
  enabledCount: number;
  prefix: string;
  iconUrl?: string | null | undefined;
}

export function buildHubView(view: HubOverview): CardReply {
  const glanceLines = [
    "Manage everything for this server from one place - no scattered commands to remember.",
    `⚙️ **${view.enabledCount}** of **${view.moduleCount}** modules enabled`,
    `🏰 Prefix \`${view.prefix}\``,
  ];

  const hints = [
    "⚙️ **Modules** - enable, disable, and configure every feature",
    "🛡️ **Permissions** - permit grants and per-command overrides",
    "🏰 **Settings** - command prefix and add-on maintenance",
    "📦 **Addons** - extend Lumi with add-on modules",
  ].join("\n");

  return makeCard(resolveCardColor("primary"), "🤖 Lumi Control Panel", [glanceLines.join("\n"), hints], {
    breadcrumbs: ["Hub"],
    footer: "Select a tab below to continue.",
    ...(view.iconUrl ? { thumbnailUrl: view.iconUrl } : {}),
    actionRows: [hubTabRow("home")],
    separatorAboveActionRows: true,
  });
}

export interface ModuleEntry {
  status: ModuleStatus;
  guildEnabled: boolean;
  globalEnabled: boolean;
}

export function buildModulesView(entries: ModuleEntry[], page: number): CardReply {
  const sorted = [...entries].sort((a, b) =>
    a.status.displayName.localeCompare(b.status.displayName),
  );
  const totalPages = Math.max(1, Math.ceil(sorted.length / ModulesPerPage));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const shown = sorted.slice(safePage * ModulesPerPage, (safePage + 1) * ModulesPerPage);

  const sections = shown.map((entry) => {
    const enabled = entry.status.state === "loaded" && entry.guildEnabled && entry.globalEnabled;
    const failed = entry.status.state === "failed";
    const lines = [
      `${failed ? "🔴" : enabled ? "🟢" : "🔴"} ${entry.status.emoji} **${entry.status.displayName}**`,
      `-# ${entry.status.description}`,
      `-# v${entry.status.version} · ${entry.status.commandCount} command${entry.status.commandCount === 1 ? "" : "s"}${entry.globalEnabled ? "" : " · globally disabled"}`,
    ];

    return settingRow(lines, {
      customId: HubId.moduleOpen(entry.status.name, safePage),
      label: failed ? "Failed" : entry.globalEnabled ? "Open" : "Globally Off",
      style: failed ? ButtonStyle.Secondary : ButtonStyle.Primary,
      disabled: failed || !entry.globalEnabled,
    });
  });

  const rows: Row[] = [];
  if (totalPages > 1) {
    rows.push(
      createPaginationRow({
        customIdPrefix: "lumi:modpage",
        currentPage: safePage,
        totalPages,
      }),
    );
  }
  rows.push(hubTabRow("modules"));

  return makeCard(
    resolveCardColor("primary"),
    "⚙️ Feature Modules",
    shown.length === 0 ? "*No modules discovered.*" : "",
    {
      breadcrumbs: ["Hub", "Modules"],
      sections,
      footer:
        totalPages > 1
          ? formatPageFooter(safePage, totalPages, "Enable or disable a module for this server.")
          : "Enable or disable a module for this server.",
      actionRows: rows,
      separatorAboveActionRows: true,
    },
  );
}

export interface ModuleDetailView {
  status: ModuleStatus;
  guildEnabled: boolean;
  globalEnabled: boolean;
  fields: readonly ModuleConfigField[];
  config: Record<string, unknown>;
  page: number;
}

function configValueLine(field: ModuleConfigField, value: unknown): string {
  if (field.type === "boolean") {
    return value === true ? "✅ Enabled" : "❌ Disabled";
  }
  if (value === null || value === undefined || value === "") {
    return "🔴 Not set";
  }
  if (field.type === "channel" && typeof value === "string") {
    return `🟢 ${channelMention(value)}`;
  }
  if (field.type === "role" && typeof value === "string") {
    return `🟢 ${roleMention(value)}`;
  }
  if ((field.type === "multi-channel" || field.type === "multi-role") && Array.isArray(value)) {
    if (value.length === 0) return "🔴 Not set";
    const mention = field.type === "multi-role" ? roleMention : channelMention;
    return `🟢 ${value.map((id) => mention(String(id))).join(", ")}`;
  }
  return `🟢 \`${String(value)}\``;
}

/**
 * Module detail view. Field controls are optional metadata, so modules that
 * only ship a Zod schema still open to an explainer instead of an empty panel.
 */
export function buildModuleDetailView(view: ModuleDetailView): CardReply {
  const { status, fields, config } = view;
  const loaded = status.state === "loaded";
  const enabled = loaded && view.guildEnabled && view.globalEnabled;
  // Discord allows five action rows and a finite component budget. Three
  // channel/role selectors plus the controls row and the tab row fill that
  // budget, so cap the metadata rows and hide selectors beyond the first
  // three rather than render a "Select Below" button with no matching menu.
  const firstFields = fields.slice(0, 8);
  const isSelectField = (field: ModuleConfigField): boolean =>
    field.type === "channel" ||
    field.type === "role" ||
    field.type === "multi-channel" ||
    field.type === "multi-role";
  const selectFields = firstFields.filter(isSelectField).slice(0, 3);
  const selectableKeys = new Set(selectFields.map((field) => field.key));
  const visibleFields = firstFields.filter(
    (field) => !isSelectField(field) || selectableKeys.has(field.key),
  );

  const sections = visibleFields.map((field) => {
    const lines = [
      `${configValueLine(field, config[field.key])} **${field.label}**${field.required ? " *(required)*" : ""}`,
      ...(field.description ? [`-# ${field.description}`] : []),
    ];

    if (field.type === "boolean") {
      const on = config[field.key] === true;
      return settingRow(lines, {
        customId: HubId.moduleBool(status.name, field.key, view.page),
        label: on ? "Turn Off" : "Turn On",
        style: on ? ButtonStyle.Danger : ButtonStyle.Success,
      });
    }

    if (isSelectField(field)) {
      return settingRow(lines, {
        customId: HubId.moduleEdit(status.name, field.key, view.page),
        label: "Select Below",
        style: ButtonStyle.Secondary,
        disabled: true,
      });
    }

    return settingRow(lines, {
      customId: HubId.moduleEdit(status.name, field.key, view.page),
      label: "Edit",
      emoji: "✏️",
      style: ButtonStyle.Secondary,
    });
  });

  const selectRows: Row[] = selectFields.map((field) => {
    if (field.type === "channel" || field.type === "multi-channel") {
      const multi = field.type === "multi-channel";
      return row(
        createChannelSelectMenu({
          customId: HubId.moduleChannel(status.name, field.key, view.page),
          placeholder: `Select ${field.label}…`,
          channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
          minValues: multi ? 0 : 1,
          maxValues: multi ? 25 : 1,
        }),
      );
    }
    const multi = field.type === "multi-role";
    return row(
      createRoleSelectMenu({
        customId: HubId.moduleRole(status.name, field.key, view.page),
        placeholder: `Select ${field.label}…`,
        minValues: multi ? 0 : 1,
        maxValues: multi ? 25 : 1,
      }),
    );
  });

  const controls = row(
    new ButtonBuilder()
      .setCustomId(HubId.moduleToggle(status.name, view.page))
      .setLabel(enabled ? "Disable Module" : "Enable Module")
      .setEmoji(componentEmoji(enabled ? "❌" : "✅"))
      .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success)
      .setDisabled(status.state === "failed" || !view.globalEnabled),
    createActionButton({
      customId: HubId.moduleReset(status.name, view.page),
      label: "Reset Config",
      emoji: "🗑️",
      style: ButtonStyle.Secondary,
    }),
    createBackButton(HubId.moduleBack(view.page), "← Modules"),
  );

  const body = [
    status.description,
    "",
    `**Origin:** \`${status.origin}\` • **Version:** \`v${status.version}\` • **Commands:** \`${status.commandCount}\``,
    `**Status:** ${enabled ? "🟢 enabled" : loaded ? "🔴 disabled for this server" : status.state === "failed" ? "🔴 failed to load" : "🔴 globally disabled"}`,
    ...(status.error ? ["", `**Error:** ${status.error}`] : []),
    ...(fields.length === 0
      ? ["", "-# This module has no editable settings."]
      : fields.length > visibleFields.length
        ? ["", `-# Showing ${visibleFields.length} of ${fields.length} settings.`]
        : []),
  ].join("\n");

  return makeCard(
    resolveCardColor(status.state === "failed" ? "error" : enabled ? "success" : "primary"),
    `${status.emoji} ${status.displayName}`,
    body,
    {
      breadcrumbs: ["Hub", "Modules", status.displayName],
      sections,
      footer: "Changes apply immediately for this server.",
      actionRows: [...selectRows, controls, hubTabRow("modules")],
      separatorAboveActionRows: true,
    },
  );
}

export interface SettingsView {
  prefix: string;
  prefixIsDefault: boolean;
}

export function buildSettingsView(settings: SettingsView): CardReply {
  const prefixValue = `\`${settings.prefix}\`${settings.prefixIsDefault ? " *(default)*" : ""}`;

  const sections = [
    settingRow(
      [
        `💻 **Prefix** - ${prefixValue}`,
        "-# Prefix commands work for a curated set of moderation and utility commands.",
      ],
      {
        customId: HubId.prefixSet,
        label: "Edit",
        emoji: "✏️",
      },
    ),
  ];

  const maintenanceButtons = row(
    new ButtonBuilder()
      .setCustomId(HubId.prefixReset)
      .setLabel("Reset")
      .setEmoji(componentEmoji("🗑️"))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(settings.prefixIsDefault),
    new ButtonBuilder()
      .setCustomId(HubId.updateAll)
      .setLabel("Update Addons")
      .setEmoji(componentEmoji("🔄"))
      .setStyle(ButtonStyle.Secondary),
  );

  return makeCard(
    resolveCardColor("primary"),
    "🏰 Server Settings",
    "",
    {
      breadcrumbs: ["Hub", "Settings"],
      sections,
      actionRows: [maintenanceButtons, hubTabRow("settings")],
      separatorAboveActionRows: true,
    },
  );
}

export interface PermitAssignmentRow {
  permitId: number;
  permitName: string;
  kind: "custom" | "enforced";
  builtin: boolean;
  targetType: "user" | "role" | "channel";
  targetId: string;
}

function assignmentMention(row: PermitAssignmentRow): string {
  if (row.targetType === "role") return roleMention(row.targetId);
  if (row.targetType === "channel") return channelMention(row.targetId);
  return userMention(row.targetId);
}

function backToPermissionsRow(): Row {
  return row(createBackButton(HubId.tab("permissions"), "Back"));
}

export function buildPermissionsView(assignments: PermitAssignmentRow[], page = 0): CardReply {
  const totalPages = Math.max(1, Math.ceil(assignments.length / PermissionsPerPage));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const shown = assignments.slice(
    safePage * PermissionsPerPage,
    (safePage + 1) * PermissionsPerPage,
  );

  const sections = shown.map((assignment) =>
    settingRow(
      [
        `${assignment.kind === "enforced" ? "🛡️" : "✅"} ${assignment.permitName}${assignment.builtin ? " 🔒" : ""}`,
        `-# ${assignment.kind} · ${assignment.targetType} ${assignmentMention(assignment)}`,
      ],
      {
        customId: HubId.permitDelete(
          assignment.permitId,
          assignment.targetType,
          assignment.targetId,
        ),
        label: "Revoke",
        style: ButtonStyle.Danger,
      },
    ),
  );

  const addRow = row(
    new ButtonBuilder()
      .setCustomId(HubId.permitGrant("custom"))
      .setLabel("Assign Custom…")
      .setEmoji(componentEmoji("✅"))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(HubId.permitGrant("enforced"))
      .setLabel("Assign Enforced…")
      .setEmoji(componentEmoji("🛡️"))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(HubId.permitOrder(0))
      .setLabel("Order…")
      .setEmoji(componentEmoji("↕️"))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(HubId.explain)
      .setLabel("Explain…")
      .setEmoji(componentEmoji("🔍"))
      .setStyle(ButtonStyle.Secondary),
  );

  const rows: Row[] = [addRow];
  if (totalPages > 1) {
    rows.push(
      createPaginationRow({
        customIdPrefix: HubId.permissionsPage,
        currentPage: safePage,
        totalPages,
      }),
    );
  }
  rows.push(hubTabRow("permissions"));

  return noPingCard(
    makeCard(
      resolveCardColor("primary"),
      "🛡️ Permits",
      shown.length
        ? "-# ✅ custom · 🛡️ enforced. Enforced permits survive anti-nuke quarantine."
        : "*No permits are assigned yet - every command uses its default access.*",
      {
        breadcrumbs: ["Hub", "Permissions"],
        sections,
        footer:
          totalPages > 1
            ? formatPageFooter(safePage, totalPages, `${assignments.length} assignment(s)`)
            : `${assignments.length} assignment(s)`,
        actionRows: rows,
        separatorAboveActionRows: true,
      },
    ),
  );
}

export interface PermitOrderRow {
  id: number;
  name: string;
  kind: "custom" | "enforced";
  builtin: boolean;
}

export function buildPermitOrderView(permits: PermitOrderRow[], page = 0): CardReply {
  const totalPages = Math.max(1, Math.ceil(permits.length / PermitOrderPerPage));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const shown = permits.slice(
    safePage * PermitOrderPerPage,
    (safePage + 1) * PermitOrderPerPage,
  );

  const shownLines = permits.slice(0, 50);
  const lines = shownLines.map(
    (permit, index) =>
      `${index + 1}. ${permit.kind === "enforced" ? "🛡️" : "✅"} ${permit.name}${permit.builtin ? " 🔒" : ""}`,
  );
  if (permits.length > shownLines.length) {
    lines.push(`-# …and ${permits.length - shownLines.length} more.`);
  }

  const rows: Row[] = shown.map((permit, index) => {
    const absolute = safePage * PermitOrderPerPage + index;
    return row(
      new ButtonBuilder()
        .setCustomId(HubId.permitMove(permit.id, "up"))
        .setLabel("↑")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(absolute === 0),
      new ButtonBuilder()
        .setCustomId(HubId.permitMove(permit.id, "down"))
        .setLabel("↓")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(absolute === permits.length - 1),
    );
  });

  if (totalPages > 1) {
    rows.push(
      createPaginationRow({
        customIdPrefix: HubId.permitOrderPage,
        currentPage: safePage,
        totalPages,
      }),
    );
  }
  rows.push(hubTabRow("permissions"));

  return noPingCard(
    makeCard(
      resolveCardColor("primary"),
      "🛡️ Permit Order",
      lines.length ? lines.join("\n") : "*No permits yet.*",
      {
        breadcrumbs: ["Hub", "Permissions", "Order"],
        actionRows: rows,
        separatorAboveActionRows: true,
      },
    ),
  );
}

export interface PermitPickerRow {
  id: number;
  name: string;
  builtin: boolean;
}

export function buildPermitPickerView(kind: "custom" | "enforced", permits: PermitPickerRow[]): CardReply {
  const kindLabel = kind === "custom" ? "Custom" : "Enforced";

  if (permits.length === 0) {
    return makeCard(
      resolveCardColor("primary"),
      "🛡️ Pick a Permit",
      "No permits of this kind exist yet. Create one from the dashboard or with `/permit create`.",
      {
        breadcrumbs: ["Hub", "Permissions", `Pick ${kindLabel} Permit`],
        actionRows: [backToPermissionsRow()],
      },
    );
  }

  const select = createStringSelectMenu({
    customId: HubId.permitPick(kind),
    placeholder: "Pick a permit…",
    options: permits.slice(0, 25).map((permit) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(permit.builtin ? `${permit.name} (built-in)` : permit.name)
        .setValue(String(permit.id)),
    ),
  });

  return makeCard(
    resolveCardColor("primary"),
    "🛡️ Pick a Permit",
    permits.length > 25
      ? `Pick which permit to assign.\n-# Showing the first 25 of ${permits.length}; use \`/permit assign\` for the rest.`
      : "Pick which permit to assign.",
    {
      breadcrumbs: ["Hub", "Permissions", `Pick ${kindLabel} Permit`],
      actionRows: [row(select), backToPermissionsRow()],
    },
  );
}

export function buildPermitAssignTargetView(
  permitId: number,
  permitName: string,
  kind: "custom" | "enforced",
): CardReply {
  const select =
    kind === "enforced"
      ? createUserSelectMenu({
          customId: HubId.permitAssign(permitId),
          placeholder: "Pick a member…",
        })
      : createRoleSelectMenu({
          customId: HubId.permitAssign(permitId),
          placeholder: "Pick a role…",
        });

  return makeCard(
    resolveCardColor("primary"),
    `🛡️ ${permitName}`,
    kind === "enforced"
      ? "Pick the member to assign this permit to."
      : "Pick the role to assign this permit to.",
    {
      breadcrumbs: ["Hub", "Permissions", permitName, "Pick Target"],
      actionRows: [row(select), backToPermissionsRow()],
    },
  );
}

export interface ExplainState {
  userId?: string | undefined;
  nodeNames: readonly string[];
  page?: number | undefined;
}

function nodesDescription(names: readonly string[]): string {
  if (names.length === 0) {
    return "-# No permit nodes are configured yet. Create a permit first.";
  }
  return "-# Pick a permit node to see every tier that decides it.";
}

export function buildPermitExplainPickerView(state: ExplainState): CardReply {
  const names = [...new Set(state.nodeNames)].sort((a, b) => a.localeCompare(b));
  const totalPages = Math.max(1, Math.ceil(names.length / ExplainNodesPerPage));
  const safePage = Math.max(0, Math.min(state.page ?? 0, totalPages - 1));
  const shown = names.slice(
    safePage * ExplainNodesPerPage,
    (safePage + 1) * ExplainNodesPerPage,
  );

  const rows: Row[] = [
    row(
      createUserSelectMenu({
        customId: HubId.explainUser,
        placeholder: "Pick a member…",
      }),
    ),
  ];

  if (state.userId && shown.length > 0) {
    rows.push(
      row(
        createStringSelectMenu({
          customId: HubId.explainNode(state.userId),
          placeholder: "Pick a permit node…",
          options: shown.map((name) =>
            new StringSelectMenuOptionBuilder().setLabel(name).setValue(name),
          ),
        }),
      ),
    );
    if (totalPages > 1) {
      rows.push(
        createPaginationRow({
          customIdPrefix: HubId.explainPage(state.userId),
          currentPage: safePage,
          totalPages,
        }),
      );
    }
  }

  rows.push(backToPermissionsRow());

  return noPingCard(
    makeCard(
      resolveCardColor("primary"),
      "🔍 Explain Access",
      state.userId
        ? nodesDescription(state.nodeNames)
        : "-# Pick a member first, then a permit node.",
      {
        breadcrumbs: ["Hub", "Permissions", "Explain"],
        actionRows: rows,
        separatorAboveActionRows: true,
      },
    ),
  );
}

export interface ExplainRow {
  tier: string;
  verdict: "allow" | "deny" | "pass";
  detail?: string | undefined;
}

export function buildPermitExplainView(
  node: string,
  subjectLabel: string,
  allowed: boolean,
  rows: ExplainRow[],
): CardReply {
  const mark = (verdict: ExplainRow["verdict"]): string =>
    verdict === "allow" ? "✅" : verdict === "deny" ? "⛔" : "➖";
  const lines = rows.map(
    (entry) =>
      `-# ${mark(entry.verdict)} \`${entry.tier}\` → ${entry.verdict}${entry.detail ? ` (${entry.detail})` : ""}`,
  );

  return noPingCard(
    makeCard(
      resolveCardColor("primary"),
      `🛡️ Why ${subjectLabel} ${allowed ? "can" : "can't"} use \`${node}\``,
      lines.length > 0 ? lines.join("\n") : "-# No tiers evaluated.",
      {
        breadcrumbs: ["Hub", "Permissions", "Explain"],
        actionRows: [backToPermissionsRow()],
      },
    ),
  );
}

export interface AddonStats {
  repoCount: number;
  installedCount: number;
  pendingUpdates: readonly string[];
}

export function buildAddonsView(stats: AddonStats): CardReply {
  const body = [
    "Add-ons let you expand Lumi with community modules. Every installed add-on works seamlessly alongside built-in features.",
    [
      `📦 **Tracked Repositories:** ${stats.repoCount}`,
      `📥 **Installed Add-ons:** ${stats.installedCount}`,
    ].join("\n"),
  ];

  if (stats.pendingUpdates.length > 0) {
    body.push(`⚠️ **Updates available:** ${stats.pendingUpdates.map((name) => `\`${name}\``).join(", ")}`);
  }

  const navButtons = row(
    new ButtonBuilder()
      .setCustomId(HubId.addonsView("repos"))
      .setLabel("Configure Repos")
      .setEmoji(componentEmoji("📦"))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(HubId.addonsView("installed"))
      .setLabel("Configure Addons")
      .setEmoji(componentEmoji("📥"))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(HubId.updateAll)
      .setLabel("Update All")
      .setEmoji(componentEmoji("⏱️"))
      .setStyle(ButtonStyle.Secondary),
  );

  return makeCard(resolveCardColor("primary"), "📦 Add-ons & Updates", body, {
    breadcrumbs: ["Hub", "Addons"],
    footer: "Bot Owner access is required to run updates.",
    actionRows: [navButtons, hubTabRow("addons")],
    separatorAboveActionRows: true,
  });
}

export interface AddonRepoRow {
  name: string;
  url: string;
  branch: string;
  commit: string;
  installedCount: number;
}

export function buildAddonReposView(repos: AddonRepoRow[]): CardReply {
  const sorted = [...repos].sort((a, b) => a.name.localeCompare(b.name));
  const shown = sorted.slice(0, 3);

  const sections = shown.map((repo) =>
    settingRow(
      [
        `📦 **${repo.name}** (\`${repo.branch}\`) @ \`${repo.commit.slice(0, 7)}\``,
        `-# ${repo.url}`,
        `-# Installed Add-ons: **${repo.installedCount}**`,
      ],
      {
        customId: HubId.addonUpdateRepo(repo.name),
        label: "Update",
        emoji: "🔄",
        style: ButtonStyle.Primary,
      },
    ),
  );

  const rows: Row[] = [
    row(
      new ButtonBuilder()
        .setCustomId(HubId.addonAddRepo)
        .setLabel("Add Repository")
        .setEmoji(componentEmoji("📦"))
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(HubId.addonRemoveRepo)
        .setLabel("Remove Repository")
        .setEmoji(componentEmoji("🗑️"))
        .setStyle(ButtonStyle.Danger),
    ),
    backToAddonsRow(),
  ];

  return makeCard(
    resolveCardColor("primary"),
    "📦 Configure Repositories",
    sorted.length
      ? sorted.length > shown.length
        ? `-# +${sorted.length - shown.length} more repositories. Use \`/addons\` for the full list.`
        : ""
      : "No repositories added yet. Add one to start browsing add-ons.",
    {
      breadcrumbs: ["Hub", "Addons", "Configure Repositories"],
      sections,
      footer: "Updating a repository reloads every installed module that came from it.",
      actionRows: rows,
      separatorAboveActionRows: true,
    },
  );
}

export interface AddonInstalledRow {
  moduleName: string;
  version: string;
  commit: string;
  repoName?: string | undefined;
}

export function buildAddonInstalledView(installed: AddonInstalledRow[], repos: readonly string[] = []): CardReply {
  const sorted = [...installed].sort((a, b) => a.moduleName.localeCompare(b.moduleName));
  const shown = sorted.slice(0, 3);

  const sections = shown.map((entry) =>
    settingRow(
      [
        `📥 **${entry.moduleName}** \`v${entry.version}\` · \`${entry.commit.slice(0, 7)}\``,
        `-# ${entry.repoName ? `From \`${entry.repoName}\`` : "Origin unknown"}`,
      ],
      {
        customId: HubId.addonUninstall(entry.moduleName),
        label: "Uninstall",
        style: ButtonStyle.Danger,
      },
    ),
  );

  const rows: Row[] = [];
  if (repos.length > 0) {
    rows.push(
      row(
        createStringSelectMenu({
          customId: "lumi:addon:browsepick",
          placeholder: "Browse a repository to install more…",
          options: repos.slice(0, 25).map((name) => ({ label: name, value: name })),
        }),
      ),
    );
  }
  rows.push(backToAddonsRow());

  return makeCard(
    resolveCardColor("primary"),
    "📥 Configure Addons",
    sorted.length
      ? sorted.length > shown.length
        ? `-# +${sorted.length - shown.length} more add-ons. Use \`/addons\` for the full list.`
        : ""
      : "No add-on modules are currently installed.",
    {
      breadcrumbs: ["Hub", "Addons", "Configure Addons"],
      sections,
      footer: "Uninstalling removes the add-on from disk and unloads it immediately.",
      actionRows: rows,
      separatorAboveActionRows: true,
    },
  );
}

export interface AddonAvailableRow {
  name: string;
  displayName: string;
  description: string;
  version: string;
  errors: readonly string[];
  installed: boolean;
}

export function buildAddonRepoModulesView(
  repoName: string,
  modules: AddonAvailableRow[],
  page = 0,
): CardReply {
  const sorted = [...modules].sort((a, b) => a.name.localeCompare(b.name));
  const totalPages = Math.max(1, Math.ceil(sorted.length / 3));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const shown = sorted.slice(safePage * 3, (safePage + 1) * 3);

  const sections = shown.map((entry) =>
    settingRow(
      [
        `📦 **${entry.displayName}** \`v${entry.version}\` · ${entry.installed ? "✅ installed" : "available"}`,
        `-# ${entry.description.slice(0, 120) || "No description."}`,
        ...(entry.errors.length > 0 ? [`-# ⚠️ ${entry.errors.length} validation error(s)`] : []),
      ],
      {
        customId: entry.installed
          ? HubId.addonUninstall(entry.name)
          : HubId.addonInstall(repoName, entry.name),
        label: entry.installed ? "Uninstall" : "Install",
        style: entry.installed ? ButtonStyle.Danger : ButtonStyle.Success,
        disabled: entry.errors.length > 0,
      },
    ),
  );

  const rows: Row[] = [];
  const infoButtons = shown.slice(0, 5).map((entry) =>
    new ButtonBuilder()
      .setCustomId(HubId.addonInfo(repoName, entry.name))
      .setLabel(`ℹ️ ${entry.name}`.slice(0, 80))
      .setStyle(ButtonStyle.Secondary),
  );
  if (infoButtons.length > 0) rows.push(row(...infoButtons));

  const navigation = [
    new ButtonBuilder()
      .setCustomId(HubId.addonsView("installed"))
      .setLabel("← Configure Addons")
      .setStyle(ButtonStyle.Secondary),
  ];
  if (totalPages > 1) {
    navigation.push(
      new ButtonBuilder()
        .setCustomId(`${HubId.addonBrowsePage(repoName)}:prev:${Math.max(0, safePage - 1)}`)
        .setLabel("Prev")
        .setEmoji(componentEmoji("⬅️"))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage === 0),
      new ButtonBuilder()
        .setCustomId(`${HubId.addonBrowsePage(repoName)}:indicator`)
        .setLabel(`${safePage + 1} / ${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`${HubId.addonBrowsePage(repoName)}:next:${Math.min(totalPages - 1, safePage + 1)}`)
        .setLabel("Next")
        .setEmoji(componentEmoji("➡️"))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= totalPages - 1),
    );
  }
  rows.push(row(...navigation));

  return makeCard(
    resolveCardColor("primary"),
    `⚙️ Available Modules in ${repoName}`,
    sorted.length === 0 ? "No modules were found in this repository." : "",
    {
      breadcrumbs: ["Hub", "Addons", "Configure Addons", repoName],
      sections,
      footer: "Install or uninstall any module with one click.",
      actionRows: rows,
      separatorAboveActionRows: true,
    },
  );
}

function backToAddonsRow(): Row {
  return row(createBackButton(HubId.tab("addons"), "Back to Add-ons"));
}

export function flattenAssignments(permits: readonly PermitWithAssignments[]): PermitAssignmentRow[] {
  return permits.flatMap((permit) =>
    permit.assignments.map((assignment) => ({
      permitId: permit.id,
      permitName: permit.name,
      kind: permit.kind,
      builtin: permit.builtin,
      targetType: assignment.targetType,
      targetId: assignment.targetId,
    })),
  );
}

