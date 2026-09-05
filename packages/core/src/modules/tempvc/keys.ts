export const ModuleName = "tempvc";

export const TempVcKeys = {
  /** Per-user creation cooldown. */
  createCooldown: (guildId: string, userId: string) =>
    `lumi:tempvc:cd:create:${guildId}:${userId}`,
  /** Short-lived guard so two users can't race a claim on the same channel. */
  claimGuard: (channelId: string) => `lumi:tempvc:claim:${channelId}`,
} as const;

/** Button / select / modal custom-id prefix. Format: `tvc:<action>:<channelId>`. */
export const Tvc = "tvc";
