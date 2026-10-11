
export class SemaphoreQueueFullError extends Error {
  public constructor(name: string) {
    super(`Semaphore "${name}" queue is full`);
    this.name = "SemaphoreQueueFullError";
  }
}

export interface SemaphoreOptions {

  name?: string;

  maxQueueLength?: number;
}

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

  public get inFlight(): number {
    return this.maxConcurrency - this.available;
  }

  public get queued(): number {
    return this.queue.length;
  }

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

  public async run<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

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
