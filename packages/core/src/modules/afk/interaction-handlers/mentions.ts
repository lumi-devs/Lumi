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

    const t = await fetchTyped(interaction);
    const mentions = await getAfkMentions(interaction.guildId!, userId);

    const card = makeListCard(
      `${Emojis.MAIL} ${t("afk:mentionsTitle")}`,
      mentions.map((m) => {
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
      }),
      page,
      PAGE_SIZE,
      `afk:mentions:${userId}`,
    );

    if (interaction.message.flags.has(MessageFlags.Ephemeral)) {
      await interaction.update(card);
    } else {
      await interaction.reply(ephemeralCard(card));
    }
  }
}
