import {
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
} from "@discordjs/builders";
import { container } from "@sapphire/framework";
import { ButtonStyle, MessageFlags, type VoiceBasedChannel } from "discord.js";
import { channelMention, userMention } from "@discordjs/formatters";
import {
  ModuleName,
  PanelMessageDefault,
  PanelTitleDefault,
  Tvc,
} from "../keys.js";
import { parseHexColor } from "#lib/message-content.js";
import { renderMessageBlocksV2Container } from "#lib/utilities/message-blocks-v2.js";
import { clampMessageDocumentV2, type MessageDocumentV2 } from "@lumi/contracts";
import type { VcRecord } from "../data.js";
import type { LumiT } from "#lib/i18n/index.js";
import {
  makeCard,
  makeInfoCard,
  makeErrorCard,
  resolveCardColor,
  formatStatusBadge,
  type CardReply,
} from "#utilities/cards.js";
import {
  createUserSelectMenu,
  createRoleSelectMenu,
  createStringSelectMenu,
  createBackButton,
  createActionButton,
  buildSafeActionRows,
} from "#utilities/panels.js";

export type PanelMessage = CardReply;

/**
 * Builds the SaaS owner control panel for a temporary voice channel. The
 * heading, body and accent come from the module's `panel_*` config so a server
 * can reword the card; the controls below it are always the same, since their
 * custom IDs are what the interaction handlers dispatch on.
 */
export async function buildPanel(
  channel: VoiceBasedChannel,
  record: VcRecord,
  t?: LumiT,
): Promise<PanelMessage> {
  const limitStr =
    channel.userLimit && channel.userLimit > 0
      ? String(channel.userLimit)
      : t
        ? t("tempvc:unlimited")
        : "Unlimited";

  const configured = await readPanelConfig(channel.guildId);
  const title =
    configured.title ?? (t ? t("tempvc:panelHeader") : PanelTitleDefault);

  const lockBadge = formatStatusBadge(
    record.locked ? "disabled" : "enabled",
    record.locked
      ? t
        ? t("tempvc:statusLocked")
        : "LOCKED"
      : t
        ? t("tempvc:statusUnlocked")
        : "UNLOCKED",
  );
  const hideBadge = formatStatusBadge(
    record.hidden ? "disabled" : "enabled",
    record.hidden
      ? t
        ? t("tempvc:statusHidden")
        : "HIDDEN"
      : t
        ? t("tempvc:statusVisible")
        : "VISIBLE",
  );

  const body = renderPanelTemplate(configured.message ?? PanelMessageDefault, {
    channel: channelMention(channel.id),
    owner: userMention(record.ownerId),
    limit: limitStr,
    status: `${lockBadge} · ${hideBadge}`,
  });

  const menu = createStringSelectMenu({
    customId: `${Tvc}:panelmenu:${channel.id}`,
    placeholder: t ? t("tempvc:panelSelectPlaceholder") : "Manage Channel…",
    options: [
      {
        label: t ? t("tempvc:panelOptRename") : "Rename Channel",
        value: "name",
        emoji: "👤",
      },
      {
        label: t ? t("tempvc:panelOptLimit") : "Set User Limit",
        value: "limit",
        emoji: "👥",
      },
      {
        label: record.locked
          ? t
            ? t("tempvc:panelOptUnlock")
            : "Unlock Channel"
          : t
            ? t("tempvc:panelOptLock")
            : "Lock Channel",
        value: "lock",
        emoji: record.locked ? "🔓" : "🔒",
      },
      {
        label: record.hidden
          ? t
            ? t("tempvc:panelOptUnhide")
            : "Unhide Channel"
          : t
            ? t("tempvc:panelOptHide")
            : "Hide Channel",
        value: "hide",
        emoji: record.hidden ? "👀" : "🕵️",
      },
      {
        label: t ? t("tempvc:panelOptKick") : "Kick Members",
        value: "kick",
        emoji: "👢",
      },
      {
        label: t ? t("tempvc:panelOptTrust") : "Trust Member / Role",
        value: "trust",
        emoji: "✅",
      },
      {
        label: t ? t("tempvc:panelOptUntrust") : "Untrust Member / Role",
        value: "untrust",
        emoji: "❎",
      },
      {
        label: t ? t("tempvc:panelOptBlock") : "Block Member / Role",
        value: "block",
        emoji: "🚫",
      },
      {
        label: t ? t("tempvc:panelOptUnblock") : "Unblock Member / Role",
        value: "unblock",
        emoji: "♻️",
      },
      {
        label: t ? t("tempvc:panelOptTransfer") : "Transfer Ownership",
        value: "transfer",
        emoji: "🔄",
      },
      {
        label: t ? t("tempvc:panelOptDelete") : "Delete Channel",
        value: "delete",
        emoji: "🗑️",
      },
    ],
  });

  const claimBtn = createActionButton({
    customId: `${Tvc}:claim:${channel.id}`,
    label: t ? t("tempvc:panelClaimButton") : "🎯 Claim Ownership",
    style: ButtonStyle.Primary,
  });

  const rows = buildSafeActionRows([
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
    new ActionRowBuilder<ButtonBuilder>().addComponents(claimBtn),
  ]);

  const footer = t
    ? t("tempvc:panelFooter")
    : "Settings are restricted to the owner. Anyone can claim if the owner leaves.";

  if (configured.richContent.blocks.length > 0) {
    const container = renderMessageBlocksV2Container(configured.richContent, {
      channel: channelMention(channel.id),
      owner: userMention(record.ownerId),
      limit: limitStr,
      status: `${lockBadge} · ${hideBadge}`,
    });
    container.addActionRowComponents(...rows);
    return {
      flags: MessageFlags.IsComponentsV2,
      components: [container],
      allowedMentions: { parse: [] },
    };
  }

  return makeCard(
    parseHexColor(configured.color) ?? resolveCardColor("primary"),
    title,
    body,
    { footer, actionRows: rows },
  );
}

