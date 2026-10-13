import { container } from "#src/lib/Services.js";
import { Routes } from "discord-api-types/v10";
import { SnowflakeUtil } from "discord.js";
import { Time } from "#src/shared/Index.ts";

const MaxBatch = 100;
const FlushDelayMs = Time.Second * 1.5;
const TwoWeeksMs = 14 * Time.Day;

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

export function coalesceMessageDelete(
  channelId: string,
  messageId: string,
): Promise<void> {
  const ageMs = Date.now() - SnowflakeUtil.timestampFrom(messageId);
  if (ageMs >= TwoWeeksMs) {
    return singleDelete(channelId, messageId);
  }

  return new Promise<void>((resolve, reject) => {
    let q = queues.get(channelId);
    if (!q) {
      q = { entries: [], timer: null, flushing: false };
      queues.set(channelId, q);
    }
    q.entries.push({ messageId, resolve, reject });
    if (q.entries.length >= MaxBatch) {
      void flush(channelId);
      return;
    }
    if (!q.timer) {
      q.timer = setTimeout(() => void flush(channelId), FlushDelayMs);
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
    const batch = q.entries.splice(0, MaxBatch);
    if (batch.length === 1) {
      const entry = batch[0]!;
      try {
        await singleDelete(channelId, entry.messageId);
        entry.resolve();
      } catch (err) {
        entry.reject(err);
      }
      continue;
    }

    try {
      await container.client.rest.post(Routes.channelBulkDelete(channelId), {
        body: { messages: batch.map((entry) => entry.messageId) },
      });
      for (const entry of batch) entry.resolve();
    } catch {
      await Promise.all(
        batch.map(async (entry) => {
          try {
            await singleDelete(channelId, entry.messageId);
            entry.resolve();
          } catch (err) {
            entry.reject(err);
          }
        }),
      );
    }
  }

  q.flushing = false;
  if (q.entries.length === 0) {
    queues.delete(channelId);
  } else if (!q.timer) {

    q.timer = setTimeout(() => void flush(channelId), FlushDelayMs);
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

export async function flushAllMessageDeletes(): Promise<void> {
  await Promise.all([...queues.keys()].map((id) => flush(id)));
}
