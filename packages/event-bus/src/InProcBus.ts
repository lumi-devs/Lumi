// In-process event bus for monolith transport (TRANSPORT=inproc) and testing.
// Synchronously fans out published events to registered consumers.

import { EventEmitter } from "node:events";
import type {
  BusMessage,
  ConsumeOptions,
  EventBus,
  PublishOptions,
} from "./types.js";

export class InProcBus implements EventBus {
  private nextSeq = 0;
  private readonly emitter = new EventEmitter();
  private closed = false;

  public constructor() {
    // Per-stream there can legitimately be many consumers (gateway publisher
    // emits one packet → multiple worker shards listening). Don't warn on >10.
    this.emitter.setMaxListeners(0);
  }

  public publish<T>(
    stream: string,
    body: T,
    _opts?: PublishOptions,
  ): Promise<string> {
    if (this.closed) return Promise.reject(new Error("InProcBus closed"));
    const id = `${Date.now()}-${this.nextSeq++}`;
    this.emitter.emit(stream, id, body);
    return Promise.resolve(id);
  }

  public consume<T>(
    streams: readonly string[],
    _opts: ConsumeOptions,
    handler: (msg: BusMessage<T>) => Promise<void>,
  ): Promise<() => Promise<void>> {
    const listeners: Array<[string, (...args: unknown[]) => void]> = [];
    for (const stream of streams) {
      const fn = (id: unknown, body: unknown) => {
        const msg: BusMessage<T> = {
          id: id as string,
          body: body as T,
          deliveryCount: 1,
          ack: () => Promise.resolve(),
          nack: () => Promise.resolve(),
        };
        // Fire and forget; handler errors logged by the caller's try/catch
        // (InProcBus has no DLQ — that's a streams-only concern).
        void handler(msg).catch(() => undefined);
      };
      this.emitter.on(stream, fn);
      listeners.push([stream, fn]);
    }
    return Promise.resolve(() => {
      for (const [stream, fn] of listeners) this.emitter.off(stream, fn);
      return Promise.resolve();
    });
  }

  public close(): Promise<void> {
    this.closed = true;
    this.emitter.removeAllListeners();
    return Promise.resolve();
  }
}
