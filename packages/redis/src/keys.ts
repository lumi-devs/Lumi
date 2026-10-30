export function createKeys(namespace = "lumi") {
  const prefix = (parts: string[]): string => [namespace, ...parts].join(":");

  return {
    guild: (guildId: string) => prefix(["guild", guildId]),
    guildConfig: (guildId: string, moduleName: string) =>
      prefix(["cfg", guildId, moduleName]),
    guildConfigAll: (guildId: string) => prefix(["cfg", guildId, "__all__"]),
    moduleGlobal: (moduleName: string) => prefix(["mod", "global", moduleName]),
    moduleGuild: (guildId: string, moduleName: string) =>
      prefix(["mod", guildId, moduleName]),
    moduleData: (
      guildId: string,
      moduleName: string,
      targetId: string,
      dataKey: string,
    ) =>
      prefix([
        "kv",
        guildId,
        moduleName,
        `${targetId.length}:${targetId}:${dataKey}`,
      ]),
    afk: (guildId: string, userId: string) => prefix(["afk", guildId, userId]),
    afkMentions: (guildId: string, userId: string) =>
      prefix(["afk", "mentions", guildId, userId]),
    cooldown: (scope: string, id: string) => prefix(["cd", scope, id]),
    permits: (guildId: string, targetType: string, targetId: string) =>
      prefix(["permits", guildId, targetType, targetId]),

    quarantine: (guildId: string, userId: string) =>
      prefix(["mod", guildId, "quarantine", userId]),
    panelSession: (messageId: string) => prefix(["panel", messageId]),
    lock: (name: string) => prefix(["lock", name]),
    moduleLock: (guildId: string, moduleName: string) =>
      prefix(["lock", "module", guildId, moduleName]),
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
  panelSession: 3_600,
} as const;