interface PanelConfig {
  title: string | null;
  message: string | null;
  color: string | null;
  richContent: MessageDocumentV2;
}

async function readPanelConfig(guildId: string): Promise<PanelConfig> {
  const [title, message, color, richContent] = await Promise.all([
    readString(guildId, "panel_title"),
    readString(guildId, "panel_message"),
    readString(guildId, "panel_color"),
    container.db.config.getModuleConfig(guildId, ModuleName, "panel_rich_content"),
  ]);
  return { title, message, color, richContent: clampMessageDocumentV2(richContent) };
}

async function readString(guildId: string, key: string): Promise<string | null> {
  const stored = await container.db.config.getModuleConfig(
    guildId,
    ModuleName,
    key,
  );
  return typeof stored === "string" && stored.trim().length > 0 ? stored : null;
}

/** Placeholder substitution for the panel body. Unknown tokens stay verbatim,
 * matching how the welcome and sticky templates behave. */
function renderPanelTemplate(
  template: string,
  vars: Record<string, string>,
): string[] {
  return template
    .replace(/\{([A-Za-z]+)\}/g, (match, name: string) => vars[name] ?? match)
    .split("\n");
}

const backToPanelRow = (channelId: string, t?: LumiT) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    createBackButton(
      `${Tvc}:panel:${channelId}`,
      t ? t("tempvc:backToPanel") : "← Back to Panel",
    ),
  );

/** Standalone "back to panel" row, for cards that carry no other controls. */
export function buildBackRows(channelId: string) {
  return buildSafeActionRows([backToPanelRow(channelId)]);
}

interface AccessViewSpec {
  key: "trust" | "untrust" | "block" | "unblock";
  fallbackTitle: string;
  fallbackMessage: string;
  fallbackUserPlaceholder: string;
  fallbackRolePlaceholder: string;
}

const AccessViews: Record<AccessViewSpec["key"], AccessViewSpec> = {
  trust: {
    key: "trust",
    fallbackTitle: "✅ Trust User or Role",
    fallbackMessage:
      "Select users or roles to grant access (connect, view, speak) to this channel:",
    fallbackUserPlaceholder: "Select user(s) to trust…",
    fallbackRolePlaceholder: "Select role(s) to trust…",
  },
  untrust: {
    key: "untrust",
    fallbackTitle: "❎ Untrust User or Role",
    fallbackMessage:
      "Select users or roles to remove custom permissions from this channel:",
    fallbackUserPlaceholder: "Select user(s) to untrust…",
    fallbackRolePlaceholder: "Select role(s) to untrust…",
  },
  block: {
    key: "block",
    fallbackTitle: "🚫 Block User or Role",
    fallbackMessage:
      "Select users or roles to block from joining this voice channel:",
    fallbackUserPlaceholder: "Select user(s) to block…",
    fallbackRolePlaceholder: "Select role(s) to block…",
  },
  unblock: {
    key: "unblock",
    fallbackTitle: "♻️ Unblock User or Role",
    fallbackMessage:
      "Select users or roles to remove block restrictions from this channel:",
    fallbackUserPlaceholder: "Select user(s) to unblock…",
    fallbackRolePlaceholder: "Select role(s) to unblock…",
  },
};

