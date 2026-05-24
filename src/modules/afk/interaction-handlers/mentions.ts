import {
  InteractionHandlerTypes,
  InteractionHandler,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { ButtonInteraction } from "discord.js";
import { makeListCard } from "#utilities/cards.js";
import { formatUptime } from "#utilities/time.js";
import { EmberInteractionHandler } from "#core/lib/interaction-handler.js";
import { EmberEmojis } from "#utilities/assets.js";
import { getAfkMentions } from "../data/afk.js";

const PAGE_SIZE = 5;

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export default class AfkMentionsHandler extends EmberInteractionHandler {
  public override parse(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("afk:mentions:")) return this.none();
    const [, , userId, page] = interaction.customId.split(":");
    return this.some({ userId, page: page ? parseInt(page, 10) : 0 });
  }

  public async run(
    interaction: ButtonInteraction,
    { userId, page }: { userId: string; page: number },
  ) {
    if (!(await this.checkSecurity(interaction, userId))) return;

    await this.acknowledge(interaction);
    const mentions = await getAfkMentions(interaction.guildId!, userId);

    const card = makeListCard(
      ((s: string) =>
        s) as unknown as import("@sapphire/plugin-i18next").TFunction,
      `${EmberEmojis.MAIL} Recent Mentions`,
      mentions.map(
        (m) =>
          `<@${m.authorId}> in <#${m.channelId}> — ${formatUptime(Date.now() - m.ts * 1000)} ago\n[Jump to Message](https://discord.com/channels/${interaction.guildId}/${m.channelId}/${m.messageId})`,
      ),
      page,
      PAGE_SIZE,
      `afk:mentions:${userId}`,
    );

    await interaction.editReply(card);
  }
}
