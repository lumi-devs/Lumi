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
import { Mutex } from "@lumi/shared";
import { type Container } from "#lib/services.js";
import { queueDepth } from "@lumi/observability";
import { scheduleTask, QueuePriority } from "#lib/schedule-task.js";
import { renderAuditCard, renderLogCard, type AuditEntry, type LogCard } from "./render.js";

const QueueLabel = "outbound-send";

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
export async function queueSend(services: Container, payload: OutboundSendPayload): Promise<void> {
  payload.at ??= Date.now();
  try {
    await scheduleTask("send-message", payload, {
      customJobOptions: { priority: QueuePriority.UTILITY },
    });
  } catch (err: unknown) {
    services.logger.warn(
      `[OutboundSend] Could not queue a send for channel ${payload.channelId}; sending inline:`,
      err,
    );
    await deliver(services, payload);
  }
}

/** One in-flight send per channel; distinct channels still run concurrently. */
const channelQueues = new Map<string, Mutex>();
let pending = 0;

export async function handleSendMessageFire(
  services: Container,
  payload: OutboundSendPayload,
): Promise<void> {
  const { channelId } = payload;
  let queue = channelQueues.get(channelId);
  if (!queue) {
    queue = new Mutex();
    channelQueues.set(channelId, queue);
  }

  pending++;
  queueDepth.set({ queue: QueueLabel }, pending);
  await queue.wait();
  try {
    await deliver(services, payload);
  } finally {
    queue.shift();
    pending--;
    queueDepth.set({ queue: QueueLabel }, pending);
    if (queue.remaining === 0) channelQueues.delete(channelId);
  }
}

/**
 * Perform the send. Throws on transport failure so the caller (the task-fire
 * consumer) nacks and the message is redelivered; a channel that no longer
 * exists is not an error, just a dead letter.
 */
async function deliver(services: Container, payload: OutboundSendPayload): Promise<void> {
  const channel =
    services.client.channels.cache.get(payload.channelId) ??
    (await services.client.channels
      .fetch(payload.channelId)
      .catch(() => null));

  if (!channel || !channel.isTextBased() || !("send" in channel)) {
    services.logger.debug(
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
