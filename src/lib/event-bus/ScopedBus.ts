import type { Container } from "#src/lib/Services.js";
import type {
  BusMessage,
  ConsumeOptions,
  PublishOptions,
} from "#src/lib/event-bus/Types.js";

export interface ScopedBus {
  publish<T>(
    stream: string,
    body: T,
    opts?: PublishOptions,
  ): Promise<string>;
  subscribe<T>(
    streams: readonly string[],
    opts: ConsumeOptions,
    handler: (msg: BusMessage<T>) => Promise<void>,
  ): Promise<void>;
}

const trackedSubscriptions = new Map<string, Set<() => Promise<void>>>();

export function scopedEventBus(
  services: Container,
  moduleName: string,
): ScopedBus {
  return {
    publish: <T>(
      stream: string,
      body: T,
      opts?: PublishOptions,
    ): Promise<string> =>
      opts === undefined
        ? services.eventBus.publish(stream, body)
        : services.eventBus.publish(stream, body, opts),
    subscribe: async <T>(
      streams: readonly string[],
      opts: ConsumeOptions,
      handler: (msg: BusMessage<T>) => Promise<void>,
    ): Promise<void> => {
      const stop = await services.eventBus.consume(streams, opts, handler);
      let set = trackedSubscriptions.get(moduleName);
      if (!set) {
        set = new Set();
        trackedSubscriptions.set(moduleName, set);
      }
      set.add(stop);
    },
  };
}

export async function detachScopedBus(moduleName: string): Promise<void> {
  const set = trackedSubscriptions.get(moduleName);
  if (!set) return;
  trackedSubscriptions.delete(moduleName);
  await Promise.allSettled(Array.from(set, (stop) => stop()));
}
