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
