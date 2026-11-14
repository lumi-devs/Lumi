import {
  type APIMessageComponentEmoji,
  type ButtonBuilder,
  parseEmoji,
  type StringSelectMenuOptionBuilder,
} from "discord.js";

export function componentEmoji(text: string): APIMessageComponentEmoji {
  const parsed = parseEmoji(text);
  if (!parsed?.name) return { name: text };
  return {
    name: parsed.name,
    ...(parsed.id ? { id: parsed.id } : {}),
    ...(parsed.animated ? { animated: parsed.animated } : {}),
  };
}

export function setEmojiIfPresent(
  builder: StringSelectMenuOptionBuilder | ButtonBuilder,
  emoji?: string | APIMessageComponentEmoji,
): void {
  if (emoji) {
    builder.setEmoji(typeof emoji === "string" ? componentEmoji(emoji) : emoji);
  }
}
