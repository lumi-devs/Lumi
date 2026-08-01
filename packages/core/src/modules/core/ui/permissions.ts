import type { LumiT } from "#lib/i18n/index.js";
import { PanelsKeys } from "#lib/i18n/keys.js";
import { row, type Row } from "#modules/core/ui/common.js";
import { hubTabRow } from "#modules/core/ui/hub.js";
import { Emojis } from "#utilities/assets.js";
import {
  CARD_ACCENTS,
  makeCard,
  noPingCard,
  type CardReply,
} from "#utilities/cards.js";
import {
  createMentionableSelectMenu,
  createPaginationRow,
  createStringSelectMenu,
  settingRow,
} from "#utilities/panels.js";
import {
  ButtonBuilder,
  StringSelectMenuOptionBuilder,
} from "@discordjs/builders";
import {
  channelMention,
  roleMention,
  userMention,
} from "@discordjs/formatters";
import { ButtonStyle } from "discord.js";

// Each row here is a Section with 2-3 text lines + 1 button = 4-5 real
// components once nested, and card chrome already eats ~10-19 of Discord's
// 40-component budget per message, so page sizes stay well under naive counts.
export const PERMS_PER_PAGE = 4;

export interface PermissionOverrideRow {
  /** The permit node granted, e.g. `mod.*` or `admin.config`. */
  commandPath: string;
  modelType: string;
  modelId: string;
  /** True for an un-quarantinable enforced permit; false for a custom permit. */
  enforced: boolean;
}

export type PermitKind = "custom" | "enforced";

const overrideMention = (o: PermissionOverrideRow): string => {
  if (o.modelType === "everyone") return "@everyone";
  if (o.modelType === "role") return roleMention(o.modelId);
  if (o.modelType === "user") return userMention(o.modelId);
  if (o.modelType === "category")
    return `category ${channelMention(o.modelId)}`;
  return channelMention(o.modelId);
};

const backToPermissionsRow = (t?: LumiT): Row =>
  row(
    new ButtonBuilder()
      .setCustomId("lumi:tab:permissions")
      .setLabel(t ? t(PanelsKeys.BackToHub) : "Back")
      .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
      .setStyle(ButtonStyle.Secondary),
  );

/**
 * The permissions tab: one revocable row per granted permit, paginated at
 * {@linkcode PERMS_PER_PAGE}.
 *
 * @param overrides - Every custom and enforced permit of the guild, unsorted.
 * @param page - Zero-based page index; out-of-range values are clamped.
 */
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
        : t
          ? t(PanelsKeys.PermsEmpty)
          : "*No permission overrides set - every command uses its default access.*",
      { sections, footer, actionRows: rows, separatorAboveActionRows: true },
    ),
  );
}

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
    t
      ? t(PanelsKeys.PermsPickTarget)
      : "Pick a role or member to grant a permit to.",
    {
      actionRows: [row(select), backToPermissionsRow(t)],
    },
  );
}

/**
 * Step 2 of granting a permit: pick which node to grant the chosen target.
 *
 * @param nodes - Every permit node registered by a loaded command; only the
 * first 25 fit into a select menu.
 */
export function buildPermitNodePickerView(
  kind: PermitKind,
  targetType: "role" | "user",
  targetId: string,
  nodes: string[],
  t?: LumiT,
): CardReply {
  const mention =
    targetType === "role" ? roleMention(targetId) : userMention(targetId);

  if (nodes.length === 0) {
    return makeCard(
      CARD_ACCENTS.PRIMARY,
      `${Emojis.SHIELD} ${t ? t(PanelsKeys.PermsPickNode) : "Pick a Permit Node"}`,
      t
        ? t(PanelsKeys.PermsNoNodes)
        : "No permit nodes are registered by any loaded command.",
      { actionRows: [backToPermissionsRow(t)] },
    );
  }

  const select = createStringSelectMenu({
    customId: `lumi:permit:node:${kind}:${targetType}:${targetId}`,
    placeholder: t ? t(PanelsKeys.PermsPickNode) : "Pick the permit node…",
    options: nodes
      .slice(0, 25)
      .map((node) =>
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
