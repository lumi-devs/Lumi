import { container } from "@sapphire/framework";
import type { StickyEntry } from "../config.js";

function parseStickyEntry(raw: unknown): StickyEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { channel_id, message, enabled, accentColor, imageUrls, thumbnailUrl, richContent } =
    raw as Partial<StickyEntry>;
  if (typeof channel_id !== "string") return null;
  const hasRichContent =
    typeof richContent === "object" &&
    richContent !== null &&
    Array.isArray((richContent as { blocks?: unknown }).blocks) &&
    (richContent as { blocks: unknown[] }).blocks.length > 0;
  if (!hasRichContent && (typeof message !== "string" || message.length === 0)) return null;
  if (enabled === false) return null;
  return {
    channel_id,
    message: typeof message === "string" ? message : "",
    enabled: enabled ?? true,
    ...(typeof accentColor === "string" ? { accentColor } : {}),
    ...(Array.isArray(imageUrls)
      ? {
          imageUrls: imageUrls.filter((url): url is string => typeof url === "string"),
        }
      : {}),
    ...(typeof thumbnailUrl === "string" && thumbnailUrl.length > 0 ? { thumbnailUrl } : {}),
    ...(hasRichContent ? { richContent } : {}),
  };
}

function buildIndex(entries: unknown): Map<string, StickyEntry> {
  const byChannel = new Map<string, StickyEntry>();
  if (!Array.isArray(entries)) return byChannel;
  for (const raw of entries) {
    const entry = parseStickyEntry(raw);
    if (!entry) continue;
    if (!byChannel.has(entry.channel_id)) byChannel.set(entry.channel_id, entry);
  }
  return byChannel;
}

interface GuildIndex {
  source: unknown;
  byChannel: Map<string, StickyEntry>;
}

/**
 * Per-guild channel -> entry index, sitting on top of the already-`getOrSet`-cached
 * `entries` config array so `messageCreate.ts` doesn't linearly scan it on every
 * non-bot message. There's no per-guild-config-change signal today (the generic
 * config-save path lives in `modules/core`, which can't import sticky-specific sync
 * logic), so a rebuild is triggered either by the source array reference changing
 * (the config layer hands back a new array after any write it invalidated) or by a
 * full `onResync` clear - the same fallback `reactionRoleRegistry` relies on.
 */
class StickyIndex {
  readonly #byGuild = new Map<string, GuildIndex>();
  #wired = false;

  public wire(): void {
    if (this.#wired) return;
    this.#wired = true;
    container.invalidation.onResync(() => {
      this.#byGuild.clear();
    });
  }

  public find(guildId: string, channelId: string, entries: unknown): StickyEntry | null {
    this.wire();
    let index = this.#byGuild.get(guildId);
    if (!index || index.source !== entries) {
      index = { source: entries, byChannel: buildIndex(entries) };
      this.#byGuild.set(guildId, index);
    }
    return index.byChannel.get(channelId) ?? null;
  }
}

export const stickyIndex = new StickyIndex();
