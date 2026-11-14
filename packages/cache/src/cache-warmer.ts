import { logger } from "@lumi/foundation";

export interface WarmOptions<T> {
  readonly keys: readonly string[];
  readonly loader: (keys: readonly string[]) => Promise<Map<string, T>>;
  readonly concurrency?: number;
  readonly onProgress?: (loaded: number, total: number) => void;
  readonly batchSize?: number;
}

export interface WarmResult<T> {
  readonly loaded: number;
  readonly failed: readonly string[];
  readonly results: Map<string, T>;
}

export async function warmCache<T>(
  options: WarmOptions<T>,
): Promise<WarmResult<T>> {
  const {
    keys,
    loader,
    concurrency = 10,
    onProgress,
    batchSize = 100,
  } = options;

  const total = keys.length;
  let loaded = 0;
  const failed: string[] = [];
  const results = new Map<string, T>();

  logger.info("Starting cache warm", { totalKeys: total, concurrency, batchSize });

  for (let i = 0; i < total; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(async (key) => {
        const map = await loader([key]);
        return { key, value: map.get(key) };
      }),
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled" && result.value.value !== undefined) {
        results.set(result.value.key, result.value.value);
        loaded++;
      } else {
        failed.push(
          result.status === "fulfilled" ? result.value.key : batch[batchResults.indexOf(result)],
        );
      }
    }

    if (onProgress) {
      onProgress(loaded, total);
    }

    if (i + batchSize < total) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  logger.info("Cache warm complete", { loaded, failed: failed.length, total });
  return { loaded, failed, results };
}

export async function warmCacheParallel<T>(
  options: WarmOptions<T>,
): Promise<WarmResult<T>> {
  const { keys, loader, concurrency = 10, onProgress } = options;

  const total = keys.length;
  let loaded = 0;
  const failed: string[] = [];
  const results = new Map<string, T>();

  logger.info("Starting parallel cache warm", { totalKeys: total, concurrency });

  const semaphore = new Semaphore(concurrency);

  await Promise.all(
    keys.map(async (key) => {
      await semaphore.acquire();
      try {
        const map = await loader([key]);
        const value = map.get(key);
        if (value !== undefined) {
          results.set(key, value);
          loaded++;
        } else {
          failed.push(key);
        }
      } catch {
        failed.push(key);
      } finally {
        semaphore.release();
        if (onProgress) {
          onProgress(loaded, total);
        }
      }
    }),
  );

  logger.info("Parallel cache warm complete", { loaded, failed: failed.length, total });
  return { loaded, failed, results };
}

class Semaphore {
  private permits: number;
  private waiters: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    const waiter = this.waiters.shift();
    if (waiter) {
      this.permits--;
      waiter();
    }
  }
}