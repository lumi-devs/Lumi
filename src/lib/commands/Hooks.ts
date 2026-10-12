import type { CommandContext } from "#src/lib/commands/Context.js";
import type { Container } from "#src/lib/Services.js";
import type {
  BusMessage,
  ConsumeOptions,
  PublishOptions,
} from "#src/lib/event-bus/Types.js";

export interface BeforeInvokeDenial {
  reason: string;
}

export type BeforeInvokeHook = (
  ctx: CommandContext,
) => BeforeInvokeDenial | null | Promise<BeforeInvokeDenial | null>;

const beforeInvokeHooks = new Map<string, BeforeInvokeHook>();

export function addBeforeInvokeHook(name: string, fn: BeforeInvokeHook): void {
  beforeInvokeHooks.set(name, fn);
}

export function removeBeforeInvokeHook(name: string): boolean {
  return beforeInvokeHooks.delete(name);
}

export async function runBeforeInvokeHooks(
  ctx: CommandContext,
): Promise<BeforeInvokeDenial | null> {
  for (const fn of beforeInvokeHooks.values()) {
    const denial = await fn(ctx);
    if (denial) return denial;
  }
  return null;
}

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
