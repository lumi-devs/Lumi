/**
 * Centralized Brand Assets and Emojis for Ember
 *
 * All emojis used throughout the codebase MUST come from this file.
 * Supports custom Discord emoji IDs with built-in Unicode fallbacks.
 * Use `EmberEmojis.custom('<:name:id>', '🔷')` to resolve a custom emoji with a safe fallback.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const defaultEmojis = {
  // ── Status & Feedback ─────────────────────────────────────────────────────
  SUCCESS: "🟢",
  ERROR: "🔴",
  WARNING: "🟡",
  INFO: "🔵",
  CHECK: "✅",
  CROSS: "❌",
  LOADING: "⏳",
  SAKURA: "🌸",
  LEMON: "🍋",

  // ── Navigation & Pagination ───────────────────────────────────────────────
  ARROW_LEFT: "⬅️",
  ARROW_RIGHT: "➡️",
  PAGES: "📄",
  BULLET: "⚡",

  // ── Branding & System ─────────────────────────────────────────────────────
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

  // ── Module-Specific ───────────────────────────────────────────────────────
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

  /** Connectivity & Infrastructure */
  DATABASE: "🐘",
  CACHE: "🧠",
  QUEUE: "🐇",
  GATEWAY: "🌐",
  CPU: "🖥️",

  // ── Ping Card & Stats ─────────────────────────────────────────────────────
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
  RABBIT: "🐇",
};

// Attempt to load overrides from config/emojis.json
let customEmojis = {};
try {
  const configPath = join(process.cwd(), "config", "emojis.json");
  if (existsSync(configPath)) {
    const file = readFileSync(configPath, "utf-8");
    customEmojis = JSON.parse(file);
  }
} catch (err) {
  console.error("[Assets] Failed to load config/emojis.json:", err);
}

export const EmberEmojis = {
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
} as const;

export type EmberEmojiKey = keyof typeof EmberEmojis;
