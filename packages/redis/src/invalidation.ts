import type { Logger } from "@lumi/foundation";
import type { RedisClient } from "./client.ts";

export interface InvalidationPort {
  invalidate(...keys: string[]): Promise<void>;
  onInvalidate(listener: (keys: readonly string[]) => void): () => void;
  onResync(listener: () => void): () => void;
  start(): Promise<void>;
  close(): Promise<void>;
}

const Channel = "lumi:cache:invalidate";
const ChunkSize = 500;

interface Payload {
  keys: string[];
  time: number;
}

export interface InvalidationBusOptions {
  publisher: RedisClient;
  subscriber: RedisClient;
  logger: Logger;
}

export class InvalidationBus implements InvalidationPort {
  readonly #publisher: RedisClient;
  readonly #subscriber: RedisClient;
  readonly #logger: Logger;
  readonly #listeners = new Set<(keys: readonly string[]) => void>();
  readonly #resync = new Set<() => void>();
  #started = false;
  #startPromise: Promise<void> | null = null;
  #dropped = false;
  #lastTime = 0;

  public constructor(options: InvalidationBusOptions) {
    this.#publisher = options.publisher;
    this.#subscriber = options.subscriber;
    this.#logger = options.logger;
  }

  public onInvalidate(listener: (keys: readonly string[]) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  public onResync(listener: () => void): () => void {
    this.#resync.add(listener);
    return () => this.#resync.delete(listener);
  }

  public start(): Promise<void> {
    if (this.#started) return Promise.resolve();
    this.#startPromise ??= this.#startInternal().finally(() => {
      this.#startPromise = null;
    });
    return this.#startPromise;
  }

  public async invalidate(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const unique = [...new Set(keys)];
    for (let index = 0; index < unique.length; index += ChunkSize) {
      await this.#invalidateChunk(unique.slice(index, index + ChunkSize));
    }
  }

  public async close(): Promise<void> {
    if (this.#started) {
      await this.#subscriber.unsubscribe(Channel).catch((error: unknown) => {
        this.#logger.warn({ error }, "redis invalidation unsubscribe failed");
      });
      this.#started = false;
    }
    this.#subscriber.removeAllListeners("message");
    this.#subscriber.removeAllListeners("close");
    this.#subscriber.removeAllListeners("ready");
    this.#listeners.clear();
    this.#resync.clear();
    await this.#subscriber.quit().catch(() => undefined);
  }

  async #startInternal(): Promise<void> {
    this.#subscriber.on("message", this.#onMessage);
    this.#subscriber.on("close", this.#onClose);
    this.#subscriber.on("ready", this.#onReady);
    await this.#subscriber.subscribe(Channel);
    this.#started = true;
  }

  async #invalidateChunk(keys: string[]): Promise<void> {
    const time = Date.now();
    this.#lastTime = Math.max(this.#lastTime, time);
    this.#notify(keys);

    await this.#publisher.del(...keys).catch((error: unknown) => {
      this.#logger.error({ error, keys: keys.length }, "redis cache delete failed");
    });

    const payload: Payload = { keys, time };
    await this.#publisher.publish(Channel, JSON.stringify(payload)).catch((error: unknown) => {
      this.#logger.error({ error, keys: keys.length }, "redis invalidate publish failed");
    });
  }

  #notify(keys: readonly string[]): void {
    for (const listener of this.#listeners) {
      try {
        listener(keys);
      } catch (error) {
        this.#logger.error({ error }, "cache invalidation listener failed");
      }
    }
  }

  #onMessage = (_channel: string, raw: string): void => {
    let payload: Payload;
    try {
      payload = JSON.parse(raw) as Payload;
    } catch {
      return;
    }
    if (!Array.isArray(payload.keys)) return;
    this.#lastTime = Math.max(this.#lastTime, payload.time);
    const keys = payload.keys.filter((key): key is string => typeof key === "string" && key.length > 0);
    if (keys.length > 0) this.#notify(keys);
  };

  #onClose = (): void => {
    if (this.#started) this.#dropped = true;
  };

  #onReady = (): void => {
    if (!this.#dropped) return;
    this.#dropped = false;
    this.#publisher
      .publish(Channel, JSON.stringify({ keys: [], time: this.#lastTime }))
      .catch(() => undefined);
    for (const listener of this.#resync) {
      try {
        listener();
      } catch (error) {
        this.#logger.error({ error }, "cache resync listener failed");
      }
    }
  };
}
