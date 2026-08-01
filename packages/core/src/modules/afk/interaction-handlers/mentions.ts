import { ButtonStyle } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, type MessageActionRowComponentBuilder } from "@discordjs/builders";
import {
  InteractionHandlerTypes,
  InteractionHandler,
  container,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { ButtonInteraction, MessageFlags } from "discord.js";
import {
  userMention,
  channelMention,
  hyperlink,
  messageLink,
} from "@discordjs/formatters";
import { makeListCard, ephemeralCard } from "#lib/utilities/cards.js";
import { BaseInteractionHandler } from "#lib/interaction-handler.js";
import { Emojis } from "#lib/utilities/assets.js";
import { getAfkMentions } from "../data/afk.js";

import { fetchTyped } from "#lib/commands.js";

const PAGE_SIZE = 5;

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export default class AfkMentionsHandler extends BaseInteractionHandler {
  public override parse(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("afk:mentions:")) return this.none();
    const [, , userId, page] = interaction.customId.split(":");
    return this.some({ userId, page: page ? parseInt(page, 10) : 0 });
  }

  public async run(
    interaction: ButtonInteraction,
    { userId, page }: { userId: string; page: number },
  ) {
    if (!this.checkSecurity(interaction, userId)) return;

    // Which defer to use depends only on the source message's own flags
    // (known synchronously), so defer before the async lookups below to
    // beat Discord's 3s ack window.
    const isEphemeral = interaction.message.flags.has(MessageFlags.Ephemeral);
    if (isEphemeral) await interaction.deferUpdate();
    else
      await interaction.deferReply({
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      });

    const t = await fetchTyped(interaction);
    const mentions = await getAfkMentions(interaction.guildId!, userId);

    const totalPages = Math.max(1, Math.ceil(mentions.length / PAGE_SIZE));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const pageItems = mentions.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

    const items = pageItems.map((m) => {
      const duration = container.utilities.time.formatDuration(
        Date.now() - m.ts * 1000,
      );
      const link = hyperlink(
        t("afk:jumpToMessage"),
        messageLink(m.channelId, m.messageId, interaction.guildId!),
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
        .setCustomId(`afk:mentions:${userId}:${safePage - 1}`)
        .setLabel("Previous")
        .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage <= 0),
      new ButtonBuilder()
        .setCustomId(`afk:mentions:${userId}:indicator`)
        .setLabel(`Page ${safePage + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`afk:mentions:${userId}:${safePage + 1}`)
        .setLabel("Next")
        .setEmoji(Emojis.parse(Emojis.ARROW_RIGHT))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= totalPages - 1)
    ) : undefined;

    const card = makeListCard(
      `${Emojis.MAIL} ${t("afk:mentionsTitle")}`,
      items,
      row ? { actionRows: [row] } : {}
    );

    await interaction.editReply(isEphemeral ? card : ephemeralCard(card));
  }
}
