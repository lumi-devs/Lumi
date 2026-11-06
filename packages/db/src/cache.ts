import type { Redis } from "ioredis";

export interface CacheFacade {
  readonly distributed: boolean;
  get<T>(key: string): Promise<T | null>;
  getString(key: string): Promise<string | null>;
  set(key: string, value: unknown, ttlMs?: number): Promise<void>;
  setString(key: string, value: string, ttlMs?: number): Promise<void>;
  del(key: string): Promise<void>;
  getOrLoad<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T | null | undefined>,
  ): Promise<T | null>;
  setNx(key: string, value: string, ttlMs: number): Promise<boolean>;
  incr(key: string, ttlMs?: number): Promise<number>;
  incrBy(key: string, amount: number, ttlMs: number): Promise<number>;
  sAdd(key: string, members: string | readonly string[]): Promise<number>;
  sRem(key: string, members: string | readonly string[]): Promise<number>;
  sMembers(key: string): Promise<string[]>;
  sCard(key: string): Promise<number>;
  takeLock(key: string, ttlMs: number): Promise<(() => Promise<void>) | null>;
}

const ReleaseLockScript =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

interface Flight {
  promise: Promise<unknown>;
}

export function createCacheFacade(redis: Redis | undefined): CacheFacade {
  const flights = new Map<string, Flight>();

  async function getRaw(key: string): Promise<string | null> {
    if (!redis) return null;
    return redis.get(key);
  }

  const facade: CacheFacade = {
    distributed: Boolean(redis),
    async get<T>(key: string): Promise<T | null> {
      const value = await getRaw(key);
      if (value === null) return null;
      try {
        return JSON.parse(value) as T;
      } catch {
        return null;
      }
    },
    async getString(key) {
      return getRaw(key);
    },
    async set(key, value, ttlMs) {
      if (!redis) return;
      const payload = JSON.stringify(value);
      if (ttlMs === undefined) {
        await redis.set(key, payload);
        return;
      }
      await redis.set(key, payload, "PX", Math.max(1, ttlMs));
    },
    async setString(key, value, ttlMs) {
      if (!redis) return;
      if (ttlMs === undefined) {
        await redis.set(key, value);
        return;
      }
      await redis.set(key, value, "PX", Math.max(1, ttlMs));
    },
    async del(key) {
      if (!redis) return;
      await redis.del(key);
    },
    async getOrLoad<T>(
      key: string,
      ttlMs: number,
      loader: () => Promise<T | null | undefined>,
    ) {
      const existing = flights.get(key);
      if (existing) return existing.promise as Promise<T | null>;

      const run = (async (): Promise<T | null> => {
        const cached = await facade.get<T>(key);
        if (cached !== null) return cached;

        const loaded = await loader();
        if (loaded === null || loaded === undefined) return null;

        await facade.set(key, loaded, ttlMs);
        return loaded;
      })();

      flights.set(key, { promise: run });
      try {
        return await run;
      } finally {
        if (flights.get(key)?.promise === run) flights.delete(key);
      }
    },
    async setNx(key, value, ttlMs) {
      if (!redis) return true;
      const result = await redis.set(
        key,
        value,
        "PX",
        Math.max(1, ttlMs),
        "NX",
      );
      return result === "OK";
    },
    async incr(key, ttlMs) {
      if (!redis) return 0;
      const value = await redis.incr(key);
      if (ttlMs && value === 1) await redis.pexpire(key, Math.max(1, ttlMs));
      return value;
    },
    async incrBy(key, amount, ttlMs) {
      if (!redis) return 0;
      const value = await redis.incrby(key, amount);
      await redis.pexpire(key, Math.max(1, ttlMs));
      return value;
    },
    async sAdd(key, members) {
      if (!redis) return 0;
      const values = typeof members === "string" ? [members] : [...members];
      if (values.length === 0) return 0;
      return redis.sadd(key, ...values);
    },
    async sRem(key, members) {
      if (!redis) return 0;
      const values = typeof members === "string" ? [members] : [...members];
      if (values.length === 0) return 0;
      return redis.srem(key, ...values);
    },
    async sMembers(key) {
      if (!redis) return [];
      return redis.smembers(key);
    },
    async sCard(key) {
      if (!redis) return 0;
      return redis.scard(key);
    },
    async takeLock(key, ttlMs) {
      const token = crypto.randomUUID();
      const lockKey = `lock:${key}`;
      if (!redis) return null;
      const acquired = await redis.set(
        lockKey,
        token,
        "PX",
        Math.max(1, ttlMs),
        "NX",
      );
      if (acquired !== "OK") return null;
      return async () => {
        await redis.eval(ReleaseLockScript, 1, lockKey, token);
      };
    },
  };

  return facade;
}
