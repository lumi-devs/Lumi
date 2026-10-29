/**
 * Minimal Redis surface used by the cache. Kept structural so tests can use a
 * plain mock and ioredis clients satisfy it without adapters.
 */
export interface CacheRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, unit: "PX", ttlMs: number): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  mget(...keys: string[]): Promise<(string | null)[]>;
  /**
   * Only needed for the stale-write cleanup. Optional so test doubles do not
   * have to emulate Lua; a production ioredis client always provides it.
   */
  eval?(script: string, numKeys: number, key: string, value: string): Promise<unknown>;
}
