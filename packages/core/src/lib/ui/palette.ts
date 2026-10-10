export const BrandColors = {
  primary: 0x4c6ef5,
  primaryAlt: 0x3b5bdb,

  info: 0x4c6ef5,
  success: 0x12b886,
  warning: 0xf59f00,
  error: 0xfa5252,

  neutral: 0x495057,
  gold: 0xffd43b,
  purple: 0x9775fa,
  cyan: 0x22b8cf,
} as const;

export type CardColorKey = keyof typeof BrandColors;

const BlankByDefault: ReadonlySet<CardColorKey> = new Set(["primary"]);

export function resolveCardColor(key: CardColorKey): number | undefined {
  return BlankByDefault.has(key) ? undefined : BrandColors[key];
}
