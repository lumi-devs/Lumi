import type { GateAction } from "../services/SecurityService.js";

/**
 * Extracts a number config value with a fallback default.
 */
export function getConfigNumber(
	raw: Record<string, unknown>,
	key: string,
	fallback: number,
): number {
	return typeof raw[key] === "number" ? (raw[key] as number) : fallback;
}

/**
 * Extracts a string config value, returning null if missing or empty.
 */
export function getConfigString(
	raw: Record<string, unknown>,
	key: string,
): string | null {
	const v = raw[key];
	return typeof v === "string" && v ? v : null;
}

/**
 * Extracts a GateAction config value with a fallback default.
 * Valid values: "log" | "kick" | "timeout" | "quarantine".
 */
export function getConfigAction(
	raw: Record<string, unknown>,
	key: string,
	fallback: GateAction,
): GateAction {
	const v = raw[key];
	return v === "log" || v === "kick" || v === "timeout" || v === "quarantine"
		? (v as GateAction)
		: fallback;
}
