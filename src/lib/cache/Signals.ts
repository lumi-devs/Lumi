import { EventEmitter } from "node:events";

class InvalidationEmitter extends EventEmitter {
  public onInvalidate(fn: (keys: string[]) => void): () => void {
    this.on("invalidate", fn);
    return () => this.off("invalidate", fn);
  }

  public onResync(_fn: () => void | Promise<void>): () => void {
    return () => {};
  }

  public invalidate(...keys: string[]): void {
    if (keys.length > 0) {
      this.emit("invalidate", keys);
    }
  }
}

class SignalEmitter extends EventEmitter {
  public onSignal(fn: (topic: string, payload: Record<string, string | number>) => void): () => void {
    this.on("signal", fn);
    return () => this.off("signal", fn);
  }

  public publish(topic: string, payload: Record<string, string | number>): void {
    this.emit("signal", topic, payload);
  }
}

export const invalidationBus = new InvalidationEmitter();
export const signalBus = new SignalEmitter();
