import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  userMention,
  type ButtonInteraction,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import type { LumiServices } from "@lumi/module-kit";
import { formatDuration } from "@lumi/foundation";
import { componentEmoji, makeListCard } from "@lumi/ui";
import { getAfkMentions } from "./service.ts";

const PageSize = 5;

export async function handleAfkInteraction(
  services: LumiServices,
  interaction: ButtonInteraction,
): Promise<void> {
  const customId = interaction.customId;
  if (!customId.startsWith("afk:mentions:")) return;

  const parts = customId.split(":");
  // afk:mentions:<userId>:<page>
  const targetUserId = parts[2];
  const pageStr = parts[3];

  if (!targetUserId || !pageStr || pageStr === "indicator") {
    await interaction.deferUpdate().catch(() => undefined);
    return;
  }

  if (interaction.user.id !== targetUserId) {
    await interaction.reply({
      content: "These controls belong to the user who received the mentions.",
      flags: MessageFlags.Ephemeral,
    }).catch(() => undefined);
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) return;

  const page = Number.parseInt(pageStr, 10) || 0;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => undefined);

  const mentions = await getAfkMentions(services, guildId, targetUserId);
  if (mentions.length === 0) {
    await interaction.editReply(
      makeListCard("📬 Recent Mentions", ["No recent mentions recorded."]),
    ).catch(() => undefined);
    return;
  }

  const totalPages = Math.max(1, Math.ceil(mentions.length / PageSize));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const pageItems = mentions.slice(safePage * PageSize, (safePage + 1) * PageSize);

  const items = pageItems.map((mention) => {
    const elapsedMs = Math.max(0, Date.now() - mention.ts * 1000);
    const duration = formatDuration(elapsedMs);
    const jumpLink = `https://discord.com/channels/${guildId}/${mention.channelId}/${mention.messageId}`;
    const channelName =
      interaction.guild?.channels.cache.get(mention.channelId)?.name ?? "deleted-channel";
    return `${userMention(mention.authorId)} in #${channelName} - ${duration} ago\n[Jump to Message](${jumpLink})`;
  });

  let row: ActionRowBuilder<MessageActionRowComponentBuilder> | undefined;
  if (totalPages > 1) {
    row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`afk:mentions:${targetUserId}:${safePage - 1}`)
        .setLabel("Previous")
        .setEmoji(componentEmoji("⬅️"))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage <= 0),
      new ButtonBuilder()
        .setCustomId(`afk:mentions:${targetUserId}:indicator`)
        .setLabel(`Page ${safePage + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`afk:mentions:${targetUserId}:${safePage + 1}`)
        .setLabel("Next")
        .setEmoji(componentEmoji("➡️"))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= totalPages - 1),
    );
  }

  const card = makeListCard(
    "📬 Recent Mentions",
    items,
    row ? { actionRows: [row] } : {},
  );

  await interaction.editReply(card).catch(() => undefined);
}
