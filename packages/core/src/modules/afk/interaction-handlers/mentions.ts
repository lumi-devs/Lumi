import { ButtonStyle } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, type MessageActionRowComponentBuilder } from "@discordjs/builders";
import {
  InteractionHandlerTypes,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { ButtonInteraction, MessageFlags } from "discord.js";
import {
  userMention,
  channelMention,
  hyperlink,
  messageLink,
} from "@discordjs/formatters";
import { formatDuration } from "#lib/utilities/time.js";
import { makeListCard, ephemeralCard } from "#lib/ui/cards.js";
import { ModuleInteractionHandler } from "#lib/interactions/ModuleInteractionHandler.js";
import { Emojis } from "#lib/utilities/assets.js";
import { getAfkMentions } from "../data/afk.js";
import { AfkMentionsId } from "../constants.js";

import { fetchTyped } from "#lib/commands.js";

const PageSize = 5;

@ApplyOptions<ModuleInteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
  module: "afk",
})
export default class AfkMentionsHandler extends ModuleInteractionHandler<
  ButtonInteraction,
  { userId: string; page: string }
> {
  public override parse(interaction: ButtonInteraction) {
    const parsed = AfkMentionsId.parse(interaction.customId);
    if (!parsed) return this.none();
    return this.some(parsed);
  }

  protected override async handle(
    interaction: ButtonInteraction,
    { userId, page: pageStr }: { userId: string; page: string },
  ) {
    const { guildId } = interaction;
    if (!guildId) return;
    this.checkSecurity(interaction, userId);
    const page = parseInt(pageStr, 10);

    // Which defer to use depends only on the source message's own flags
    // (known synchronously), so defer before the async lookups below to
    // beat Discord's 3s ack window.
    const isEphemeral = interaction.message.flags.has(MessageFlags.Ephemeral);
    if (isEphemeral) await this.acknowledge(interaction);
    else
      await interaction.deferReply({
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      });

    const t = await fetchTyped(interaction);
    const mentions = await getAfkMentions(guildId, userId);

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
        .setLabel("Previous")
        .setEmoji(Emojis.parse(Emojis.ArrowLeft))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage <= 0),
      new ButtonBuilder()
        .setCustomId(AfkMentionsId.build({ userId, page: "indicator" }))
        .setLabel(`Page ${safePage + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(AfkMentionsId.build({ userId, page: String(safePage + 1) }))
        .setLabel("Next")
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
  }
}
