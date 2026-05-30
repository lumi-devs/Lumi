export const AfkKeys = {
  afk: (guildId: string, userId: string) => `lumi:afk:${guildId}:${userId}`,
  mentionCooldown: (channelId: string) => `lumi:afk:cd:mention:${channelId}`,
  welcomeCooldown: (channelId: string, userId: string) =>
    `lumi:afk:cd:welcome:${channelId}:${userId}`,
  removalCooldown: (guildId: string, userId: string) =>
    `lumi:afk:cd:removal:${guildId}:${userId}`,
  removalCooldownPattern: () => "lumi:afk:cd:removal:*",
  nickEditCooldown: (userId: string) => `lumi:afk:cd:nick:${userId}`,
  allForUserPattern: (userId: string) => `lumi:afk:*:${userId}`,
  mentions: (guildId: string, userId: string) =>
    `lumi:afk:mentions:${guildId}:${userId}`,
} as const;

export const AfkTTL = {
  entry: 24 * 60 * 60,
  mentions: 24 * 60 * 60,
} as const;
