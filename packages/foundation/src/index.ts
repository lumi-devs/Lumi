// Mock foundation package - provides basic types and utilities
export interface Logger {
  info: (msg: string, meta?: any) => void;
  warn: (msg: string, meta?: any) => void;
  error: (msg: string, meta?: any) => void;
  debug: (msg: string, meta?: any) => void;
}

export const logger: Logger = {
  info: console.log,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

export function createLogger(_name: string): Logger {
  return logger;
}

export type InvalidationPort = {
  subscribe: (channel: string, listener: (keys: string[]) => void) => () => void;
  publish: (channel: string, message: string) => Promise<void>;
};

export type RedisClient = any;
export type RedisKeys = any;
export type TTL = any;

export const InvalidationPort = null;
export const RedisClient = null;
export const RedisKeys = null;
export const TTL = null;