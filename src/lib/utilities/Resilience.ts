import { sleep } from "@sapphire/utilities";

export class TimeoutError extends Error {
  public constructor(ms: number) {
    super(`Timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = new AbortController();
  const deadline = sleep(ms, undefined, { signal: timer.signal }).then<never>(
    () => {
      const reason = new TimeoutError(ms);
      queueMicrotask(() => controller.abort(reason));
      throw reason;
    },
  );
  let task: Promise<T>;
  try {
    task = fn(controller.signal);
  } catch (err) {
    timer.abort();
    await deadline.catch(() => undefined);
    throw err;
  }
  try {
    return await Promise.race([task, deadline]);
  } finally {
    timer.abort();
  }
}

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {

  name?: string;

  failureThreshold: number;

  cooldownMs: number;
}

export class CircuitBreakerOpenError extends Error {
  public constructor(name: string) {
    super(`Circuit breaker "${name}" is open`);
    this.name = "CircuitBreakerOpenError";
  }
}

export class CircuitBreaker {
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private state: CircuitState = "closed";
  private consecutiveFailures = 0;
  private openedAt = 0;
  private halfOpenProbeInFlight = false;

  public constructor(options: CircuitBreakerOptions) {
    this.name = options.name ?? "circuit-breaker";
    this.failureThreshold = options.failureThreshold;
    this.cooldownMs = options.cooldownMs;
  }

  public getState(): CircuitState {
    if (
      this.state === "open" &&
      Date.now() - this.openedAt >= this.cooldownMs
    ) {
      this.state = "half-open";
      this.halfOpenProbeInFlight = false;
    }
    return this.state;
  }

  public async run<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.getState();

    if (state === "open") {
      throw new CircuitBreakerOpenError(this.name);
    }

    if (state === "half-open") {
      if (this.halfOpenProbeInFlight) {
        throw new CircuitBreakerOpenError(this.name);
      }
      this.halfOpenProbeInFlight = true;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    } finally {
      this.halfOpenProbeInFlight = false;
    }
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = "closed";
  }

  private onFailure(): void {
    if (this.state === "half-open") {
      this.trip();
      return;
    }
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.trip();
    }
  }

  private trip(): void {
    this.state = "open";
    this.openedAt = Date.now();
    this.consecutiveFailures = 0;
  }
}
