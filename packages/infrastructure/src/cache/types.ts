export interface CacheLogger {
  debug?(message: string, ...args: unknown[]): void;
  info?(message: string, ...args: unknown[]): void;
  warn?(message: string, ...args: unknown[]): void;
  error?(message: string, ...args: unknown[]): void;
}

export interface ValkeyConnectionConfig {
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
