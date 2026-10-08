import { ButtonStyle } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, type MessageActionRowComponentBuilder } from "@discordjs/builders";
import { ButtonInteraction, MessageFlags } from "discord.js";
import {
  userMention,
  channelMention,
  hyperlink,
  messageLink,
} from "@discordjs/formatters";
import { formatDuration } from "#lib/utilities/time.js";
import { makeErrorCard, makeListCard, ephemeralCard } from "#lib/ui/cards.js";
import {
  acknowledge,
  checkSecurity,
  defineInteraction,
} from "#lib/interactions/interaction-def.js";
import type { Container } from "#lib/services.js";
import { Emojis } from "#lib/utilities/assets.js";
import { getAfkMentions } from "../../data/afk.js";
import { AfkMentionsId } from "../../constants.js";

import { fetchTyped } from "#lib/i18n/index.js";

const PageSize = 5;

export default defineInteraction({
  prefix: AfkMentionsId.prefix,
  module: "afk",
  async run(services: Container, interaction: ButtonInteraction) {
    const parsed = AfkMentionsId.parse(interaction.customId);
    if (!parsed) return;
    const { userId, page: pageStr } = parsed;
    const { guildId } = interaction;
    if (!guildId) return;
    const page = parseInt(pageStr, 10);

    const isEphemeral = interaction.message.flags.has(MessageFlags.Ephemeral);
    try {
      if (isEphemeral) await acknowledge(interaction);
      else
        await interaction.deferReply({
          flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        });
    } catch (err: unknown) {
      services.logger.warn(
        `[AfkMentions] ack failed for ${interaction.customId}:`,
        err,
      );
      try {
        await interaction.reply(
          ephemeralCard(makeErrorCard("Slow Down", "Please try again.")),
        );
      } catch {
        return;
      }
      return;
    }
    checkSecurity(interaction, userId);

    const t = await fetchTyped(interaction);
    const mentions = await getAfkMentions(services, guildId, userId);

    const totalPages = Math.max(1, Math.ceil(mentions.length / PageSize));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const pageItems = mentions.slice(safePage * PageSize, (safePage + 1) * PageSize);

    const items = pageItems.map((m) => {
      const duration = formatDuration(
        Date.now() - m.ts * 1000,
      );
      const link = hyperlink(
        t("afk:jumpToMessage"),
        messageLink(m.channelId, m.messageId, guildId),
      );
      return t("afk:mentionLine", {
        user: userMention(m.authorId),
        channel: channelMention(m.channelId),
        duration,
        link,
      });
    });

    const row = totalPages > 1 ? new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(AfkMentionsId.build({ userId, page: String(safePage - 1) }))
        .setLabel(t("afk:previousButton"))
        .setEmoji(Emojis.parse(Emojis.ArrowLeft))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage <= 0),
      new ButtonBuilder()
        .setCustomId(AfkMentionsId.build({ userId, page: "indicator" }))
        .setLabel(t("afk:pageIndicator", { page: safePage + 1, totalPages }))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(AfkMentionsId.build({ userId, page: String(safePage + 1) }))
        .setLabel(t("afk:nextButton"))
        .setEmoji(Emojis.parse(Emojis.ArrowRight))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= totalPages - 1)
    ) : undefined;

    const card = makeListCard(
      `${Emojis.Mail} ${t("afk:mentionsTitle")}`,
      items,
      row ? { actionRows: [row] } : {}
    );

    await interaction.editReply(isEphemeral ? card : ephemeralCard(card));
  },
});
