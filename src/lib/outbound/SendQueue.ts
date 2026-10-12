import { AsyncQueue } from "@sapphire/async-queue";
import { type Container } from "#src/lib/Services.js";
import { queueDepth } from "#src/observability/Index.ts";
import { scheduleTask, QueuePriority } from "#src/lib/scheduler/Schedule.js";
import { renderAuditCard, renderLogCard, type AuditEntry, type LogCard } from "#src/lib/outbound/Render.js";

const QueueLabel = "outbound-send";

export interface OutboundSendPayload {
  channelId: string;

  at?: number;

  content?: string;

  auditEntry?: AuditEntry;

  logCard?: LogCard;
}

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

const channelQueues = new Map<string, AsyncQueue>();
let pending = 0;

export async function handleSendMessageFire(
  services: Container,
  payload: OutboundSendPayload,
): Promise<void> {
  const { channelId } = payload;
  let queue = channelQueues.get(channelId);
  if (!queue) {
    queue = new AsyncQueue();
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
