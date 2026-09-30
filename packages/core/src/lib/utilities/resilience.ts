/** Thrown by {@linkcode withTimeout} when `fn` doesn't settle within `ms`. */
export class TimeoutError extends Error {
  public constructor(ms: number) {
    super(`Timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Races `fn` against a deadline, aborting it via `AbortSignal` on timeout so
 * `fn` gets a chance to cancel its own in-flight work (e.g. pass the signal
 * to `fetch`) instead of merely being abandoned by the caller.
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError(ms));
      controller.abort(new TimeoutError(ms));
    }, ms);
  });

  try {
    return await Promise.race([fn(controller.signal), deadline]);
  } finally {
    clearTimeout(timer!);
  }
}

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  /** Identifies this breaker in {@linkcode CircuitBreakerOpenError} messages and metrics. */
  name?: string;
  /** Consecutive failures before the breaker trips from `closed` to `open`. */
  failureThreshold: number;
  /** How long the breaker stays `open` before allowing a single `half-open` probe. */
  cooldownMs: number;
}

/** Thrown by {@linkcode CircuitBreaker.run} while the breaker is `open` (cooldown not yet elapsed). */
export class CircuitBreakerOpenError extends Error {
  public constructor(name: string) {
    super(`Circuit breaker "${name}" is open`);
    this.name = "CircuitBreakerOpenError";
  }
}

/**
 * Stops calling a failing dependency instead of piling up timeouts/errors
 * against it on every request. Three states:
 *
 * - `closed`: calls pass through; consecutive failures count toward
 *   `failureThreshold`.
 * - `open`: calls are rejected immediately with
 *   {@linkcode CircuitBreakerOpenError} until `cooldownMs` elapses.
 * - `half-open`: exactly one probe call is allowed through; success closes
 *   the breaker, failure reopens it (restarting the cooldown).
 *
 * Deliberately has no retry logic of its own - it's a gate a caller places
 * in front of calls it already makes, not a replacement for them.
 */
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
