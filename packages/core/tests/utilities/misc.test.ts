import { describe, it, expect } from 'vitest';
import { fmtId } from '#lib/utilities/misc.js';
import { cutText as truncate } from '@sapphire/utilities';
import { escapeMarkdown } from '@discordjs/formatters';

describe('misc.ts', () => {
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
