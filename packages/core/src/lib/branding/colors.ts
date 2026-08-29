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

export type BrandColorKey = keyof typeof BrandColors;

/**
 * CSS color tokens for dashboard and docs.
 * Exported so build scripts / docs configs can reference them
 * without hardcoding hex strings.
 */
export const BrandTokens = {
  dark: {
    canvas: '#090B14',
    canvasSubtle: '#0D1018',
    surface: '#0F1219',
    surfaceHover: '#161B26',
    surfaceActive: '#1C2231',
    border: '#1E2433',
    borderSoft: '#161B26',
    borderStrong: '#2D3548',
    fg: '#F0F2F8',
    fgMuted: '#8B95B7',
    fgSubtle: '#5F6A85',
    fgOnAccent: '#FFFFFF',
    accent: '#4C6EF5',
    accentHover: '#3B5BDB',
    accentSoft: 'rgba(76, 110, 245, 0.12)',
    accentGlow: '#4C6EF5',
    success: '#12B886',
    successSoft: 'rgba(18, 184, 134, 0.12)',
    warning: '#F59F00',
    warningSoft: 'rgba(245, 159, 0, 0.12)',
    danger: '#FA5252',
    dangerSoft: 'rgba(250, 82, 82, 0.12)',
  },
  light: {
    canvas: '#F4F5F9',
    canvasSubtle: '#EBEDF3',
    surface: '#FFFFFF',
    surfaceHover: '#F5F6FB',
    surfaceActive: '#EAEDF4',
    border: '#DFE2EA',
    borderSoft: '#EBEDF3',
    borderStrong: '#C5CAD6',
    fg: '#14161C',
    fgMuted: '#5A6270',
    fgSubtle: '#8B93A3',
    fgOnAccent: '#FFFFFF',
    accent: '#3B5BDB',
    accentHover: '#2B4BC6',
    accentSoft: 'rgba(59, 91, 219, 0.09)',
    accentGlow: '#4C6EF5',
    success: '#12805A',
    successSoft: 'rgba(18, 128, 90, 0.1)',
    warning: '#92600A',
    warningSoft: 'rgba(146, 96, 10, 0.1)',
    danger: '#C7333F',
    dangerSoft: 'rgba(199, 51, 63, 0.09)',
  },
} as const;
