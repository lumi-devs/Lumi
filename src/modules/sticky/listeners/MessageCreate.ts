import type { Container } from "#src/lib/Services.js";
import { renderMessageContent } from "#src/lib/utilities/MessageContent.js";
import { LumiEvents } from "#src/lib/types/Common.js";
import type { GuildMessage } from "#src/lib/types/Common.js";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import { swallow } from "#src/lib/utilities/Errors.js";
import { renderMessageBlocksV2 } from "#src/lib/utilities/MessageBlocksV2.js";
import {
  getStickyMessageId,
  isStickyOnCooldown,
  setStickyMessageId,
} from "#src/modules/sticky/data/StickyStore.js";
import { stickyIndex } from "#src/modules/sticky/data/StickyIndex.js";

export const StickyMessageListener = defineListener({
  name: "stickyMessageCreate",
  event: LumiEvents.GuildUserMessage,
  module: "sticky",
  async execute(services: Container, message: GuildMessage): Promise<void> {
    if (message.author.bot) return;
    if (await isStickyOnCooldown(services, message.guildId, message.channelId)) return;
    const entries = await services.db.config.getModuleConfig(
      message.guildId,
      "sticky",
      "entries",
    );
    const entry = stickyIndex.find(message.guildId, message.channelId, entries);
    if (!entry) return;
    const oldId = await getStickyMessageId(
      services,
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
    await setStickyMessageId(services, message.guildId, message.channelId, sent.id).catch(
      swallow("Sticky: store message id"),
    );
  },
});
