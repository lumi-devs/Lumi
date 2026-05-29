// Per-channel message-delete coalescer.
//
// Background: every worker that fires `afk-delete-message` (and any module
// that wants a soft-delete) emits one DELETE per message. With many users AFK
// in the same channel, that's a separate REST call per message. Coalescing
// them into bulkDelete (`POST /channels/{id}/messages/bulk-delete`, up to 100
// IDs per call) collapses N calls into ⌈N/100⌉, which materially cuts the
// REST budget the gateway-shared nirn-proxy has to spend.
//
// What this DOES NOT do:
//   - Replace bulkDelete in the purge flow (purge already does its own
//     batching against fetched-message pages — coalescing buys nothing).
//   - Coalesce across channels: bulkDelete is per-channel.
//   - Coalesce across processes: the trade-off is that a tight in-process
//     window already captures the common case (same worker handling a burst).
//
// Fallbacks: any message older than 14 days, plus single-message flushes,
// fall through to a single DELETE — bulkDelete rejects both with 50034.
//
// Failure mode: a bulkDelete failure resolves every entry with an error so
// callers can decide; we don't retry inline because every caller already has
// its own error policy (AFK swallows 10008/10003/50001, etc).

import { container } from "@sapphire/framework";
import { Routes } from "discord-api-types/v10";
import { DiscordSnowflake } from "@sapphire/snowflake";

const MAX_BATCH = 100;
const FLUSH_DELAY_MS = 1_500;
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

interface PendingEntry {
  messageId: string;
  resolve: () => void;
  reject: (err: unknown) => void;
}

interface ChannelQueue {
  entries: PendingEntry[];
  timer: ReturnType<typeof setTimeout> | null;
  flushing: boolean;
}

const queues = new Map<string, ChannelQueue>();

/**
 * Queue a single-message delete. Returns a promise that settles when the
 * coalesced or single-shot REST call completes (resolves on terminal API
 * errors handled by the caller — i.e. always; reject is reserved for
 * unexpected transport failures so callers can log).
 */
export function coalesceMessageDelete(
  channelId: string,
  messageId: string,
): Promise<void> {
  // Messages older than the bulk-delete cutoff cannot be batched; ship them
  // as a single DELETE so the flush path doesn't need to special-case mixed
  // ages.
  const ageMs = Date.now() - DiscordSnowflake.timestampFrom(messageId);
  if (ageMs >= TWO_WEEKS_MS) {
    return singleDelete(channelId, messageId);
  }

  return new Promise<void>((resolve, reject) => {
    let q = queues.get(channelId);
    if (!q) {
      q = { entries: [], timer: null, flushing: false };
      queues.set(channelId, q);
    }
    q.entries.push({ messageId, resolve, reject });
    if (q.entries.length >= MAX_BATCH) {
      void flush(channelId);
      return;
    }
    if (!q.timer) {
      q.timer = setTimeout(() => void flush(channelId), FLUSH_DELAY_MS);
    }
  });
}

async function flush(channelId: string): Promise<void> {
  const q = queues.get(channelId);
  if (!q || q.entries.length === 0) return;
  if (q.flushing) return;
  q.flushing = true;
  if (q.timer) {
    clearTimeout(q.timer);
    q.timer = null;
  }

  // Drain in MAX_BATCH chunks. Each batch is its own REST call; if more
  // arrived during the await we'll loop and pick those up too.
  while (q.entries.length > 0) {
    const batch = q.entries.splice(0, MAX_BATCH);
    if (batch.length === 1) {
      // bulkDelete with one ID 400s ("must be between 2 and 100"); fall back.
      const e = batch[0]!;
      try {
        await singleDelete(channelId, e.messageId);
        e.resolve();
      } catch (err) {
        e.reject(err);
      }
      continue;
    }

    try {
      await container.client.rest.post(Routes.channelBulkDelete(channelId), {
        body: { messages: batch.map((e) => e.messageId) },
      });
      for (const e of batch) e.resolve();
    } catch (err) {
      // bulkDelete is all-or-nothing. If it failed (rate limit, perms, etc.),
      // surface to every caller rather than silently dropping deletes.
      for (const e of batch) e.reject(err);
    }
  }

  q.flushing = false;
  if (q.entries.length === 0) queues.delete(channelId);
  else if (!q.timer)
    q.timer = setTimeout(() => void flush(channelId), FLUSH_DELAY_MS);
}

async function singleDelete(
  channelId: string,
  messageId: string,
): Promise<void> {
  await container.client.rest.delete(
    Routes.channelMessage(channelId, messageId),
  );
}

/** Force-flush every pending queue. Useful at shutdown. */
export async function flushAllMessageDeletes(): Promise<void> {
  await Promise.all([...queues.keys()].map((id) => flush(id)));
}
