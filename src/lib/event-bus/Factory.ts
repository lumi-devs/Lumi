import type { EventBus, BusMessage, PublishOptions, ConsumeOptions } from "#src/lib/event-bus/Types.js";

type Handler = (msg: BusMessage<any>) => Promise<void>;

export class LocalEventBus implements EventBus {
  readonly #listeners = new Map<string, Set<Handler>>();

  public async publish<T>(stream: string, body: T, _opts?: PublishOptions): Promise<string> {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const handlers = this.#listeners.get(stream);
    if (handlers) {
      const msg: BusMessage<T> = {
        id,
        body,
        deliveryCount: 1,
        ack: async () => {},
        nack: async () => {},
      };
      for (const h of handlers) {
        queueMicrotask(() => h(msg).catch(() => {}));
      }
    }
    return id;
  }

  public async consume<T>(
    streams: readonly string[],
    _opts: ConsumeOptions,
    handler: (msg: BusMessage<T>) => Promise<void>,
  ): Promise<() => Promise<void>> {
    for (const s of streams) {
      let set = this.#listeners.get(s);
      if (!set) {
        set = new Set();
        this.#listeners.set(s, set);
      }
      set.add(handler as Handler);
    }
    return async () => {
      for (const s of streams) {
        this.#listeners.get(s)?.delete(handler as Handler);
      }
    };
  }

  public async destroyGroup(_stream: string, _group: string): Promise<void> {}

  public async close(): Promise<void> {
    this.#listeners.clear();
  }
}

export interface OwnedEventBus {
  bus: EventBus;
  publisher: any;
  close: () => Promise<void>;
}

export function createEventBus(_opts: any = {}): OwnedEventBus {
  const bus = new LocalEventBus();
  return {
    bus,
    publisher: null,
    close: async () => bus.close(),
  };
}
