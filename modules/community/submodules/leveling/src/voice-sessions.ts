import type { VoiceState } from "discord.js";

const voiceSessions = new Map<string, number>();

function sessionKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export function voiceSessionStart(
  guildId: string,
  userId: string,
  nowMs: number,
): void {
  voiceSessions.set(sessionKey(guildId, userId), nowMs);
}

export function voiceSessionEnd(
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

export function isAudible(state: VoiceState): boolean {
  if (!state.channelId) return false;
  if (state.mute || state.deaf || state.selfMute || state.selfDeaf) return false;
  if (state.suppress) return false;
  const member = state.member;
  if (!member || member.user.bot) return false;
  const channel = state.channel;
  if (!channel || !channel.isVoiceBased()) return false;
  let humans = 0;
  for (const other of channel.members.values()) {
    if (!other.user.bot && ++humans > 1) return true;
  }
  return false;
}
