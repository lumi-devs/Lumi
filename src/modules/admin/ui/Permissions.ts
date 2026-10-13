import type { LumiT } from "#src/lib/i18n/Index.js";
import { row, type Row, formatPageFooter } from "#src/modules/onboarding/ui/Common.js";
import { hubTabRow } from "#src/modules/onboarding/ui/Hub.js";
import { resolveCardColor } from "#src/lib/ui/Palette.js";
import { makeCard, noPingCard, type CardReply } from "#src/lib/ui/Cards.js";
import {
  componentEmoji,
  createBackButton,
  createPaginationRow,
  createRoleSelectMenu,
  createStringSelectMenu,
  createUserSelectMenu,
  settingRow,
} from "#src/lib/ui/Panels.js";
import {
  ButtonBuilder,
  StringSelectMenuOptionBuilder,
} from "@discordjs/builders";
import { roleMention, userMention } from "@discordjs/formatters";
import { ButtonStyle } from "discord.js";
import { HubPermitAssignId, HubPermitExplainNodeId, HubPermitPickId } from "#src/modules/core/Constants.js";
import type { PermitTierExplanation } from "#src/lib/api/permissions/PermitResolver.js";

const tierMark = (verdict: PermitTierExplanation["verdict"]): string =>
  verdict === "allow" ? "✅" : verdict === "deny" ? "⛔" : "➖";

export function buildPermitExplainView(
  node: string,
  subjectLabel: string,
  rows: PermitTierExplanation[],
  backCustomId = "lumi:permexplain",
): CardReply {
  const lines = rows.map(
    (row) =>
      `-# ${tierMark(row.verdict)} \`${row.tier}\` → ${row.verdict}${row.detail ? ` (${row.detail})` : ""}`,
  );
  return noPingCard(
    makeCard(
      resolveCardColor("primary"),
      `🛡️ Why ${subjectLabel} ${rows.some((row) => row.verdict === "deny") ? "can't" : "can"} use \`${node}\``,
      lines.length > 0 ? lines.join("\n") : "-# No tiers evaluated.",
      {
        breadcrumbs: ["Hub", "Permissions", "Explain"],
        actionRows: [row(createBackButton(backCustomId))],
      },
    ),
  );
}

export const PermitExplainNodesPerPage = 25;

export interface PermitExplainPickerState {
  userId?: string | undefined;
  nodeNames: readonly string[];
  nodePage?: number | undefined;
}

