import {
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
} from "@discordjs/builders";
import {
  ButtonStyle,
  type VoiceBasedChannel,
} from "discord.js";
import { channelMention, userMention } from "@discordjs/formatters";
import { TVC } from "../keys.js";
import type { VcRecord } from "../data.js";
import type { LumiT } from "#lib/i18n/index.js";
import {
  makeCard,
  makeInfoCard,
  makeErrorCard,
  CARD_ACCENTS,
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

/** Builds the SaaS owner control panel for a temporary voice channel. */
export function buildPanel(
  channel: VoiceBasedChannel,
  record: VcRecord,
  t?: LumiT,
): PanelMessage {
  const limitStr =
    channel.userLimit && channel.userLimit > 0
      ? String(channel.userLimit)
      : t
        ? t("tempvc:unlimited")
        : "Unlimited";

  const title = t ? t("tempvc:panelHeader") : "🔊 Voice Channel Controls";

  const lockBadge = formatStatusBadge(
    record.locked ? "disabled" : "enabled",
    record.locked ? "LOCKED" : "UNLOCKED",
  );
  const hideBadge = formatStatusBadge(
    record.hidden ? "disabled" : "enabled",
    record.hidden ? "HIDDEN" : "VISIBLE",
  );

  const body = [
    `**Channel:** ${channelMention(channel.id)}`,
    `**Owner:** ${userMention(record.ownerId)}`,
    `**Limit:** \`${limitStr}\``,
    `**Status:** ${lockBadge} · ${hideBadge}`,
  ];

  const menu = createStringSelectMenu({
    customId: `${TVC}:panelmenu:${channel.id}`,
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
    customId: `${TVC}:claim:${channel.id}`,
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

  return makeCard(CARD_ACCENTS.PRIMARY, title, body, {
    footer,
    actionRows: rows,
  });
}

/** Builds the sub-action view for kicking channel members. */
export function buildKickView(
  channel: VoiceBasedChannel,
  _record: VcRecord,
  t?: LumiT,
): PanelMessage {
  const userSelect = createUserSelectMenu({
    customId: `${TVC}:select_kick:${channel.id}`,
    placeholder: t ? t("tempvc:selectKickPlaceholder") : "Select member(s) to kick…",
    minValues: 1,
    maxValues: 10,
  });

  const backLabel = "← Back to Panel";
  const backBtn = createBackButton(`${TVC}:panel:${channel.id}`, backLabel);

  const rows = buildSafeActionRows([
    new ActionRowBuilder().addComponents(userSelect),
    new ActionRowBuilder().addComponents(backBtn),
  ]);

  return makeInfoCard(
    t ? t("tempvc:kickMembersTitle") : "👢 Kick Members",
    t ? t("tempvc:kickMembersMessage") : "Select members to disconnect from this voice channel:",
    { actionRows: rows },
  );
}

/** Builds the sub-action view for trusting users or roles. */
export function buildTrustView(
  channel: VoiceBasedChannel,
  _record: VcRecord,
  _t?: LumiT,
): PanelMessage {
  const userSelect = createUserSelectMenu({
    customId: `${TVC}:select_trust:${channel.id}`,
    placeholder: "Select user(s) to trust…",
    minValues: 1,
    maxValues: 10,
  });

  const roleSelect = createRoleSelectMenu({
    customId: `${TVC}:select_trust_role:${channel.id}`,
    placeholder: "Select role(s) to trust…",
    minValues: 1,
    maxValues: 10,
  });

  const backBtn = createBackButton(`${TVC}:panel:${channel.id}`, "← Back to Panel");

  const rows = buildSafeActionRows([
    new ActionRowBuilder().addComponents(userSelect),
    new ActionRowBuilder().addComponents(roleSelect),
    new ActionRowBuilder().addComponents(backBtn),
  ]);

  return makeInfoCard(
    "✅ Trust User or Role",
    "Select users or roles to grant access (connect, view, speak) to this channel:",
    { actionRows: rows },
  );
}

/** Builds the sub-action view for untrusting users or roles. */
export function buildUntrustView(
  channel: VoiceBasedChannel,
  _record: VcRecord,
  _t?: LumiT,
): PanelMessage {
  const userSelect = createUserSelectMenu({
    customId: `${TVC}:select_untrust:${channel.id}`,
    placeholder: "Select user(s) to untrust…",
    minValues: 1,
    maxValues: 10,
  });

  const roleSelect = createRoleSelectMenu({
    customId: `${TVC}:select_untrust_role:${channel.id}`,
    placeholder: "Select role(s) to untrust…",
    minValues: 1,
    maxValues: 10,
  });

  const backBtn = createBackButton(`${TVC}:panel:${channel.id}`, "← Back to Panel");

  const rows = buildSafeActionRows([
    new ActionRowBuilder().addComponents(userSelect),
    new ActionRowBuilder().addComponents(roleSelect),
    new ActionRowBuilder().addComponents(backBtn),
  ]);

  return makeInfoCard(
    "❎ Untrust User or Role",
    "Select users or roles to remove custom permissions from this channel:",
    { actionRows: rows },
  );
}

/** Builds the sub-action view for blocking users or roles. */
export function buildBlockView(
  channel: VoiceBasedChannel,
  _record: VcRecord,
  _t?: LumiT,
): PanelMessage {
  const userSelect = createUserSelectMenu({
    customId: `${TVC}:select_block:${channel.id}`,
    placeholder: "Select user(s) to block…",
    minValues: 1,
    maxValues: 10,
  });

  const roleSelect = createRoleSelectMenu({
    customId: `${TVC}:select_block_role:${channel.id}`,
    placeholder: "Select role(s) to block…",
    minValues: 1,
    maxValues: 10,
  });

  const backBtn = createBackButton(`${TVC}:panel:${channel.id}`, "← Back to Panel");

  const rows = buildSafeActionRows([
    new ActionRowBuilder().addComponents(userSelect),
    new ActionRowBuilder().addComponents(roleSelect),
    new ActionRowBuilder().addComponents(backBtn),
  ]);

  return makeInfoCard(
    "🚫 Block User or Role",
    "Select users or roles to block from joining this voice channel:",
    { actionRows: rows },
  );
}

/** Builds the sub-action view for unblocking users or roles. */
export function buildUnblockView(
  channel: VoiceBasedChannel,
  _record: VcRecord,
  _t?: LumiT,
): PanelMessage {
  const userSelect = createUserSelectMenu({
    customId: `${TVC}:select_unblock:${channel.id}`,
    placeholder: "Select user(s) to unblock…",
    minValues: 1,
    maxValues: 10,
  });

  const roleSelect = createRoleSelectMenu({
    customId: `${TVC}:select_unblock_role:${channel.id}`,
    placeholder: "Select role(s) to unblock…",
    minValues: 1,
    maxValues: 10,
  });

  const backBtn = createBackButton(`${TVC}:panel:${channel.id}`, "← Back to Panel");

  const rows = buildSafeActionRows([
    new ActionRowBuilder().addComponents(userSelect),
    new ActionRowBuilder().addComponents(roleSelect),
    new ActionRowBuilder().addComponents(backBtn),
  ]);

  return makeInfoCard(
    "♻️ Unblock User or Role",
    "Select users or roles to remove block restrictions from this channel:",
    { actionRows: rows },
  );
}

/** Builds the sub-action view for transferring ownership. */
export function buildTransferView(
  channel: VoiceBasedChannel,
  _record: VcRecord,
  _t?: LumiT,
): PanelMessage {
  const userSelect = createUserSelectMenu({
    customId: `${TVC}:select_transfer:${channel.id}`,
    placeholder: "Select new channel owner…",
    minValues: 1,
    maxValues: 1,
  });

  const backBtn = createBackButton(`${TVC}:panel:${channel.id}`, "← Back to Panel");

  const rows = buildSafeActionRows([
    new ActionRowBuilder().addComponents(userSelect),
    new ActionRowBuilder().addComponents(backBtn),
  ]);

  return makeInfoCard(
    "🔄 Transfer Ownership",
    "Select a new owner for this voice channel:",
    { actionRows: rows },
  );
}

/** Builds the confirmation card for channel deletion. */
export function buildDeleteConfirmView(
  channel: VoiceBasedChannel,
  t?: LumiT,
): PanelMessage {
  const confirmBtn = createActionButton({
    customId: `${TVC}:delyes:${channel.id}`,
    label: t ? t("tempvc:confirmDeleteButton") : "Confirm Delete",
    style: ButtonStyle.Danger,
  });

  const backBtn = createBackButton(`${TVC}:panel:${channel.id}`, "← Back to Panel");

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
