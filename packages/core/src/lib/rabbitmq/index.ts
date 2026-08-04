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

/**
 * Handles a single RPC request end-to-end: parse, dispatch, reply, ack.
 *
 * @remarks
 *
 * Callers are expected to track the returned promise (see
 * {@linkcode RabbitClient.startConsumers}) so shutdown can drain in-flight
 * calls before the channel is closed. The `ch.sendToQueue`/`ch.ack`/`ch.nack`
 * calls are wrapped in their own try/catch because a SIGTERM racing this
 * function can close the channel mid-flight - without the catch, that throw
 * would surface as an unhandled rejection on the detached consumer callback.
 */
async function handleRpc(ch: Channel, msg: ConsumeMessage): Promise<void> {
  const body = tryParseJSON(msg.content.toString()) as RpcRequest | null;
  if (!body?.action) {
    try {
      ch.nack(msg, false, false);
    } catch (err: unknown) {
      logError("RabbitMQ: Failed to nack malformed RPC message", err);
    }
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

  try {
    if (msg.properties.replyTo) {
      ch.sendToQueue(
        msg.properties.replyTo,
        Buffer.from(JSON.stringify(res)),
        { correlationId: msg.properties.correlationId },
      );
    }
    ch.ack(msg);
  } catch (err: unknown) {
    // The channel is most likely closing (shutdown in progress). The message
    // stays unacked and RabbitMQ will redeliver it to another consumer -
    // log rather than let this become an unhandled rejection.
    logError("RabbitMQ: Failed to reply/ack RPC message", err);
  }
}

export class RabbitClient {
  public readonly connection: AmqpConnectionManager;
  public readonly channel: ChannelWrapper;
  readonly #replies = new EventEmitter();
  #consumersEnabled = false;
  /**
   * RPC handler calls currently in flight. `close()` drains this (with a
   * timeout) before closing the channel so shutdown doesn't abandon an
   * in-progress ack/reply, which would otherwise both throw on the closed
   * channel and cause the message to be redelivered after already running.
   */
  readonly #inFlightRpc = new Set<Promise<void>>();

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

      await ch.consume("lumi.rpc.requests", (m) => this.#trackRpc(ch, m));
    });
  }

  /**
   * Runs {@linkcode handleRpc} and tracks its promise in {@linkcode #inFlightRpc}
   * for the lifetime of the call, so {@linkcode close} can wait for it. The
   * `.catch` here is a second line of defense on top of `handleRpc`'s own
   * try/catch - it guarantees this fire-and-forget call can never produce an
   * unhandled rejection even if something unexpected slips past it.
   */
  #trackRpc(ch: Channel, msg: ConsumeMessage | null): void {
    if (!msg) return;
    const promise = handleRpc(ch, msg).catch((err: unknown) => {
      logError("RabbitMQ: Unhandled failure while handling RPC message", err);
    });
    this.#inFlightRpc.add(promise);
    void promise.finally(() => this.#inFlightRpc.delete(promise));
  }

  /**
   * Waits for all in-flight {@linkcode handleRpc} calls to settle, up to
   * `timeoutMs`. Used by {@linkcode close} to drain rather than abandon
   * in-progress RPC work before the channel goes away. Never hangs forever -
   * if the timeout elapses, we log and proceed with the close anyway.
   */
  async #drainInFlightRpc(timeoutMs = 5_000): Promise<void> {
    if (this.#inFlightRpc.size === 0) return;
    const pending = [...this.#inFlightRpc];
    const timedOut = Symbol("rpc-drain-timeout");
    const result = await Promise.race([
      Promise.allSettled(pending).then(() => undefined),
      new Promise((resolve) => setTimeout(() => resolve(timedOut), timeoutMs)),
    ]);
    if (result === timedOut) {
      logError(
        "RabbitMQ: Timed out draining in-flight RPC handlers before close",
        new Error(`${pending.length} handler(s) still in flight after ${timeoutMs}ms`),
      );
    }
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
    await this.#drainInFlightRpc();
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
