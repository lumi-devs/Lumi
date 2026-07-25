import { describe, it, expect } from 'vitest';
import { truncate, fmtId, escapeMarkdown } from '#lib/utilities/misc.js';

describe('formatting.ts', () => {
	it('truncate', () => {
		expect(truncate('hello world', 5)).toBe('hell…');
		expect(truncate('hello', 10)).toBe('hello');
	});

	it('fmtId', () => {
		expect(fmtId(123n)).toBe('123');
		expect(fmtId(null)).toBe('unknown');
	});

	it('escapeMarkdown', () => {
		expect(escapeMarkdown('*hello*')).toBe('\\*hello\\*');
	});
});
