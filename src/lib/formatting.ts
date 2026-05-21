/** Convert a duration in seconds into a human-readable string. */
export function humanizeTimedelta(seconds: number): string {
	if (seconds < 60) return `${seconds}s`;
	const parts: string[] = [];
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const mins = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;
	if (days) parts.push(`${days}d`);
	if (hours) parts.push(`${hours}h`);
	if (mins) parts.push(`${mins}m`);
	if (secs) parts.push(`${secs}s`);
	return parts.join(' ');
}

/** Truncate a string to maxLen, appending ellipsis if cut. */
export function truncate(str: string, maxLen: number): string {
	return str.length <= maxLen ? str : `${str.slice(0, maxLen - 1)}…`;
}

/** Format a bigint Discord ID as a string. */
export function fmtId(id: bigint | string | null | undefined): string {
	return id != null ? String(id) : 'unknown';
}

/** Escape Discord markdown characters. */
export function escapeMarkdown(text: string): string {
	return text.replace(/([*_`~|\\])/g, '\\$1');
}

/** Parse a duration string like "7d", "2h30m", "90s" → seconds. Returns null if unparseable. */
export function parseDuration(input: string): number | null {
	const units: Record<string, number> = {
		y: 31536000,
		mo: 2592000,
		w: 604800,
		d: 86400,
		h: 3600,
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
