import { ApplyOptions } from "@sapphire/decorators";
import { container } from "@sapphire/framework";
import { renderMessageContent } from "#lib/message-content.js";
import { GuildMessageListener } from "#lib/module-system/GuildMessageListener.js";
import type { GuildMessage } from "#lib/types/common.js";
import { swallow } from "#lib/utilities/errors.js";
import { renderMessageBlocksV2 } from "#lib/utilities/message-blocks-v2.js";
import type { StickyEntry } from "../index.js";
import {
  getStickyMessageId,
  isStickyOnCooldown,
  setStickyMessageId,
} from "../lib/sticky-store.js";

function findStickyEntry(
  entries: unknown,
  channelId: string,
): StickyEntry | null {
  if (!Array.isArray(entries)) return null;
  for (const raw of entries) {
    if (typeof raw !== "object" || raw === null) continue;
    const { channel_id, message, enabled, accentColor, imageUrls, thumbnailUrl, richContent } =
      raw as Partial<StickyEntry>;
    if (channel_id !== channelId) continue;
    const hasRichContent =
      typeof richContent === "object" &&
      richContent !== null &&
      Array.isArray((richContent as { blocks?: unknown }).blocks) &&
      (richContent as { blocks: unknown[] }).blocks.length > 0;
    if (!hasRichContent && (typeof message !== "string" || message.length === 0)) continue;
    if (enabled === false) continue;
    return {
      channel_id,
      message: typeof message === "string" ? message : "",
      enabled: enabled ?? true,
      ...(typeof accentColor === "string" ? { accentColor } : {}),
      ...(Array.isArray(imageUrls)
        ? {
            imageUrls: imageUrls.filter(
              (url): url is string => typeof url === "string",
            ),
          }
        : {}),
      ...(typeof thumbnailUrl === "string" && thumbnailUrl.length > 0
        ? { thumbnailUrl }
        : {}),
      ...(hasRichContent ? { richContent } : {}),
    };
  }
  return null;
}

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
    const entry = findStickyEntry(entries, message.channelId);
    if (!entry) return;
    if (isStickyOnCooldown(message.guildId, message.channelId)) return;
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
