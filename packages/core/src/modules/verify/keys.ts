export const VerifyKeys = {
  seqState: (guildId: string, userId: string) =>
    `lumi:verify:${guildId}:${userId}:seq`,
  pendingSet: (guildId: string) => `lumi:verify:${guildId}:pending`,
} as const;

// 12 visually distinct emoji — indices used in button custom IDs
export const EMOJI_POOL = [
  "🍎",
  "🐶",
  "🚀",
  "⭐",
  "🎸",
  "🌊",
  "🦁",
  "🍕",
  "🎯",
  "🌈",
  "🦋",
  "🔥",
] as const;

export interface SeqState {
  sequence: number[]; // indices into EMOJI_POOL
  buttons: number[]; // all 8 button indices (sequence + distractors), shuffled
  progress: number; // correct clicks so far
  attempts: number; // wrong attempts remaining
  expiresAt: number;
}
