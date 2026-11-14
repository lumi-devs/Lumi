import type { VoiceState } from "discord.js";

const voiceSessions = new Map<string, number>();

function sessionKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function voiceSessionStart(
  guildId: string,
  userId: string,
  nowMs: number,
): void {
  voiceSessions.set(sessionKey(guildId, userId), nowMs);
}

function voiceSessionEnd(
  guildId: string,
  userId: string,
  nowMs: number,
): number | null {
  const key = sessionKey(guildId, userId);
  const started = voiceSessions.get(key);
  if (started === undefined) return null;
  voiceSessions.delete(key);
  return Math.max(0, nowMs - started);
}

export function voiceAudibleTransition(
  guildId: string,
  userId: string,
  wasAudible: boolean,
  isAudibleNow: boolean,
  nowMs: number,
): number | null {
  if (wasAudible === isAudibleNow) return null;
  if (isAudibleNow) {
    voiceSessionStart(guildId, userId, nowMs);
    return null;
  }
  return voiceSessionEnd(guildId, userId, nowMs);
}

export function isAudible(state: VoiceState): boolean {
  if (!state.channelId) return false;
  if (state.mute || state.deaf || state.selfMute || state.selfDeaf)
    return false;
  if (state.suppress) return false;
  const member = state.member;
  if (!member || member.user.bot) return false;
  const channel = state.channel;
  if (!channel?.isVoiceBased()) return false;
  let humans = 0;
  for (const other of channel.members.values()) {
    if (!other.user.bot && ++humans > 1) return true;
  }
  return false;
}
