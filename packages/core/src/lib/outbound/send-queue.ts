/**
 * Durable path for sends nobody is waiting on - mod-log entries, security
 * alerts, logging embeds.
 *
 * Adapted from YAGPDB's `common/mqueue`, whose stated purpose is "more reliably
 * sending messages with retry on failure, accepting long failure durations such
 * as discord being down". Two ideas are taken from it; the rest is not:
 *
 *   - Durability. BullMQ already provides it (`attempts: 5`, exponential
 *     backoff), so there is no second queue here - just a task type.
 *   - Per-channel isolation. YAGPDB's worker deliberately picks work that "does
 *     not share a channel with any other item being processed (so ratelimits
 *     only take up max 1 worker)". A rate-limited channel parks one slot instead
 *     of stalling everything behind it.
 *
 * Interaction replies deliberately do NOT come through here: they are bounded by
 * Discord's 15-minute token and are the one path a user is actually waiting on.
 * The rule is *if no user is waiting on it, queue it*.
 */
import { AsyncQueue } from "@sapphire/async-queue";
import { container } from "@sapphire/framework";
import { queueDepth } from "@lumi/observability";
import type { AuditEntry } from "#lib/loggable.js";
import { scheduleTask } from "#lib/schedule-task.js";
import { renderAuditCard, renderLogCard, type LogCard } from "./render.js";

const QUEUE_LABEL = "outbound-send";

export interface OutboundSendPayload {
  channelId: string;
  /** Epoch ms the send was produced; stamped on the rendered card. */
  at?: number;
  /** Plain message content. */
  content?: string;
  /** Moderation/audit entry, rendered into its card by the consumer. */
  auditEntry?: AuditEntry;
  /** Generic log card (logging module), rendered by the consumer. */
  logCard?: LogCard;
}

/**
 * Hand a send to the queue. Falls back to sending inline if the queue itself is
 * unreachable - a degraded send beats a dropped one.
 */
export async function queueSend(payload: OutboundSendPayload): Promise<void> {
  payload.at ??= Date.now();
  try {
    await scheduleTask("send-message", payload);
  } catch (err: unknown) {
    container.logger.warn(
      `[OutboundSend] Could not queue a send for channel ${payload.channelId}; sending inline:`,
      err,
    );
    await deliver(payload);
  }
}

/** One in-flight send per channel; distinct channels still run concurrently. */
const channelQueues = new Map<string, AsyncQueue>();
let pending = 0;

export async function handleSendMessageFire(
  payload: OutboundSendPayload,
): Promise<void> {
  const { channelId } = payload;
  let queue = channelQueues.get(channelId);
  if (!queue) {
    queue = new AsyncQueue();
    channelQueues.set(channelId, queue);
  }

  pending++;
  queueDepth.set({ queue: QUEUE_LABEL }, pending);
  await queue.wait();
  try {
    await deliver(payload);
  } finally {
    queue.shift();
    pending--;
    queueDepth.set({ queue: QUEUE_LABEL }, pending);
    if (queue.remaining === 0) channelQueues.delete(channelId);
  }
}

/**
 * Perform the send. Throws on transport failure so the caller (the task-fire
 * consumer) nacks and the message is redelivered; a channel that no longer
 * exists is not an error, just a dead letter.
 */
async function deliver(payload: OutboundSendPayload): Promise<void> {
  const channel =
    container.client.channels.cache.get(payload.channelId) ??
    (await container.client.channels
      .fetch(payload.channelId)
      .catch(() => null));

  if (!channel || !channel.isTextBased() || !("send" in channel)) {
    container.logger.debug(
      `[OutboundSend] Dropping send for unresolvable channel ${payload.channelId}.`,
    );
    return;
  }

  const at = payload.at ?? Date.now();
  if (payload.auditEntry) {
    await channel.send(renderAuditCard(payload.auditEntry, at));
    return;
  }
  if (payload.logCard) {
    await channel.send(renderLogCard(payload.logCard, at));
    return;
  }
  if (payload.content) {
    await channel.send(payload.content);
  }
}
