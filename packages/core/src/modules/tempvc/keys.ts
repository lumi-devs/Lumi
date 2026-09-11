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

// Panel copy defaults live here rather than beside `buildPanel` so the config
// schema can reference them without importing `ui/panel.js`, which tests mock.
export const PanelTitleDefault = "🔊 Voice Channel Controls";
export const PanelMessageDefault = [
  "**Channel:** {channel}",
  "**Owner:** {owner}",
  "**Limit:** `{limit}`",
  "**Status:** {status}",
].join("\n");
