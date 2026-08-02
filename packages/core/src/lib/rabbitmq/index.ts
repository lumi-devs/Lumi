import amqp from "amqp-connection-manager";
import type {
  AmqpConnectionManager,
  ChannelWrapper,
} from "amqp-connection-manager";
import type { Channel, ConsumeMessage } from "amqplib";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { container } from "@sapphire/framework";
import { tryParseJSON } from "@sapphire/utilities";
import { SpanKind } from "@opentelemetry/api";
import {
  busEventsConsumed,
  busEventsPublished,
  extractTraceContext,
  injectTraceContext,
  otelContext,
  runWithContext,
  withSpan,
} from "@lumi/observability";
import { logError, errorFrom } from "#lib/utilities/errors.js";
import type { RpcRequest, RpcResponse, RpcHandler } from "@lumi/contracts";

export type { RpcRequest, RpcResponse, RpcHandler };

export const rpcHandlers = new Map<string, RpcHandler<unknown, unknown>>();

export function registerRpcHandler<TIn, TOut>(
  action: string,
  handler: RpcHandler<TIn, TOut>,
): void {
  rpcHandlers.set(action, handler as RpcHandler<unknown, unknown>);
}

export function deregisterRpcHandler(action: string) {
  rpcHandlers.delete(action);
}

async function dispatchRpc(req: RpcRequest<unknown>): Promise<RpcResponse<unknown>> {
  const handler = rpcHandlers.get(req.action);
  if (!handler) {
    return {
      id: req.id,
      ok: false,
      error: `No handler registered for action "${req.action}"`,
    };
  }

  if (
    req.guildId &&
    !(await container.db.config.isDashboardEnabled(req.guildId))
  ) {
    return { id: req.id, ok: false, error: "Dashboard disabled" };
  }

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
    const body = tryParseJSON(msg.content.toString()) as RpcRequest | null;
    if (!body?.action) {
      ch.nack(msg, false, false);
      return;
    }

    const req = { ...body, id: body.id ?? randomUUID() } as RpcRequest;
    let res: RpcResponse;
    try {
      res = await dispatchRpc(req);
    } catch (err: unknown) {
      logError("RabbitMQ: Failed to handle RPC message", err);
      res = {
        id: req.id,
        ok: false,
        error: errorFrom(err).message ?? "Internal error",
      };
    }

    if (msg.properties.replyTo) {
      ch.sendToQueue(
        msg.properties.replyTo,
        Buffer.from(JSON.stringify(res)),
        { correlationId: msg.properties.correlationId },
      );
    }
    ch.ack(msg);
  })();
}

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

  public startConsumers() {
    if (this.#consumersEnabled) return;
    this.#consumersEnabled = true;
    void this.channel.addSetup(async (ch: Channel) => {
      await ch.prefetch(8);

      const { queue: eventQueue } = await ch.assertQueue("", {
        exclusive: true,
      });
      await ch.bindQueue(eventQueue, "lumi.events", "");
      await ch.consume(eventQueue, (m) => this.#handleEvent(ch, m), {
        noAck: true,
      });

      await ch.consume("lumi.rpc.requests", (m) => handleRpc(ch, m));
    });
  }

  public async publishEvent(
    event: string,
    payload: Record<string, unknown> = {},
  ): Promise<boolean> {
    busEventsPublished.inc({ event });
    const carrier = injectTraceContext();
    try {
      await this.channel.publish(
        "lumi.events",
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
      return true;
    } catch (err: unknown) {
      logError(`RabbitMQ: publishEvent ${event} failed`, err);
      return false;
    }
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
      const data = tryParseJSON(msg.content.toString()) as Record<string, any> | null;
      if (!data?.event) return;
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
      ch.assertExchange("lumi.events", "fanout", { durable: true }),
      ch.assertQueue("lumi.rpc.requests", { durable: true }),
      ch.consume(
        "amq.rabbitmq.reply-to",
        (m) => {
          if (m?.properties.correlationId) {
            const parsed = tryParseJSON(m.content.toString());
            if (parsed !== null) {
              this.#replies.emit(m.properties.correlationId, parsed);
            }
          }
        },
        { noAck: true },
      ),
    ]);
  }
}
