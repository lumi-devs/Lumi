import { defineCustomId } from "#src/lib/interactions/CustomId.js";

export const TempvcCreateCooldownMs = 30_000;
export const TempvcCleanupDelayMs = 8_000;
export const TempvcMaxGenerators = 25;

export const ModuleName = "tempvc";

export const TempVcKeys = {
  createCooldown: (guildId: string, userId: string) =>
    `lumi:tempvc:cd:create:${guildId}:${userId}`,

  claimGuard: (channelId: string) => `lumi:tempvc:claim:${channelId}`,
} as const;

const Tvc = "tvc";

export const TempVcPanelId = defineCustomId(Tvc, ["action", "channelId"]);

export const PanelTitleDefault = "🔊 Voice Channel Controls";
export const PanelMessageDefault = [
  "**Channel:** {channel}",
  "**Owner:** {owner}",
  "**Limit:** `{limit}`",
  "**Status:** {status}",
].join("\n");
