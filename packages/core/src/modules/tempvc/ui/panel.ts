import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
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

  c.addActionRowComponents(
    row(
      btn("name", channel.id, "👤 Name"),
      btn("limit", channel.id, "👥 Limit"),
      btn("delete", channel.id, "🗑️ Delete", ButtonStyle.Danger),
    ),
  );
  c.addActionRowComponents(
    row(
      btn("lock", channel.id, record.locked ? "🔓 Unlock" : "🔒 Lock"),
      btn("hide", channel.id, record.hidden ? "👀 Unhide" : "🕵️ Hide"),
      btn("kick", channel.id, "👢 Kick"),
    ),
  );
  c.addActionRowComponents(
    row(
      btn("trust", channel.id, "✅ Trust"),
      btn("untrust", channel.id, "❎ Untrust"),
      btn("block", channel.id, "🚫 Block"),
      btn("unblock", channel.id, "♻️ Unblock"),
    ),
  );
  c.addActionRowComponents(
    row(
      btn("transfer", channel.id, "🔄 Transfer"),
      btn("claim", channel.id, "🎯 Claim"),
    ),
  );

  c.addSeparatorComponents(
    new SeparatorBuilder()
      .setSpacing(SeparatorSpacingSize.Small)
      .setDivider(false),
  );
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      "-# Only the channel owner can use these controls",
    ),
  );

  return { flags: MessageFlags.IsComponentsV2 as number, components: [c] };
}
