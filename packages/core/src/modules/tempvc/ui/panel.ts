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
): PanelMessage {
  const limit =
    channel.userLimit && channel.userLimit > 0
      ? String(channel.userLimit)
      : "Unlimited";
  const lockIcon = record.locked ? "🔒" : "🔓";
  const hideIcon = record.hidden ? "🕵️" : "👀";

  const c = new ContainerBuilder();

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent("## 🔊 Voice Channel Controls"),
  );
  c.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
  );
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**Channel:** ${channelMention(channel.id)}\n` +
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
    .setPlaceholder("Manage Channel...")
    .addOptions(
      { label: "Rename Channel", value: "name", emoji: { name: "👤" } },
      { label: "Set User Limit", value: "limit", emoji: { name: "👥" } },
      {
        label: record.locked ? "Unlock Channel" : "Lock Channel",
        value: "lock",
        emoji: { name: record.locked ? "🔓" : "🔒" },
      },
      {
        label: record.hidden ? "Unhide Channel" : "Hide Channel",
        value: "hide",
        emoji: { name: record.hidden ? "👀" : "🕵️" },
      },
      { label: "Kick Members", value: "kick", emoji: { name: "👢" } },
      { label: "Trust Member", value: "trust", emoji: { name: "✅" } },
      { label: "Untrust Member", value: "untrust", emoji: { name: "❎" } },
      { label: "Block Member", value: "block", emoji: { name: "🚫" } },
      { label: "Unblock Member", value: "unblock", emoji: { name: "♻️" } },
      { label: "Transfer Ownership", value: "transfer", emoji: { name: "🔄" } },
      { label: "Delete Channel", value: "delete", emoji: { name: "🗑️" } },
    );

  c.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
  );

  c.addActionRowComponents(row(btn("claim", channel.id, "🎯 Claim Ownership")));

  c.addSeparatorComponents(
    new SeparatorBuilder()
      .setSpacing(SeparatorSpacingSize.Small)
      .setDivider(false),
  );
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      "-# Settings are restricted to the owner. Anyone can claim if the owner leaves.",
    ),
  );

  return { flags: MessageFlags.IsComponentsV2, components: [c] };
}
