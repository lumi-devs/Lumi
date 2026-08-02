import "server-only";
import amqp, {
  type AmqpConnectionManager,
  type ChannelWrapper,
} from "amqp-connection-manager";
import type { Channel, ConsumeMessage } from "amqplib";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type {
  RpcRequest,
  RpcResponse,
  RpcActionName,
  RpcRequestPayloads,
} from "@lumi/contracts";
import { env } from "./env";

const RPC_QUEUE = "lumi.rpc.requests";
const REPLY_QUEUE = "amq.rabbitmq.reply-to";
const DEFAULT_TIMEOUT_MS = 8000;

interface CallOptions<A extends RpcActionName> {
  guildId?: string;
  actorId?: string;
  data?: RpcRequestPayloads[A];
  timeoutMs?: number;
}

/**
 * Request/response client for the bot's RabbitMQ RPC bridge — ported
 * unchanged from the old `apps/dashboard/src/rpc.ts` (Bun.serve app). Uses
 * RabbitMQ's direct reply-to pseudo-queue so no per-call reply queue is
 * created; responses are correlated by id.
 *
 * This module is `server-only` and must be reached exclusively from Server
 * Components, Route Handlers, or Server Actions — the dashboard never talks
 * to Postgres directly and never bundles amqplib to the client (see
 * dashboard.md §1: decoupled async RPC architecture stays, only the frontend
 * framework changed).
 */
export class RpcClient {
  readonly #connection: AmqpConnectionManager;
  readonly #channel: ChannelWrapper;
  readonly #replies = new EventEmitter();

  public constructor(
    url: string,
    private readonly log: (msg: string) => void = () => {},
  ) {
    this.#replies.setMaxListeners(0);
    this.#connection = amqp.connect([url]);
    this.#channel = this.#connection.createChannel({
      json: false,
      setup: (ch: Channel) => this.#setup(ch),
    });
  }

  public get connected(): boolean {
    return this.#connection.isConnected();
  }

  public waitForConnect(): Promise<void> {
    return this.#channel.waitForConnect();
  }

  public async call<A extends RpcActionName>(
    action: A,
    options: CallOptions<A> = {},
  ): Promise<RpcResponse["data"]> {
    const id = randomUUID();
    const request: RpcRequest = {
      id,
      action,
      guildId: options.guildId,
      actorId: options.actorId,
      data: options.data,
    };

    const response = await new Promise<RpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#replies.off(id, onReply);
        reject(new Error(`RPC timed out: ${action}`));
      }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

      const onReply = (res: RpcResponse) => {
        clearTimeout(timer);
        resolve(res);
      };

      this.#replies.once(id, onReply);
      this.#channel
        .sendToQueue(RPC_QUEUE, Buffer.from(JSON.stringify(request)), {
          correlationId: id,
          replyTo: REPLY_QUEUE,
        })
        .catch((err: unknown) => {
          clearTimeout(timer);
          this.#replies.off(id, onReply);
          reject(err instanceof Error ? err : new Error(String(err)));
        });
    });

    if (!response.ok) throw new Error(response.error ?? "RPC error");
    return response.data;
  }

  public async close(): Promise<void> {
    await this.#channel.close().catch(() => {});
    await this.#connection.close().catch(() => {});
  }

  async #setup(ch: Channel): Promise<void> {
    await ch.assertQueue(RPC_QUEUE, { durable: true });
    await ch.consume(
      REPLY_QUEUE,
      (msg: ConsumeMessage | null) => {
        if (!msg?.properties.correlationId) return;
        try {
          this.#replies.emit(
            msg.properties.correlationId,
            JSON.parse(msg.content.toString()) as RpcResponse,
          );
        } catch (err: unknown) {
          this.log(`Discarding undecodable RPC reply: ${String(err)}`);
        }
      },
      { noAck: true },
    );
  }
}

// Next.js has no long-lived `main.ts` bootstrap — Route Handlers, Server
// Components, and Server Actions are all invoked ad hoc by the framework, so
// the RPC connection has to be a lazily-created module-scope singleton
// instead of something wired up once at process start. `globalThis` caching
// avoids spawning a fresh AMQP connection on every hot-reload in `next dev`
// (same trick commonly used for a Prisma client singleton in Next.js apps).
const globalForRpc = globalThis as unknown as { rpcClient?: RpcClient };

export function getRpcClient(): RpcClient {
  if (!globalForRpc.rpcClient) {
    globalForRpc.rpcClient = new RpcClient(env.rabbitUrl, (msg) => {
      if (process.env["NODE_ENV"] === "development") console.debug(msg);
    });
  }
  return globalForRpc.rpcClient;
}

/** Convenience wrapper: `rpcCall("guild.config.set", { guildId, data })`. */
export function rpcCall<A extends RpcActionName>(
  action: A,
  options?: CallOptions<A>,
): Promise<RpcResponse["data"]> {
  return getRpcClient().call(action, options);
}
