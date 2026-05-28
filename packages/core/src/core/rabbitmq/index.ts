import amqp from "amqp-connection-manager";
import type {
  AmqpConnectionManager,
  ChannelWrapper,
} from "amqp-connection-manager";
import type { Channel, ConsumeMessage } from "amqplib";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { container } from "@sapphire/framework";
import { SpanKind } from "@opentelemetry/api";
import {
  busEventsConsumed,
  busEventsPublished,
  extractTraceContext,
  injectTraceContext,
  otelContext,
  runWithContext,
  withSpan,
} from "@ember/observability";
import { logError, errorFrom } from "#utilities/errors.js";
import type { RpcRequest, RpcResponse, RpcHandler } from "@ember/contracts";

export type { RpcRequest, RpcResponse, RpcHandler };

// RabbitMQ carries two things only: fanout events (broadcasts between processes)
// and the dashboard RPC bridge. Durable/time-based work lives in BullMQ
// (scheduled-tasks); CPU-bound work goes straight to WorkerManager. There is no
// general-purpose fire-and-forget job queue.

// ── RPC Registry ────────────────────────────────────────────────────────────

const rpc = new Map<string, RpcHandler<unknown, unknown>>();

export function deregisterRpcHandler(action: string) {
  rpc.delete(action);
}

export function registerRpcHandler<TIn, TOut>(
  action: string,
  handler: RpcHandler<TIn, TOut>,
) {
  if (rpc.has(action)) {
    container.logger.warn(`[RPC] Overwriting existing handler: ${action}`);
  }
  rpc.set(action, handler as RpcHandler<unknown, unknown>);
}

async function dispatchRpc(req: RpcRequest): Promise<RpcResponse> {
  const handler = rpc.get(req.action);
  if (!handler)
    return { id: req.id, ok: false, error: `Missing action: ${req.action}` };

  if (
    req.guildId &&
    !(await container.db.config.isDashboardEnabled(req.guildId))
  ) {
    return { id: req.id, ok: false, error: "Dashboard disabled" };
  }

  // Continue the caller's trace (if any) and bind a request context.
  const parent = extractTraceContext({
    traceparent: req.traceparent,
    tracestate: req.tracestate,
  });

  return otelContext.with(parent, () =>
    runWithContext(
      {
        correlationId: req.id,
        source: "rpc",
        name: req.action,
        guildId: req.guildId,
        userId: req.actorId,
      },
      () =>
        withSpan(
          `rpc ${req.action}`,
          async () => {
            try {
              return { id: req.id, ok: true, data: await handler(req) };
            } catch (err: unknown) {
              logError(`RPC: ${req.action} error`, err);
              return {
                id: req.id,
                ok: false,
                error: errorFrom(err).message ?? "Internal error",
              };
            }
          },
          { kind: SpanKind.SERVER },
        ),
    ),
  );
}

function handleRpc(ch: Channel, msg: ConsumeMessage | null) {
  if (!msg) return;
  void (async () => {
    try {
      const body = JSON.parse(msg.content.toString());
      const req = { ...body, id: body.id ?? randomUUID() };
      const res = await dispatchRpc(req);

      if (msg.properties.replyTo) {
        ch.sendToQueue(
          msg.properties.replyTo,
          Buffer.from(JSON.stringify(res)),
          { correlationId: msg.properties.correlationId },
        );
      }
      ch.ack(msg);
    } catch (err: unknown) {
      logError("RabbitMQ: Failed to handle RPC message", err);
      ch.nack(msg, false, false);
    }
  })();
}

// ── Rabbit Client ───────────────────────────────────────────────────────────

export class RabbitClient {
  public readonly connection: AmqpConnectionManager;
  public readonly channel: ChannelWrapper;
  readonly #replies = new EventEmitter();
  #consumersEnabled = false;

  public constructor(url: string) {
    this.connection = amqp.connect([url]);
    this.channel = this.connection.createChannel({
      json: true,
      setup: (ch: Channel) => this.#setup(ch),
    });
    this.#replies.setMaxListeners(100);
  }

  public get connected() {
    return this.connection.isConnected();
  }

  public waitForConnect() {
    return this.channel.waitForConnect();
  }

  public startConsumers() {
    if (this.#consumersEnabled) return;
    this.#consumersEnabled = true;
    void this.channel.addSetup(async (ch: Channel) => {
      await ch.prefetch(8);

      // 1. Exclusive fanout queue for this shard/process to receive broadcasts
      const { queue: eventQueue } = await ch.assertQueue("", {
        exclusive: true,
      });
      await ch.bindQueue(eventQueue, "ember.events", "");
      await ch.consume(eventQueue, (m) => this.#handleEvent(ch, m));

      // 2. Shared RPC request queue (load balanced across processes)
      await ch.consume("ember.rpc.requests", (m) => handleRpc(ch, m));
    });
  }

  public publishEvent(event: string, payload: Record<string, unknown> = {}) {
    busEventsPublished.inc({ event });
    const carrier = injectTraceContext();
    return this.channel.publish(
      "ember.events",
      "",
      Buffer.from(
        JSON.stringify({
          event,
          ts: Date.now(),
          traceparent: carrier.traceparent,
          tracestate: carrier.tracestate,
          ...payload,
        }),
      ),
      { persistent: true },
    );
  }

  public onEvent(event: string, handler: (payload: unknown) => void) {
    this.#replies.on(`event:${event}`, handler);
  }

  public async close() {
    await this.channel
      .close()
      .catch((err: unknown) => logError("RabbitMQ: Channel close failed", err));
    await this.connection
      .close()
      .catch((err: unknown) =>
        logError("RabbitMQ: Connection close failed", err),
      );
  }

  #handleEvent(_ch: Channel, msg: ConsumeMessage | null) {
    if (!msg) return;
    try {
      const data = JSON.parse(msg.content.toString());
      if (!data.event) return;
      busEventsConsumed.inc({ event: data.event });

      const parent = extractTraceContext({
        traceparent: data.traceparent,
        tracestate: data.tracestate,
      });
      otelContext.with(parent, () => {
        void runWithContext(
          { correlationId: randomUUID(), source: "event", name: data.event },
          () =>
            withSpan(
              `event ${data.event}`,
              () => this.#replies.emit(`event:${data.event}`, data),
              { kind: SpanKind.CONSUMER },
            ),
        );
      });
    } catch (err: unknown) {
      logError("RabbitMQ: Event parse failed", err);
    }
  }

  async #setup(ch: Channel) {
    await Promise.all([
      ch.assertExchange("ember.events", "fanout", { durable: true }),
      ch.assertQueue("ember.rpc.requests", { durable: true }),
      ch.consume(
        "amq.rabbitmq.reply-to",
        (m) => {
          if (m?.properties.correlationId)
            this.#replies.emit(
              m.properties.correlationId,
              JSON.parse(m.content.toString()),
            );
        },
        { noAck: true },
      ),
    ]);
  }
}
