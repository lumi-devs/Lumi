import type { GateAction } from "./join-gate.js";

export function getConfigNumber(
	raw: Record<string, unknown>,
	key: string,
	fallback: number,
): number {
	return typeof raw[key] === "number" ? (raw[key]) : fallback;
}

export function getConfigString(
	raw: Record<string, unknown>,
	key: string,
): string | null {
	const v = raw[key];
	return typeof v === "string" && v ? v : null;
}

/** Valid values: "log" | "kick" | "timeout" | "quarantine". */
export function getConfigAction(
	raw: Record<string, unknown>,
	key: string,
	fallback: GateAction,
): GateAction {
	const v = raw[key];
	return v === "log" || v === "kick" || v === "timeout" || v === "quarantine"
		? (v)
		: fallback;
}
