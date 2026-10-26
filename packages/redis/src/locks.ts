import Redis from "ioredis";

export interface LockOptions {
  ttlMs?: number;
  retryMs?: number;
  maxRetries?: number;
}

export class DistributedLock {
  private readonly redis: Redis;
  private readonly key: string;
  private readonly ttlMs: number;
  private readonly retryMs: number;
  private readonly maxRetries: number;
  private acquired = false;

  constructor(redis: Redis, key: string, options: LockOptions = {}) {
    this.redis = redis;
    this.key = `lock:${key}`;
    this.ttlMs = options.ttlMs ?? 10_000;
    this.retryMs = options.retryMs ?? 100;
    this.maxRetries = options.maxRetries ?? 50;
  }

  async acquire(): Promise<boolean> {
    for (let i = 0; i < this.maxRetries; i++) {
      const result = await this.redis.set(this.key, "1", "PX", this.ttlMs, "NX");
      if (result === "OK") {
        this.acquired = true;
        return true;
      }
      await new Promise((r) => setTimeout(r, this.retryMs));
    }
    return false;
  }

  async release(): Promise<void> {
    if (!this.acquired) return;
    // Use Lua script to only delete if we own it
    await this.redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      this.key,
      "1"
    );
    this.acquired = false;
  }

}

export function createLock(redis: Redis, key: string, options?: LockOptions): DistributedLock {
  return new DistributedLock(redis, key, options);
}

export async function withLock<T>(
  redis: Redis,
  key: string,
  fn: () => Promise<T>,
  options?: LockOptions
): Promise<T> {
  const lock = createLock(redis, key, options);
  const acquired = await lock.acquire();
  if (!acquired) {
    throw new Error(`Failed to acquire lock: ${key}`);
  }
  try {
    return await fn();
  } finally {
    await lock.release();
  }
}