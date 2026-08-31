/**
 * Centralized Brand Assets and Emojis for Lumi
 *
 * All emojis used throughout the codebase MUST come from this file.
 * Supports custom Discord emoji IDs with built-in Unicode fallbacks.
 * Use `Emojis.custom('<:name:id>', '🔷')` to resolve a custom emoji with a safe fallback.
 */
import { join } from "node:path";
import { parseEmoji } from "discord.js";
import { errorCode } from "#lib/utilities/errors.js";

const defaultEmojis = {
  SUCCESS: "🟢",
  ERROR: "🔴",
  WARNING: "🟡",
  INFO: "🔵",
  CHECK: "✅",
  CROSS: "❌",
  LOADING: "⏳",
  SAKURA: "🌸",
  LEMON: "🍋",

  ARROW_LEFT: "⬅️",
  ARROW_RIGHT: "➡️",
  PAGES: "📄",
  BULLET: "⚡",

  BOT: "🤖",
  TERMINAL: "💻",
  GEAR: "⚙️",
  CROWN: "👑",
  LOCK: "🔒",
  UNLOCK: "🔓",
  SEARCH: "🔍",
  FEEDBACK: "📝",
  STAR: "⭐",
  SHIELD: "🛡️",
  BELL: "🔔",
  FIRE: "🔥",

  /** AFK module */
  AFK: "💤",
  MAIL: "📬",
  WAVE: "👋",
  EDIT: "✏️",
  CLOCK: "🕐",

  WARNING_SIGN: "⚠️",

  /** Guild / Admin */
  GUILD: "🏰",
  ADMIN: "🔑",
  ANALYTICS: "📊",
  CLEANUP: "🧹",
  REPO: "📦",
  DOWNLOAD: "📥",
  INSTALL: "🔧",
  UNINSTALL: "🗑️",
  PIN: "📌",

  /** Connectivity & Infrastructure */
  DATABASE: "🐘",
  CACHE: "🧠",
  GATEWAY: "🌐",
  CPU: "🖥️",

  SPACE: "⠀",
  LATENCY: "📡",
  UPTIME: "⏱️",
  TRADE: "📊",
  MEMORY: "🧠",
  POSITION: "📈",
  SERVERS: "🏰",
  MEMBERS: "👥",
  REDIS: "🔴",
  SQL: "🐘",
};

let customEmojis = {};
try {
  const configPath = join(process.cwd(), "config", "emojis.ts");
  const mod = await import(configPath);
  const raw: unknown = mod?.default ?? {};
  if (typeof raw === "object" && raw !== null) {
    customEmojis = raw;
  }
} catch (err: unknown) {
  const code = errorCode(err);
  if (code !== "ERR_MODULE_NOT_FOUND" && code !== "ENOENT") {
    console.error("[Assets] Failed to load config/emojis.ts:", err);
  }
}

export const Emojis = {
  ...defaultEmojis,
  ...customEmojis,

  /**
   * Resolves a custom Discord emoji string or falls back to a Unicode symbol.
   * @param customId A Discord custom emoji string like `<:name:12345>`
   * @param fallback Unicode fallback emoji
   */
  custom(customId: string, fallback: string): string {
    return /^<a?:[a-zA-Z0-9_]+:\d+>$/.test(customId) ? customId : fallback;
  },

  /**
   * Parses an Emoji string into a format suitable for Discord.js `setEmoji`.
   * @param emoji The emoji string to parse
   */
  parse(emoji: string): { name: string; id?: string; animated?: boolean } {
    const parsed = parseEmoji(emoji);
    if (parsed && parsed.name) {
      return {
        name: parsed.name,
        ...(parsed.id ? { id: parsed.id } : {}),
        ...(parsed.animated ? { animated: parsed.animated } : {}),
      };
    }
    return { name: emoji };
  },
} as const;

export type EmojiKey = keyof typeof Emojis;
