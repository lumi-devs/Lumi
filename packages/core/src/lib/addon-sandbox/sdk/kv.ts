import { call } from "./rpc.js";

export function get<T = unknown>(
  guildId: string,
  targetId: string,
  key: string,
): Promise<T | null> {
  return call("kv.get", { guildId, targetId, key });
}

export function set<T = unknown>(
  guildId: string,
  targetId: string,
  key: string,
  value: T,
): Promise<void> {
  return call("kv.set", { guildId, targetId, key, value });
}

export function remove(guildId: string, targetId: string, key: string): Promise<number> {
  return call("kv.delete", { guildId, targetId, key });
}

export function list<T = unknown>(
  key: string,
  guildId?: string,
): Promise<{ guildId: string; targetId: string; value: T }[]> {
  return call("kv.list", { key, guildId });
}
