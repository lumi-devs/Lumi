const FallbackReactionEmojis = [
  "1️⃣",
  "2️⃣",
  "3️⃣",
  "4️⃣",
  "5️⃣",
  "6️⃣",
  "7️⃣",
  "8️⃣",
  "9️⃣",
  "🔟",
  "🇦",
  "🇧",
  "🇨",
  "🇩",
  "🇪",
  "🇫",
  "🇬",
  "🇭",
  "🇮",
  "🇯",
] as const;

export const MaxReactionOptions = FallbackReactionEmojis.length;

interface EmojiOption {
  readonly emoji?: string | null;
}

function normalized(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function assignReactionEmojis(
  options: readonly EmojiOption[],
): string[] {
  const used = new Set<string>();
  const assigned: Array<string | null> = options.map((option) => {
    const emoji = normalized(option.emoji);
    if (!emoji || used.has(emoji)) return null;
    used.add(emoji);
    return emoji;
  });

  let cursor = 0;
  return assigned.map((emoji) => {
    if (emoji) return emoji;
    while (cursor < FallbackReactionEmojis.length) {
      const fallback = FallbackReactionEmojis[cursor]!;
      cursor += 1;
      if (used.has(fallback)) continue;
      used.add(fallback);
      return fallback;
    }
    const fallback = FallbackReactionEmojis[cursor % MaxReactionOptions]!;
    cursor += 1;
    used.add(fallback);
    return fallback;
  });
}

export function reactionMatchesEmoji(
  assigned: string,
  emoji: { readonly id?: string | null; readonly name?: string | null },
): boolean {
  const value = assigned.trim();
  if (emoji.id) {
    return value.includes(emoji.id) || value === emoji.name;
  }
  return value === emoji.name;
}
