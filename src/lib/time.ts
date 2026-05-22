/**
 * Centralized time utilities — single source of truth for duration
 * formatting, parsing, and Discord timestamp helpers.
 */

/** Convert a duration in seconds into a compact human-readable string like "3d 2h 15m 30s". */
export function humanizeDelta(seconds: number): string {
	if (seconds < 60) return `${seconds}s`;
	const parts: string[] = [];
	const d = Math.floor(seconds / 86_400);
	const h = Math.floor((seconds % 86_400) / 3_600);
	const m = Math.floor((seconds % 3_600) / 60);
	const s = seconds % 60;
	if (d) parts.push(`${d}d`);
	if (h) parts.push(`${h}h`);
	if (m) parts.push(`${m}m`);
	if (s) parts.push(`${s}s`);
	return parts.join(' ');
}

/** Convert milliseconds into a compact uptime string like "3d 2h 15m". */
export function formatUptime(ms: number): string {
	const totalSecs = Math.floor(ms / 1_000);
	const m = Math.floor(totalSecs / 60) % 60;
	const h = Math.floor(totalSecs / 3_600) % 24;
	const d = Math.floor(totalSecs / 86_400);
	if (d > 0) return `${d}d ${h}h ${m}m`;
	if (h > 0) return `${h}h ${m}m`;
	return `${m}m ${totalSecs % 60}s`;
}

/** Parse a duration string like "7d", "2h30m", "90s" into seconds. Returns null if unparseable. */
export function parseDuration(input: string): number | null {
	const units: Record<string, number> = {
		y: 31_536_000,
		mo: 2_592_000,
		w: 604_800,
		d: 86_400,
		h: 3_600,
		m: 60,
		s: 1
	};
	let total = 0;
	const re = /(\d+)(y|mo|w|d|h|m|s)/gi;
	let match: RegExpExecArray | null;
	let found = false;
	while ((match = re.exec(input)) !== null) {
		total += parseInt(match[1], 10) * (units[match[2].toLowerCase()] ?? 0);
		found = true;
	}
	return found ? total : null;
}

/** Discord relative timestamp markup: `<t:EPOCH:R>` → "2 hours ago" / "in 3 days". */
export function relativeTimestamp(date: Date | number = Date.now()): string {
	const epoch = Math.floor((typeof date === 'number' ? date : date.getTime()) / 1_000);
	return `<t:${epoch}:R>`;
}

/** Discord short-time timestamp markup: `<t:EPOCH:T>` → "14:30:00". */
export function shortTimestamp(date: Date | number = Date.now()): string {
	const epoch = Math.floor((typeof date === 'number' ? date : date.getTime()) / 1_000);
	return `<t:${epoch}:T>`;
}