function buildAccessView(
  channel: VoiceBasedChannel,
  spec: AccessViewSpec,
  t?: LumiT,
): PanelMessage {
  const userSelect = createUserSelectMenu({
    customId: `${Tvc}:select_${spec.key}:${channel.id}`,
    placeholder: t
      ? t(`tempvc:${spec.key}UserPlaceholder`)
      : spec.fallbackUserPlaceholder,
    minValues: 1,
    maxValues: 10,
  });

  const roleSelect = createRoleSelectMenu({
    customId: `${Tvc}:select_${spec.key}_role:${channel.id}`,
    placeholder: t
      ? t(`tempvc:${spec.key}RolePlaceholder`)
      : spec.fallbackRolePlaceholder,
    minValues: 1,
    maxValues: 10,
  });

  const rows = buildSafeActionRows([
    new ActionRowBuilder().addComponents(userSelect),
    new ActionRowBuilder().addComponents(roleSelect),
    backToPanelRow(channel.id, t),
  ]);

  return makeInfoCard(
    t ? t(`tempvc:${spec.key}Title`) : spec.fallbackTitle,
    t ? t(`tempvc:${spec.key}Message`) : spec.fallbackMessage,
    { actionRows: rows },
  );
}

export function buildKickView(
  channel: VoiceBasedChannel,
  _record: VcRecord,
  t?: LumiT,
): PanelMessage {
  const userSelect = createUserSelectMenu({
    customId: `${Tvc}:select_kick:${channel.id}`,
    placeholder: t
      ? t("tempvc:selectKickPlaceholder")
      : "Select member(s) to kick…",
    minValues: 1,
    maxValues: 10,
  });

  const rows = buildSafeActionRows([
    new ActionRowBuilder().addComponents(userSelect),
    backToPanelRow(channel.id, t),
  ]);

  return makeInfoCard(
    t ? t("tempvc:kickMembersTitle") : "👢 Kick Members",
    t
      ? t("tempvc:kickMembersMessage")
      : "Select members to disconnect from this voice channel:",
    { actionRows: rows },
  );
}

export function buildTrustView(
  channel: VoiceBasedChannel,
  _record: VcRecord,
  t?: LumiT,
): PanelMessage {
  return buildAccessView(channel, AccessViews.trust, t);
}

export function buildUntrustView(
  channel: VoiceBasedChannel,
  _record: VcRecord,
  t?: LumiT,
): PanelMessage {
  return buildAccessView(channel, AccessViews.untrust, t);
}

export function buildBlockView(
  channel: VoiceBasedChannel,
  _record: VcRecord,
  t?: LumiT,
): PanelMessage {
  return buildAccessView(channel, AccessViews.block, t);
}

export function buildUnblockView(
  channel: VoiceBasedChannel,
  _record: VcRecord,
  t?: LumiT,
): PanelMessage {
  return buildAccessView(channel, AccessViews.unblock, t);
}

export function buildTransferView(
  channel: VoiceBasedChannel,
  _record: VcRecord,
  t?: LumiT,
): PanelMessage {
  const userSelect = createUserSelectMenu({
    customId: `${Tvc}:select_transfer:${channel.id}`,
    placeholder: t
      ? t("tempvc:transferPlaceholder")
      : "Select new channel owner…",
    minValues: 1,
    maxValues: 1,
  });

  const rows = buildSafeActionRows([
    new ActionRowBuilder().addComponents(userSelect),
    backToPanelRow(channel.id, t),
  ]);

  return makeInfoCard(
    t ? t("tempvc:transferTitle") : "🔄 Transfer Ownership",
    t
      ? t("tempvc:transferMessage")
      : "Select a new owner for this voice channel:",
    { actionRows: rows },
  );
}

/** Builds the confirmation card for channel deletion. */
export function buildDeleteConfirmView(
  channel: VoiceBasedChannel,
  t?: LumiT,
): PanelMessage {
  const confirmBtn = createActionButton({
    customId: `${Tvc}:delyes:${channel.id}`,
    label: t ? t("tempvc:confirmDeleteButton") : "Confirm Delete",
    style: ButtonStyle.Danger,
  });

  const backBtn = createBackButton(
    `${Tvc}:panel:${channel.id}`,
    t ? t("tempvc:backToPanel") : "← Back to Panel",
  );

  const rows = buildSafeActionRows([
    new ActionRowBuilder<ButtonBuilder>().addComponents(confirmBtn, backBtn),
  ]);

  return makeErrorCard(
    t ? t("tempvc:deleteCardTitle") : "🗑️ Delete Channel?",
    t
      ? t("tempvc:deleteCardText")
      : "This permanently deletes the voice channel.",
    { actionRows: rows },
  );
}
