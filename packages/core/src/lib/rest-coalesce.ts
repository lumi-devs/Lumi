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
      q.timer.unref?.();
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

  while (q.entries.length > 0) {
    const batch = q.entries.splice(0, MAX_BATCH);
    if (batch.length === 1) {
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
      for (const e of batch) e.reject(err);
    }
  }

  q.flushing = false;
  if (q.entries.length === 0) {
    queues.delete(channelId);
  } else if (!q.timer) {
    q.timer = setTimeout(() => void flush(channelId), FLUSH_DELAY_MS);
    q.timer.unref?.();
  }
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
