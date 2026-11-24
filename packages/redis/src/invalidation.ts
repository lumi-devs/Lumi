import { logger } from "@lumi/foundation";
import type Redis from "ioredis";

export interface InvalidationMessage {
  readonly namespace: string;
  readonly keys: string[];
  readonly timestamp: number;
}

function isInvalidationMessage(value: unknown): value is InvalidationMessage {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as {
    namespace?: unknown;
    keys?: unknown;
    timestamp?: unknown;
  };
  return (
    typeof candidate.namespace === "string" &&
    Array.isArray(candidate.keys) &&
    candidate.keys.every((key) => typeof key === "string") &&
    typeof candidate.timestamp === "number"
  );
}

export class InvalidationBus {
  private readonly subscriber: Redis;
  private readonly publisher: Redis;
  private readonly localListeners = new Map<
    string,
    Set<(keys: string[]) => void>
  >();
  private readonly channel = "lumi:invalidation";
  private readonly resyncListeners: Set<() => void> = new Set();
  private hasConnected = false;

  constructor(redis: Redis) {
    this.publisher = redis;
    this.subscriber = redis.duplicate();
    this.subscriber.on("error", (error: unknown) => {
      logger.error("invalidation subscriber error", { error });
    });
    this.setupSubscriber();
  }

  private setupSubscriber(): void {
    this.subscriber.on("ready", () => {
      if (this.hasConnected) this.signalResync();
      else this.hasConnected = true;
    });

    this.subscriber
      .subscribe(this.channel)
      .catch((error: unknown) =>
        logger.error("invalidation subscribe failed", { error }),
      );

    this.subscriber.on("message", (channel, message) => {
      if (channel !== this.channel) return;
      try {
        const parsed: unknown = JSON.parse(message);
        if (isInvalidationMessage(parsed)) this.handleInvalidation(parsed);
      } catch (error) {
        logger.error("invalidation message parse failed", { error });
      }
    });
  }

  private signalResync(): void {
    for (const listener of this.resyncListeners) {
      try {
        listener();
      } catch (error) {
        logger.error("invalidation listener resync failed", { error });
      }
    }
  }

  private handleInvalidation(msg: InvalidationMessage): void {
    const listeners = new Set<(keys: string[]) => void>([
      ...(this.localListeners.get(msg.namespace) ?? []),

      ...(this.localListeners.get("") ?? []),
    ]);
    for (const listener of listeners) {
      listener(msg.keys);
    }
  }

  subscribe(namespace: string, listener: (keys: string[]) => void): () => void {
    let listeners = this.localListeners.get(namespace);
    if (!listeners) {
      listeners = new Set();
      this.localListeners.set(namespace, listeners);
    }
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }

  async invalidate(namespace: string, keys: string[]): Promise<void> {
    const message: InvalidationMessage = {
      namespace,
      keys,
      timestamp: Date.now(),
    };

    this.handleInvalidation(message);

    await this.publisher.publish(this.channel, JSON.stringify(message));
  }

  onResync(listener: () => void): () => void {
    this.resyncListeners.add(listener);
    return () => {
      this.resyncListeners.delete(listener);
    };
  }

  async close(): Promise<void> {
    await this.subscriber.unsubscribe(this.channel);

    await this.subscriber.quit();
  }
}
