import { call } from "./rpc.js";

export function sadd(key: string, ...members: string[]): Promise<number> {
  return call("redis.sadd", { key, members });
}

export function srem(key: string, ...members: string[]): Promise<number> {
  return call("redis.srem", { key, members });
}

export function scard(key: string): Promise<number> {
  return call("redis.scard", { key });
}

export function smembers(key: string): Promise<string[]> {
  return call("redis.smembers", { key });
}

export function del(key: string): Promise<number> {
  return call("redis.del", { key });
}
