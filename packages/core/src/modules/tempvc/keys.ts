export const MODULE_NAME = "tempvc";

/** ModuleData `key` discriminators (targetId carries the channel id). */
export const TempVcData = {
  /** A generator (trigger) channel; value = GeneratorConfig. */
  GENERATOR: "gen",
  /** An active temporary voice channel; value = VcRecord. */
  RECORD: "vc",
} as const;

export const TempVcKeys = {
  /** Per-user creation cooldown. */
  createCooldown: (guildId: string, userId: string) =>
    `lumi:tempvc:cd:create:${guildId}:${userId}`,
  /** Short-lived guard so two users can't race a claim on the same channel. */
  claimGuard: (channelId: string) => `lumi:tempvc:claim:${channelId}`,
} as const;

/** Button / select / modal custom-id prefix. Format: `tvc:<action>:<channelId>`. */
export const TVC = "tvc";
