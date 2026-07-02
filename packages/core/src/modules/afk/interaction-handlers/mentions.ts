import {
  InteractionHandlerTypes,
  InteractionHandler,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { ButtonInteraction } from "discord.js";
import {
  userMention,
  channelMention,
  hyperlink,
  messageLink,
} from "@discordjs/formatters";
import { makeListCard } from "#utilities/cards.js";
import { formatUptime } from "#utilities/time.js";
import { BaseInteractionHandler } from "#core/lib/interaction-handler.js";
import { Emojis } from "#utilities/assets.js";
import { getAfkMentions } from "../data/afk.js";

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

    await this.acknowledge(interaction);
    const mentions = await getAfkMentions(interaction.guildId!, userId);

    const card = makeListCard(
      `${Emojis.MAIL} Recent Mentions`,
      mentions.map(
        (m) =>
          `${userMention(m.authorId)} in ${channelMention(m.channelId)} — ${formatUptime(Date.now() - m.ts * 1000)} ago\n${hyperlink("Jump to Message", messageLink(m.channelId, m.messageId, interaction.guildId!))}`,
      ),
      page,
      PAGE_SIZE,
      `afk:mentions:${userId}`,
    );

    await interaction.editReply(card);
  }
}
