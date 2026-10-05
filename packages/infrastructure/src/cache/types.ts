export interface CacheLogger {
  debug?(message: string, ...args: unknown[]): void;
  info?(message: string, ...args: unknown[]): void;
  warn?(message: string, ...args: unknown[]): void;
  error?(message: string, ...args: unknown[]): void;
}

export interface CacheOptions {
  ttlSeconds?: number;
  namespace?: string;
}

export interface ICacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  has(key: string): Promise<boolean>;
  getOrSet<T>(key: string, ttlSeconds: number, producer: () => Promise<T>): Promise<T>;
}

export interface RedisConnectionConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  sentinels?: string;
  sentinelName?: string;
  sentinelPassword?: string;
  cacheDb?: number;
  clusterNodes?: string;
  clusterScaleReads?: "master" | "slave" | "all";
}

export interface ResyncContext {
  cutoff: number;
}
