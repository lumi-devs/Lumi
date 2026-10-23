export function createKeys(namespace = "lumi") {
  const prefix = (parts: string[]): string => [namespace, ...parts].join(":");

  return {
    guild: (guildId: string) => prefix(["guild", guildId]),
    guildConfig: (guildId: string, module: string) => prefix(["cfg", guildId, module]),
    guildConfigAll: (guildId: string) => prefix(["cfg", guildId, "__all__"]),
    moduleGlobal: (module: string) => prefix(["mod", "global", module]),
    moduleGuild: (guildId: string, module: string) => prefix(["mod", guildId, module]),
    moduleData: (guildId: string, module: string, targetId: string, key: string) =>
      prefix(["kv", guildId, module, `${targetId.length}:${targetId}:${key}`]),
    afk: (guildId: string, userId: string) => prefix(["afk", guildId, userId]),
    cooldown: (scope: string, id: string) => prefix(["cd", scope, id]),
    permits: (guildId: string, targetType: string, targetId: string) =>
      prefix(["permits", guildId, targetType, targetId]),
    quarantine: (guildId: string, userId: string) => prefix(["quarantine", guildId, userId]),
    lock: (name: string) => prefix(["lock", name]),
    botStats: () => prefix(["stats", "bot"]),
  };
}

export type RedisKeys = ReturnType<typeof createKeys>;

export const TTL = {
  guild: 300,
  config: 120,
  moduleState: 60,
  moduleData: 300,
  moduleDataNegative: 15,
  afk: 86_400,
  afkNegative: 15,
  cooldown: 5,
  lock: 10,
} as const;
