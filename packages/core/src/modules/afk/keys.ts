export const AfkKeys = {
  afk: (guildId: string, userId: string) => `ember:afk:${guildId}:${userId}`,
  mentionCooldown: (channelId: string) => `ember:afk:cd:mention:${channelId}`,
  welcomeCooldown: (channelId: string, userId: string) =>
    `ember:afk:cd:welcome:${channelId}:${userId}`,
  removalCooldown: (guildId: string, userId: string) =>
    `ember:afk:cd:removal:${guildId}:${userId}`,
  removalCooldownPattern: () => "ember:afk:cd:removal:*",
  nickEditCooldown: (userId: string) => `ember:afk:cd:nick:${userId}`,
  allForUserPattern: (userId: string) => `ember:afk:*:${userId}`,
  mentions: (guildId: string, userId: string) =>
    `ember:afk:mentions:${guildId}:${userId}`,
} as const;

export const AfkTTL = {
  entry: 24 * 60 * 60,
  mentions: 24 * 60 * 60,
} as const;
