export const EconomyKeys = {
  slotCooldown: (guildId: string, userId: string) =>
    `lumi:economy:cd:slot:${guildId}:${userId}`,
} as const;
