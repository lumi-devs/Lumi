export const AccentColors = {
  success: 0x12b886,
  warning: 0xf59f00,
  error: 0xfa5252,

  gold: 0xffd43b,
  purple: 0x9775fa,
  cyan: 0x22b8cf,
} as const;

export type CardColorKey = keyof typeof AccentColors;

export function resolveCardColor(key: CardColorKey): number {
  return AccentColors[key];
}
