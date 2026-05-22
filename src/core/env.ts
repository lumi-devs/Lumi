/**
 * Native environment variable utilities.
 * Replaces @skyra/env-utilities with zero external dependencies.
 * Bun auto-loads .env files, so no explicit setup() call is needed.
 */

export interface Env {}

export type IntegerString = `${number}`;

export function envParseString(key: string, defaultValue?: string): string {
	const value = process.env[key];
	if (value !== undefined && value !== '') return value;
	if (defaultValue !== undefined) return defaultValue;
	throw new Error(`[ENV] Missing required environment variable: ${key}`);
}

export function envParseInteger(key: string, defaultValue?: number): number {
	const raw = process.env[key];
	if (raw !== undefined && raw !== '') {
		const parsed = Number(raw);
		if (!Number.isNaN(parsed)) return parsed;
		throw new Error(`[ENV] "${key}" is not a valid integer: ${raw}`);
	}
	if (defaultValue !== undefined) return defaultValue;
	throw new Error(`[ENV] Missing required environment variable: ${key}`);
}

export function envIsDefined(key: string): boolean {
	return process.env[key] !== undefined && process.env[key] !== '';
}
