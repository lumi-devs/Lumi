import { call } from "./rpc.js";

export function getModuleConfig(key: string, guildId?: string): Promise<unknown> {
  return call("config.get", { key, guildId });
}
