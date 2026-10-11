import type { Container } from "#src/lib/Services.js";
import { errorCode, logError } from "#src/lib/utilities/Errors.js";
import { Time } from "#src/shared/Index.ts";
import {
  type Collection,
  type FetchMessagesOptions,
  type GuildTextBasedChannel,
  type Message,
} from "discord.js";

export interface MassPurgeOptions {
  limit: number;
  filter?: (message: Message) => boolean;
  matchIds?: (messages: Message[]) => Promise<Set<string>>;
  excludeIds?: ReadonlySet<string>;
  maxScan?: number;
}

export interface MassPurgeResult {
  deleted: number;
  scanned: number;
}

async function safeBulkDelete(
  services: Container,
  channel: GuildTextBasedChannel,
  msgs: Message[],
): Promise<number> {
  if (msgs.length === 0) return 0;
  if (msgs.length <= 2) {
    let count = 0;
    for (const m of msgs) {
      const success = await m
        .delete()
        .then(() => true)
        .catch((err: unknown) => errorCode(err) === 10008);
      if (success) count++;
    }
    return count;
  }
  try {
    const res = await channel.bulkDelete(msgs, true);
    return res.size;
  } catch (err: unknown) {
    if (errorCode(err) === 10008) {
      services.logger.debug(
        `[MassPurge] Bulk delete of ${msgs.length} failed with 10008, splitting...`,
      );
      const mid = Math.floor(msgs.length / 2);
      const left = await safeBulkDelete(services, channel, msgs.slice(0, mid));
      const right = await safeBulkDelete(services, channel, msgs.slice(mid));
      return left + right;
    }
    throw err;
  }
}

export async function massPurge(
  services: Container,
  channel: GuildTextBasedChannel,
  options: MassPurgeOptions,
): Promise<MassPurgeResult> {
  const { limit, filter, matchIds, excludeIds, maxScan = 2000 } = options;
  const hasFilter = Boolean(filter ?? matchIds);
  let deleted = 0;
  let scanned = 0;
  let remaining = limit;
  let lastMessageId: string | undefined;

  while (remaining > 0 && (!hasFilter || scanned < maxScan)) {
    const fetchOptions: FetchMessagesOptions = {
      limit: hasFilter ? 100 : Math.min(remaining, 100),
    };
    if (lastMessageId) fetchOptions.before = lastMessageId;

    const messages = (await channel.messages
      .fetch(fetchOptions)
      .catch(() => null)) as Collection<string, Message> | null;
    if (!messages || messages.size === 0) break;

    const oldest = messages.last();
    if (oldest) lastMessageId = oldest.id;
    scanned += messages.size;

    const candidates = [...messages.values()].filter(
      (m) => !excludeIds?.has(m.id),
    );
    const matched = matchIds ? await matchIds(candidates) : null;

    const now = Date.now();
    const cutoff = now - 14 * Time.Day;
    const young: Message[] = [];
    const old: Message[] = [];

    for (const msg of candidates) {
      if (filter && !filter(msg)) continue;
      if (matched && !matched.has(msg.id)) continue;
      if (msg.createdTimestamp > cutoff) young.push(msg);
      else old.push(msg);
      if (young.length + old.length >= remaining) break;
    }

    if (young.length > 0) {
      try {
        const n = await safeBulkDelete(services, channel, young);
        deleted += n;
        remaining -= n;
      } catch (err: unknown) {
        services.logger.error(
          "[MassPurge] bulk delete failed, falling back to slow path:",
          err,
        );
        old.push(...young);
      }
    }

    for (const msg of old) {
      if (remaining <= 0) break;
      const success = await msg
        .delete()
        .then(() => true)
        .catch((err: unknown) => {
          if (errorCode(err) === 10008) return true;
          logError(`[MassPurge] Individual delete failed for ${msg.id}`, err);
          return false;
        });
      if (success) {
        deleted++;
        remaining--;
      }
    }
  }

  return { deleted, scanned };
}
