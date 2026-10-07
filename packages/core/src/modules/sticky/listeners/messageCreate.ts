import type { Container } from "#lib/services.js";
import { renderMessageContent } from "#lib/message-content.js";
import { LumiEvents } from "#lib/types/common.js";
import type { GuildMessage } from "#lib/types/common.js";
import { defineListener } from "#lib/listeners/listener-def.js";
import { swallow } from "#lib/utilities/errors.js";
import { renderMessageBlocksV2 } from "#lib/utilities/message-blocks-v2.js";
import {
  getStickyMessageId,
  isStickyOnCooldown,
  setStickyMessageId,
} from "../data/sticky-store.js";
import { stickyIndex } from "@lumi/application/services/sticky/sticky-index.js";

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
