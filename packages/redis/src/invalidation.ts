import type Redis from "ioredis";

export interface InvalidationMessage {
  namespace: string;
  keys: string[];
  timestamp: number;
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
  private readonly localListeners = new Map<string, Set<(keys: string[]) => void>>();
  private readonly channel = "lumi:invalidation";
  private resyncCallbacks: (() => void)[] = [];
  private hasConnected = false;

  constructor(redis: Redis) {
    // The publisher is the shared cache client; only the subscriber needs its
    // own connection because ioredis puts a subscribed connection into
    // subscriber mode.
    this.publisher = redis;
    this.subscriber = redis.duplicate();
    this.setupSubscriber();
  }

  private setupSubscriber(): void {
    this.subscriber.on("ready", () => {
      // The first ready is the initial connect (ioredis re-subscribes
      // automatically on reconnect); a later ready means local L1 state may
      // have missed messages while the connection was down.
      if (this.hasConnected) this.signalResync();
      else this.hasConnected = true;
    });

    this.subscriber
      .subscribe(this.channel)
      .catch((error: unknown) =>
        console.error("invalidation subscribe failed", { error }),
      );

    this.subscriber.on("message", (channel, message) => {
      if (channel !== this.channel) return;
      try {
        const parsed: unknown = JSON.parse(message);
        if (isInvalidationMessage(parsed)) this.handleInvalidation(parsed);
      } catch (error) {
        console.error("invalidation message parse failed", { error });
      }
    });
  }

  private signalResync(): void {
    const callbacks = this.resyncCallbacks;
    this.resyncCallbacks = [];
    for (const callback of callbacks) callback();
  }

  private handleInvalidation(msg: InvalidationMessage): void {
    const listeners = new Set<(keys: string[]) => void>([
      ...(this.localListeners.get(msg.namespace) ?? []),
      // Global listeners (e.g. the L1 cache) observe every namespace.
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

    // Notify local listeners first so the writer's L1 never serves the value
    // it just invalidated.
    this.handleInvalidation(message);

    await this.publisher.publish(this.channel, JSON.stringify(message));
  }

  onResync(): Promise<void> {
    return new Promise((resolve) => {
      this.resyncCallbacks.push(resolve);
    });
  }

  async close(): Promise<void> {
    await this.subscriber.unsubscribe(this.channel);
    // The publisher is owned by the caller; only the subscriber is ours.
    await this.subscriber.quit();
  }
}
