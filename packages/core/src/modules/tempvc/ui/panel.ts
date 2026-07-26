import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  StringSelectMenuBuilder,
} from "@discordjs/builders";
import {
  ButtonStyle,
  MessageFlags,
  SeparatorSpacingSize,
  type VoiceBasedChannel,
} from "discord.js";
import { channelMention, userMention } from "@discordjs/formatters";
import { TVC } from "../keys.js";
import type { VcRecord } from "../data.js";

import type { LumiT } from "#lib/i18n/index.js";

export interface PanelMessage {
  readonly flags: number;
  readonly components: ContainerBuilder[];
}

function btn(
  action: string,
  channelId: string,
  label: string,
  style: ButtonStyle = ButtonStyle.Secondary,
): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(`${TVC}:${action}:${channelId}`)
    .setLabel(label)
    .setStyle(style);
}

function row(...buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
}

/** Builds the owner control panel for a temporary voice channel. */
export function buildPanel(
  channel: VoiceBasedChannel,
  record: VcRecord,
  t?: LumiT,
): PanelMessage {
  const limit =
    channel.userLimit && channel.userLimit > 0
      ? String(channel.userLimit)
      : t
        ? t("tempvc:unlimited")
        : "Unlimited";
  const lockIcon = record.locked ? "🔒" : "🔓";
  const hideIcon = record.hidden ? "🕵️" : "👀";

  const c = new ContainerBuilder();

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      t ? t("tempvc:panelHeader") : "## 🔊 Voice Channel Controls",
    ),
  );
  c.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
  );
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      t
        ? t("tempvc:panelContent", {
            channel: channelMention(channel.id),
            owner: userMention(record.ownerId),
            limit,
            lockIcon,
            hideIcon,
          })
        : `**Channel:** ${channelMention(channel.id)}\n` +
            `**Owner:** ${userMention(record.ownerId)}\n` +
            `**Limit:** ${limit}\n` +
            `**Lock:** ${lockIcon} · **Hide:** ${hideIcon}`,
    ),
  );
  c.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large),
  );

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${TVC}:panelmenu:${channel.id}`)
    .setPlaceholder(
      t ? t("tempvc:panelSelectPlaceholder") : "Manage Channel...",
    )
    .addOptions(
      {
        label: t ? t("tempvc:panelOptRename") : "Rename Channel",
        value: "name",
        emoji: { name: "👤" },
      },
      {
        label: t ? t("tempvc:panelOptLimit") : "Set User Limit",
        value: "limit",
        emoji: { name: "👥" },
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
        emoji: { name: record.locked ? "🔓" : "🔒" },
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
        emoji: { name: record.hidden ? "👀" : "🕵️" },
      },
      {
        label: t ? t("tempvc:panelOptKick") : "Kick Members",
        value: "kick",
        emoji: { name: "👢" },
      },
      {
        label: t ? t("tempvc:panelOptTrust") : "Trust Member",
        value: "trust",
        emoji: { name: "✅" },
      },
      {
        label: t ? t("tempvc:panelOptUntrust") : "Untrust Member",
        value: "untrust",
        emoji: { name: "❎" },
      },
      {
        label: t ? t("tempvc:panelOptBlock") : "Block Member",
        value: "block",
        emoji: { name: "🚫" },
      },
      {
        label: t ? t("tempvc:panelOptUnblock") : "Unblock Member",
        value: "unblock",
        emoji: { name: "♻️" },
      },
      {
        label: t ? t("tempvc:panelOptTransfer") : "Transfer Ownership",
        value: "transfer",
        emoji: { name: "🔄" },
      },
      {
        label: t ? t("tempvc:panelOptDelete") : "Delete Channel",
        value: "delete",
        emoji: { name: "🗑️" },
      },
    );

  c.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
  );

  c.addActionRowComponents(
    row(
      btn(
        "claim",
        channel.id,
        t ? t("tempvc:panelClaimButton") : "🎯 Claim Ownership",
      ),
    ),
  );

  c.addSeparatorComponents(
    new SeparatorBuilder()
      .setSpacing(SeparatorSpacingSize.Small)
      .setDivider(false),
  );
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      t
        ? t("tempvc:panelFooter")
        : "-# Settings are restricted to the owner. Anyone can claim if the owner leaves.",
    ),
  );

  return { flags: MessageFlags.IsComponentsV2, components: [c] };
}
