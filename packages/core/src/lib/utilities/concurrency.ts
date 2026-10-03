/**
 * Thrown by {@linkcode Semaphore.run} when `maxQueueLength` is set and a
 * caller arrives with every permit held and the queue already full - a
 * signal to the caller to back off rather than pile on an unbounded queue.
 */
export class SemaphoreQueueFullError extends Error {
  public constructor(name: string) {
    super(`Semaphore "${name}" queue is full`);
    this.name = "SemaphoreQueueFullError";
  }
}

export interface SemaphoreOptions {
  /** Identifies this semaphore in {@linkcode SemaphoreQueueFullError} messages and metrics. */
  name?: string;
  /** Rejects a new `run()` call with {@linkcode SemaphoreQueueFullError} once this many callers are already waiting. Unbounded if omitted. */
  maxQueueLength?: number;
}

/**
 * Caps concurrent access to a resource at `maxConcurrency`. Unlike
 * {@linkcode mapWithConcurrency}, callers aren't a fixed batch known up
 * front - `run()` is called ad hoc (e.g. once per inbound request) and
 * queues behind whichever permits are already held.
 */
export class Semaphore {
  private readonly name: string;
  private readonly maxQueueLength: number | undefined;
  private available: number;
  private readonly queue: Array<() => void> = [];

  public constructor(
    private readonly maxConcurrency: number,
    options: SemaphoreOptions = {},
  ) {
    if (maxConcurrency < 1) {
      throw new Error("Semaphore maxConcurrency must be at least 1");
    }
    this.name = options.name ?? "semaphore";
    this.maxQueueLength = options.maxQueueLength;
    this.available = maxConcurrency;
  }

  /** Number of permits currently checked out. */
  public get inFlight(): number {
    return this.maxConcurrency - this.available;
  }

  /** Number of callers waiting for a permit. */
  public get queued(): number {
    return this.queue.length;
  }

  /**
   * Acquires a permit, waiting if none is free. Throws
   * {@linkcode SemaphoreQueueFullError} instead of waiting if `maxQueueLength`
   * is set and already reached. Callers must call the returned `release`
   * exactly once - prefer {@linkcode run} where possible so that's automatic.
   */
  public async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available--;
      return () => this.release();
    }

    if (this.maxQueueLength !== undefined && this.queue.length >= this.maxQueueLength) {
      throw new SemaphoreQueueFullError(this.name);
    }

    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.available--;
    return () => this.release();
  }

  private release(): void {
    this.available++;
    const next = this.queue.shift();
    if (next) next();
  }

  /** Runs `fn` under a permit, releasing it (success or failure) when `fn` settles. */
  public async run<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

/**
 * Run `fn` over `items` with at most `limit` in flight.
 *
 * Unbounded `Promise.all` over a guild collection would issue thousands of
 * simultaneous Discord API calls and trip rate limits, so work is pulled from a
 * shared cursor by a fixed pool instead.
 */
export async function mapWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const size = Math.max(1, Math.min(limit, items.length));

  await Promise.all(
    Array.from({ length: size }, async () => {
      while (cursor < items.length) {
        await fn(items[cursor++]!);
      }
    }),
  );
}
