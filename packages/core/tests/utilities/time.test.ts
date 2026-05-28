import { describe, it, expect } from 'vitest';
import { humanizeDelta, formatUptime, parseDuration, relativeTimestamp, shortTimestamp } from '#utilities/time.js';

describe('time.ts', () => {
	it('humanizeDelta', () => {
		expect(humanizeDelta(50)).toBe('50s');
		expect(humanizeDelta(90)).toBe('1m 30s');
	});

	it('formatUptime', () => {
		expect(formatUptime(90000)).toBe('1m 30s');
	});

	it('parseDuration', () => {
		expect(parseDuration('1m')).toBe(60);
		expect(parseDuration('2h30m')).toBe(9000);
		expect(parseDuration('invalid')).toBe(null);
	});

	it('relativeTimestamp', () => {
		expect(relativeTimestamp(1000000)).toBe('<t:1000:R>');
	});

	it('shortTimestamp', () => {
		expect(shortTimestamp(1000000)).toBe('<t:1000:T>');
	});
});
