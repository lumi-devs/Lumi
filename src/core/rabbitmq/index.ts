import amqp from "amqp-connection-manager";
import type {
  AmqpConnectionManager,
  ChannelWrapper,
} from "amqp-connection-manager";
import type { Channel, ConsumeMessage } from "amqplib";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { container } from "@sapphire/framework";
import { logError, errorFrom } from "#utilities/errors.js";

// ── Job Queue ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging: modules extend this interface
export interface EmberJobs {}
export type EmberJobData<T extends string> = T extends keyof EmberJobs
  ? EmberJobs[T]
  : Record<string, unknown>;

const jobs = new Map<
  string,
  { handler: (data: unknown) => Promise<void>; cpuBound: boolean }
>();

export function registerJobHandler<T extends string>(
  type: T,
  handler: (data: EmberJobData<T>) => Promise<void>,
  cpuBound = false,
) {
  if (jobs.has(type)) throw new Error(`[Jobs] Collision: ${type}`);
  jobs.set(type, {
    handler: handler as (data: unknown) => Promise<void>,
    cpuBound,
  });
}

export async function enqueueJob<T extends string>(
  type: T,
  data: EmberJobData<T>,
  delayMs?: number,
) {
  const { rabbit } = container;
  if (!rabbit) throw new Error("[Jobs] RabbitMQ disconnected");

  const payload = { type, data };
  if (delayMs && delayMs > 0) {
    await rabbit.channel.sendToQueue("ember.jobs.delayed", payload, {
      expiration: String(delayMs),
      persistent: true,
    });
  } else {
    await rabbit.channel.publish("ember.jobs", "active", payload, {
      persistent: true,
    });
  }
}

function handleJob(ch: Channel, msg: ConsumeMessage | null) {
  if (!msg) return;
  void (async () => {
    try {
      const { type, data } = JSON.parse(msg.content.toString());
      const reg = jobs.get(type);
      if (!reg) return ch.nack(msg, false, false);

      if (reg.cpuBound) {
        await container.workers.send(type, data);
      } else {
        const timeout = 30_000;
        await Promise.race([
          reg.handler(data),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), timeout),
          ),
        ]);
      }
      ch.ack(msg);
    } catch (err: unknown) {
      logError(`Jobs: ${msg.fields.routingKey} failed`, err);
      ch.nack(msg, false, !msg.fields.redelivered);
    }
  })();
}

// ── RPC Registry ────────────────────────────────────────────────────────────

export interface RpcRequest<T = unknown> {
  id: string;
  action: string;
  guildId?: string;
  actorId?: string;
  data?: T;
}
export interface RpcResponse<T = unknown> {
  id: string;
  ok: boolean;
  data?: T;
  error?: string;
}
export type RpcHandler<TIn = unknown, TOut = unknown> = (
  req: RpcRequest<TIn>,
) => Promise<TOut> | TOut;

const rpc = new Map<string, RpcHandler<unknown, unknown>>();

export function registerRpcHandler<TIn, TOut>(
  action: string,
  handler: RpcHandler<TIn, TOut>,
) {
  if (rpc.has(action)) throw new Error(`[RPC] Collision: ${action}`);
  rpc.set(action, handler as RpcHandler<unknown, unknown>);
}

async function dispatchRpc(req: RpcRequest): Promise<RpcResponse> {
  const handler = rpc.get(req.action);
  if (!handler)
    return { id: req.id, ok: false, error: `Missing action: ${req.action}` };

  if (req.guildId && !(await container.db.isDashboardEnabled(req.guildId))) {
    return { id: req.id, ok: false, error: "Dashboard disabled" };
  }

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
}

function handleRpc(ch: Channel, msg: ConsumeMessage | null) {
  if (!msg) return;
  void (async () => {
    try {
      const body = JSON.parse(msg.content.toString());
      const req = { id: body.id ?? randomUUID(), ...body };
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
  private readonly _replies = new EventEmitter();
  private _consumersEnabled = false;

  public constructor(url: string) {
    this.connection = amqp.connect([url]);
    this.channel = this.connection.createChannel({
      json: true,
      setup: (ch: Channel) => this._setup(ch),
    });
    this._replies.setMaxListeners(0);
  }

  public get connected() {
    return this.connection.isConnected();
  }

  public waitForConnect() {
    return this.channel.waitForConnect();
  }

  public startConsumers() {
    if (this._consumersEnabled) return;
    this._consumersEnabled = true;
    void this.channel.addSetup(async (ch: Channel) => {
      await ch.prefetch(8);

      // 1. Exclusive fanout queue for this shard/process to receive broadcasts
      const { queue: eventQueue } = await ch.assertQueue("", {
        exclusive: true,
      });
      await ch.bindQueue(eventQueue, "ember.events", "");
      await ch.consume(eventQueue, (m) => this._handleEvent(ch, m));

      // 2. Shared queues (load balanced)
      await ch.consume("ember.rpc.requests", (m) => handleRpc(ch, m));
      await ch.consume("ember.jobs.active", (m) => handleJob(ch, m));
    });
  }

  public publishEvent(event: string, payload: Record<string, unknown> = {}) {
    return this.channel.publish(
      "ember.events",
      "",
      Buffer.from(JSON.stringify({ event, ts: Date.now(), ...payload })),
      { persistent: true },
    );
  }

  public onEvent(event: string, handler: (payload: unknown) => void) {
    this._replies.on(`event:${event}`, handler);
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

  private _handleEvent(_ch: Channel, msg: ConsumeMessage | null) {
    if (!msg) return;
    try {
      const data = JSON.parse(msg.content.toString());
      if (data.event) {
        this._replies.emit(`event:${data.event}`, data);
      }
    } catch (err: unknown) {
      logError("RabbitMQ: Event parse failed", err);
    }
  }

  private async _setup(ch: Channel) {
    await Promise.all([
      ch.assertExchange("ember.events", "fanout", { durable: true }),
      ch.assertQueue("ember.rpc.requests", { durable: true }),
      ch.assertExchange("ember.jobs", "direct", { durable: true }),
      ch.assertQueue("ember.jobs.active", {
        durable: true,
        arguments: { "x-dead-letter-exchange": "ember.dlx" },
      }),
      ch.bindQueue("ember.jobs.active", "ember.jobs", "active"),
      ch.assertQueue("ember.jobs.delayed", {
        durable: true,
        arguments: {
          "x-dead-letter-exchange": "ember.jobs",
          "x-dead-letter-routing-key": "active",
        },
      }),
      ch.consume(
        "amq.rabbitmq.reply-to",
        (m) => {
          if (m?.properties.correlationId)
            this._replies.emit(
              m.properties.correlationId,
              JSON.parse(m.content.toString()),
            );
        },
        { noAck: true },
      ),
    ]);
  }
}
