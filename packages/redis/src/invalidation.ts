import Redis from "ioredis";

export interface InvalidationMessage {
  namespace: string;
  keys: string[];
  timestamp: number;
}

export class InvalidationBus {
  private readonly redis: Redis;
  private readonly subscriber: Redis;
  private readonly publisher: Redis;
  private readonly localListeners = new Map<string, Set<(keys: string[]) => void>>();
  private readonly channel = "lumi:invalidation";
  private resyncCallbacks: (() => void)[] = [];

  constructor(redis: Redis) {
    this.redis = redis;
    this.subscriber = redis.duplicate();
    this.publisher = redis.duplicate();
    this.setupSubscriber();
  }

  private setupSubscriber(): void {
    this.subscriber.subscribe(this.channel);
    this.subscriber.on("message", (channel, message) => {
      if (channel !== this.channel) return;
      try {
        const msg: InvalidationMessage = JSON.parse(message);
        this.handleInvalidation(msg);
      } catch (e) {
        // Ignore malformed messages
      }
    });
  }

  private handleInvalidation(msg: InvalidationMessage): void {
    const listeners = this.localListeners.get(msg.namespace);
    if (listeners) {
      for (const listener of listeners) {
        listener(msg.keys);
      }
    }
    // Also trigger global listeners
    const globalListeners = this.localListeners.get("");
    if (globalListeners) {
      for (const listener of globalListeners) {
        listener(msg.keys);
      }
    }
  }

  subscribe(namespace: string, listener: (keys: string[]) => void): () => void {
    if (!this.localListeners.has(namespace)) {
      this.localListeners.set(namespace, new Set());
    }
    this.localListeners.get(namespace)!.add(listener);
    
    return () => {
      this.localListeners.get(namespace)?.delete(listener);
    };
  }

  async invalidate(namespace: string, keys: string[]): Promise<void> {
    const message: InvalidationMessage = {
      namespace,
      keys,
      timestamp: Date.now(),
    };
    
    // Notify local listeners first
    this.handleInvalidation(message);
    
    // Then publish to other processes
    await this.publisher.publish(this.channel, JSON.stringify(message));
  }

  onResync(): Promise<void> {
    return new Promise((resolve) => {
      this.resyncCallbacks.push(resolve);
    });
  }

  triggerResync(): void {
    for (const cb of this.resyncCallbacks) {
      cb();
    }
    this.resyncCallbacks = [];
  }

  async close(): Promise<void> {
    await this.subscriber.unsubscribe(this.channel);
    await this.subscriber.quit();
    await this.publisher.quit();
  }
}