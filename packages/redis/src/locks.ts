import type Redis from "ioredis";
import { createKeys, TTL } from "./keys.js";

const keys = createKeys();
const releaseScript =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

export interface LockOptions {
  readonly ttlMs?: number;
  readonly retryMs?: number;
  readonly maxRetries?: number;
}

export class DistributedLock {
  private readonly redis: Redis;
  private readonly key: string;
  private readonly ttlMs: number;
  private readonly retryMs: number;
  private readonly maxRetries: number;
  private acquired = false;
  private token: string | null = null;

  constructor(redis: Redis, key: string, options: LockOptions = {}) {
    this.redis = redis;
    this.key = keys.lock(key);
    this.ttlMs = options.ttlMs ?? TTL.lock * 1_000;
    this.retryMs = options.retryMs ?? 100;
    this.maxRetries = options.maxRetries ?? 50;
  }

  async acquire(): Promise<boolean> {
    if (this.acquired) return true;

    const token = crypto.randomUUID();
    for (let i = 0; i < this.maxRetries; i++) {
      const result = await this.redis.set(
        this.key,
        token,
        "PX",
        this.ttlMs,
        "NX",
      );
      if (result === "OK") {
        this.acquired = true;
        this.token = token;
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, this.retryMs));
    }
    return false;
  }

  async release(): Promise<void> {
    const token = this.token;
    if (!this.acquired || token === null) return;
    this.acquired = false;
    this.token = null;
    await this.redis.eval(releaseScript, 1, this.key, token);
  }
}

export function createLock(
  redis: Redis,
  key: string,
  options?: LockOptions,
): DistributedLock {
  return new DistributedLock(redis, key, options);
}

export async function withLock<T>(
  redis: Redis,
  key: string,
  fn: () => Promise<T>,
  options?: LockOptions,
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
