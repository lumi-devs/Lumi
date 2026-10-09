import { call } from "./rpc.js";

export function sadd(key: string, ...members: string[]): Promise<number> {
  return call("valkey.sadd", { key, members });
}

export function srem(key: string, ...members: string[]): Promise<number> {
  return call("valkey.srem", { key, members });
}

export function scard(key: string): Promise<number> {
  return call("valkey.scard", { key });
}

export function smembers(key: string): Promise<string[]> {
  return call("valkey.smembers", { key });
}

export function del(key: string): Promise<number> {
  return call("valkey.del", { key });
}

export function set(key: string, value: string, ttlSeconds?: number): Promise<void> {
  return call("valkey.set", { key, value, ttlSeconds });
}

export function get(key: string): Promise<string | null> {
  return call("valkey.get", { key });
}
