import { isPlaceholder } from "./shared.ts";

export function validateBotToken(value: string): string | null {
  const token = value.trim();
  if (token.length === 0) return "Missing bot token.";
  if (isPlaceholder(token)) {
    return "Bot token still contains a placeholder value.";
  }
  if (token.startsWith("Bot ")) {
    return 'Enter only the token, without the "Bot " prefix.';
  }
  if (/\s/.test(token)) return "Bot token must not contain whitespace.";
  if (/^mfa\.[A-Za-z0-9_-]{80,}$/.test(token)) return null;
  const parts = token.split(".");
  if (
    parts.length !== 3 ||
    parts.some((part) => part.length < 5 || !/^[A-Za-z0-9_-]+$/.test(part))
  ) {
    return "Bot token does not look like a Discord bot token (expected three dot-separated segments).";
  }
  return null;
}

export function validateOwnerIds(value: string): string | null {
  const ids = value.split(/[\s,]+/).filter(Boolean);
  if (ids.length === 0) return "Missing OWNER_IDS.";
  const invalid = ids.filter((id) => !/^\d{17,20}$/.test(id));
  if (invalid.length > 0) {
    return `OWNER_IDS must be comma-separated Discord user IDs. Invalid: ${invalid.join(", ")}`;
  }
  return null;
}
