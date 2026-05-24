export interface Env {}
export type IntegerString = `${number}`;

export function envParseString(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value) return value;
  if (defaultValue !== undefined) return defaultValue;
  throw new Error(`[ENV] Missing: ${key}`);
}

export function envParseInteger(key: string, defaultValue?: number): number {
  const raw = process.env[key];
  if (raw) {
    const n = Number(raw);
    if (!isNaN(n)) return n;
    throw new Error(`[ENV] Invalid: ${key}=${raw}`);
  }
  if (defaultValue !== undefined) return defaultValue;
  throw new Error(`[ENV] Missing: ${key}`);
}

export const envIsDefined = (key: string) => Boolean(process.env[key]);