function uniqueSortedNodes(names: readonly string[]): string[] {
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

function explainUserRow(t?: LumiT): Row {
  return row(
    createUserSelectMenu({
      customId: "lumi:permexplainuser",
      placeholder: t ? t("panels:permsExplainPickUser") : "Pick a member…",
    }),
  );
}

function explainNodeRow(userId: string, names: readonly string[], t?: LumiT): Row {
  return row(
    createStringSelectMenu({
      customId: HubPermitExplainNodeId.build({ userId }),
      placeholder: t ? t("panels:permsExplainPickNode") : "Pick a permit…",
      options: names.map(
        (name) =>
          new StringSelectMenuOptionBuilder().setLabel(name).setValue(name),
      ),
    }),
  );
}

function explainNodePageRow(userId: string, page: number, pages: number): Row | null {
  if (pages < 2) return null;
  return createPaginationRow({
    customIdPrefix: `lumi:permexplainnodepage:${userId}`,
    currentPage: page,
    totalPages: pages,
  });
}

export function buildPermitExplainPickerView(
  state: PermitExplainPickerState,
  t?: LumiT,
): CardReply {
  const names = uniqueSortedNodes(state.nodeNames);
  const totalPages = Math.max(1, Math.ceil(names.length / PermitExplainNodesPerPage));
  const safePage = Math.max(0, Math.min(state.nodePage ?? 0, totalPages - 1));
  const shown = names.slice(
    safePage * PermitExplainNodesPerPage,
    (safePage + 1) * PermitExplainNodesPerPage,
  );

  const rows: Row[] = [explainUserRow(t)];
  if (state.userId) {
    rows.push(explainNodeRow(state.userId, shown, t));
    const pageRow = explainNodePageRow(state.userId, safePage, totalPages);
    if (pageRow) rows.push(pageRow);
  }
  rows.push(backToPermissionsRow(t));

  return noPingCard(
    makeCard(
      resolveCardColor("primary"),
      `🔍 ${t ? t("panels:permsExplainTitle") : "Explain Access"}`,
      state.userId
        ? `Subject: <@${state.userId}>\n-# Pick a permit to see every tier that decides it.`
        : "-# Pick a member first, then a permit.",
      { breadcrumbs: ["Hub", "Permissions", "Explain"], actionRows: rows, separatorAboveActionRows: true },
    ),
  );
}

export const PermsPerPage = 4;
export const PermitOrderPerPage = 3;

export interface PermitOrderRow {
  id: number;
  name: string;
  kind: PermitKind;
  builtin: boolean;
}

export type PermitKind = "custom" | "enforced";
type PermitTargetType = "role" | "user";

export interface PermitAssignmentRow {
  permitId: number;
  permitName: string;
  kind: PermitKind;
  builtin: boolean;
  targetType: PermitTargetType;
  targetId: string;
}

const assignmentMention = (row: PermitAssignmentRow): string =>
  row.targetType === "role" ? roleMention(row.targetId) : userMention(row.targetId);

const backToPermissionsRow = (t?: LumiT): Row =>
  row(
    new ButtonBuilder()
      .setCustomId("lumi:tab:permissions")
      .setLabel(t ? t("panels:backToHub") : "Back")
      .setEmoji(componentEmoji("⬅️"))
      .setStyle(ButtonStyle.Secondary),
  );

export function buildPermissionsView(
  assignments: PermitAssignmentRow[],
  page = 0,
  t?: LumiT,
): CardReply {
  const totalPages = Math.max(1, Math.ceil(assignments.length / PermsPerPage));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const shown = assignments.slice(
    safePage * PermsPerPage,
    (safePage + 1) * PermsPerPage,
  );

  const sections = shown.map((a) =>
    settingRow(
      [
        `${a.kind === "enforced" ? "🛡️" : "✅"} ${a.permitName}${a.builtin ? " 🔒" : ""}`,
        `-# ${a.kind} · ${a.targetType} ${assignmentMention(a)}`,
      ],
      {
        customId: `lumi:permdel:${a.permitId}|${a.targetType}|${a.targetId}`,
        label: t ? t("panels:permsRevoke") : "Revoke",
        style: ButtonStyle.Danger,
      },
    ),
  );

  const addRow = row(
    new ButtonBuilder()
      .setCustomId("lumi:permit:grant:custom")
      .setLabel(t ? t("panels:permsGrantCustom") : "Assign Custom…")
      .setEmoji(componentEmoji("✅"))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("lumi:permit:grant:enforced")
      .setLabel(t ? t("panels:permsGrantEnforced") : "Assign Enforced…")
      .setEmoji(componentEmoji("🛡️"))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("lumi:permorder:0")
      .setLabel(t ? t("panels:permsOrder") : "Order…")
      .setEmoji(componentEmoji("↕️"))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("lumi:permexplain")
      .setLabel(t ? t("panels:permsExplain") : "Explain…")
      .setEmoji(componentEmoji("🔍"))
      .setStyle(ButtonStyle.Secondary),
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
        ? t("panels:permsPageFooter", {
            page: safePage + 1,
            total: totalPages,
            count: assignments.length,
          })
        : formatPageFooter(safePage, totalPages, `${assignments.length} assignment(s)`)
      : t
        ? t("panels:permsCountFooter", { count: assignments.length })
        : `${assignments.length} assignment(s)`;

  return noPingCard(
    makeCard(
      resolveCardColor("primary"),
      `🛡️ ${t ? t("panels:permsTitle") : "Permits"}`,
      shown.length
        ? `-# ✅ ${t ? t("panels:permsLegend") : "custom · enforced. Enforced permits survive anti-nuke quarantine."}`
        : t
          ? t("panels:permsEmpty")
          : "*No permits are assigned yet - every command uses its default access.*",
      { breadcrumbs: ["Hub", "Permissions"], sections, footer, actionRows: rows, separatorAboveActionRows: true },
    ),
  );
}

export function buildPermitOrderView(
  permits: PermitOrderRow[],
  page = 0,
  t?: LumiT,
): CardReply {
  const totalPages = Math.max(1, Math.ceil(permits.length / PermitOrderPerPage));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const shown = permits.slice(
    safePage * PermitOrderPerPage,
    (safePage + 1) * PermitOrderPerPage,
  );

  const lines = permits.map(
    (p, i) => `${i + 1}. ${p.kind === "enforced" ? "🛡️" : "✅"} ${p.name}${p.builtin ? " 🔒" : ""}`,
  );

  const rows: Row[] = shown.map((p, i) => {
    const first = safePage * PermitOrderPerPage + i === 0;
    const last = safePage * PermitOrderPerPage + i === permits.length - 1;
    return row(
      new ButtonBuilder()
        .setCustomId(`lumi:permmove:${p.id}|up`)
        .setLabel("↑")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(first),
      new ButtonBuilder()
        .setCustomId(`lumi:permmove:${p.id}|down`)
        .setLabel("↓")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(last),
    );
  });
  if (totalPages > 1) {
    rows.push(
      createPaginationRow({
        customIdPrefix: "lumi:permorderpage",
        currentPage: safePage,
        totalPages,
      }),
    );
  }
  rows.push(hubTabRow("permissions", t));

  return noPingCard(
    makeCard(
      resolveCardColor("primary"),
      `🛡️ ${t ? t("panels:permsOrderTitle") : "Permit Order"}`,
      lines.length ? lines.join("\n") : (t ? t("panels:permsEmpty") : "*No permits yet.*"),
      { breadcrumbs: ["Hub", "Permissions", "Order"], actionRows: rows, separatorAboveActionRows: true },
    ),
  );
}

export function buildPermitPickerView(
  kind: PermitKind,
  permits: { id: number; name: string; builtin: boolean }[],
  t?: LumiT,
): CardReply {
  const kindLabel = kind === "custom" ? "Custom" : "Enforced";

  if (permits.length === 0) {
    return makeCard(
      resolveCardColor("primary"),
      `🛡️ ${t ? t("panels:permsPickPermit") : "Pick a Permit"}`,
      t
        ? t("panels:permsNoPermits")
        : "No permits of this kind exist yet. Create one from the dashboard.",
      { breadcrumbs: ["Hub", "Permissions", `Pick ${kindLabel} Permit`], actionRows: [backToPermissionsRow(t)] },
    );
  }

  const select = createStringSelectMenu({
    customId: HubPermitPickId.build({ kind }),
    placeholder: t ? t("panels:permsPickPermit") : "Pick a permit…",
    options: permits.slice(0, 25).map((p) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(p.builtin ? `${p.name} (built-in)` : p.name)
        .setValue(String(p.id)),
    ),
  });

  return makeCard(
    resolveCardColor("primary"),
    `🛡️ ${t ? t("panels:permsPickPermit") : "Pick a Permit"}`,
    t
      ? t("panels:permsPickPermit")
      : "Pick which permit to assign.",
    { breadcrumbs: ["Hub", "Permissions", `Pick ${kindLabel} Permit`], actionRows: [row(select), backToPermissionsRow(t)] },
  );
}

export function buildPermitAssignTargetView(
  permitId: number,
  permitName: string,
  kind: PermitKind,
  t?: LumiT,
): CardReply {
  const select =
    kind === "enforced"
      ? createUserSelectMenu({
          customId: HubPermitAssignId.build({ permitId: String(permitId) }),
          placeholder: t ? t("panels:permsPickTarget") : "Pick a member…",
        })
      : createRoleSelectMenu({
          customId: HubPermitAssignId.build({ permitId: String(permitId) }),
          placeholder: t ? t("panels:permsPickTarget") : "Pick a role…",
        });

  return makeCard(
    resolveCardColor("primary"),
    `🛡️ ${permitName}`,
    t
      ? t("panels:permsPickTarget")
      : kind === "enforced"
        ? "Pick the member to assign this permit to."
        : "Pick the role to assign this permit to.",
    { breadcrumbs: ["Hub", "Permissions", permitName, "Pick Target"], actionRows: [row(select), backToPermissionsRow(t)] },
  );
}
