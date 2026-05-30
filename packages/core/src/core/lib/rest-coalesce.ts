// Per-channel message-delete coalescer. Modules that soft-delete (e.g.
// `afk-delete-message`) emit one DELETE per message; with many users AFK in a channel
// that's a REST call each. Batching into bulkDelete
// (`POST /channels/{id}/messages/bulk-delete`, up to 100 ids) collapses N calls into
// ⌈N/100⌉, cutting the budget the shared nirn-proxy spends.
//
// It coalesces only within one process and one channel (bulkDelete is per-channel; a
// tight in-process window already catches the common burst — the same worker handling
// it) and leaves the purge flow alone, since purge already batches its own fetched
// pages. Messages older than 14 days and single-message flushes fall through to a plain
// DELETE — bulkDelete rejects both with 50034. A bulkDelete failure resolves every
// entry with an error rather than retrying inline, since each caller has its own policy
// (AFK swallows 10008/10003/50001, etc).

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
