import { ApplyOptions } from "@sapphire/decorators";
import { container } from "@sapphire/framework";
import { renderMessageContent } from "#lib/message-content.js";
import { GuildMessageListener } from "#lib/module-system/GuildMessageListener.js";
import type { GuildMessage } from "#lib/types/common.js";
import { swallow } from "#lib/utilities/errors.js";
import { renderMessageBlocksV2 } from "#lib/utilities/message-blocks-v2.js";
import {
  getStickyMessageId,
  isStickyOnCooldown,
  setStickyMessageId,
} from "../data/sticky-store.js";
import { stickyIndex } from "../services/sticky-index.js";

@ApplyOptions<GuildMessageListener.Options>({
  name: "stickyMessageCreate",
  module: "sticky",
})
export class StickyMessageListener extends GuildMessageListener {
  protected async handle(message: GuildMessage): Promise<void> {
    if (message.author.bot) return;
    const entries = await container.db.config.getModuleConfig(
      message.guildId,
      "sticky",
      "entries",
    );
    const entry = stickyIndex.find(message.guildId, message.channelId, entries);
    if (!entry) return;
    if (await isStickyOnCooldown(message.guildId, message.channelId)) return;
    const oldId = await getStickyMessageId(
      message.guildId,
      message.channelId,
    ).catch(swallow("Sticky: read last message id"));
    if (oldId) {
      await message.channel.messages
        .delete(oldId)
        .catch(swallow("Sticky: delete old message"));
    }
    const sent = await message.channel
      .send(
        entry.richContent?.blocks.length
          ? renderMessageBlocksV2(entry.richContent)
          : renderMessageContent(
              {
                text: entry.message,
                accentColor: entry.accentColor,
                imageUrls: entry.imageUrls,
                thumbnailUrl: entry.thumbnailUrl,
              },
              {},
              "📌 Sticky",
            ),
      )
      .catch(swallow("Sticky: send message"));
    if (!sent) return;
    await setStickyMessageId(message.guildId, message.channelId, sent.id).catch(
      swallow("Sticky: store message id"),
    );
  }
}
