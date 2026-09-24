/**
 * Lumi Brand Color System — "Midnight Sapphire"
 *
 * Single source of truth for all color values used across:
 * - Discord bot embeds & cards (via card builders)
 * - Dashboard CSS tokens (globals.css)
 * - Documentation site theme (custom.css)
 * - README badges and assets
 *
 * Design principles:
 * - Deep navy canvas (warm, inviting — not pure black)
 * - Electric sapphire accent (bridges Discord Blurple heritage with modern SaaS)
 * - Semantic status colors aligned with Discord conventions
 * - Per-guild overridable via config/bot.ts branding.colors
 */

/** Discord embed color values (integer format for discord.js) */
export const BrandColors = {
  /** Core brand accent — electric sapphire blue */
  primary: 0x4c6ef5,
  /** Hover/pressed variant of primary */
  primaryAlt: 0x3b5bdb,

  /** Semantic status colors */
  info: 0x4c6ef5,
  success: 0x12b886,
  warning: 0xf59f00,
  error: 0xfa5252,

  /** Non-semantic accent colors */
  neutral: 0x495057,
  gold: 0xffd43b,
  purple: 0x9775fa,
  cyan: 0x22b8cf,
} as const;

