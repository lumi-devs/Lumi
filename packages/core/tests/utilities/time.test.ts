import { describe, it, expect } from 'vitest';
import { humanizeDelta, formatDuration, parseDuration, relativeTimestamp, shortTimestamp } from '#lib/utilities/time.js';

describe('time.ts', () => {
	it('humanizeDelta', () => {
		expect(humanizeDelta(50)).toBe('50s');
		expect(humanizeDelta(90)).toBe('1m 30s');
	});

	it('formatDuration', () => {
		expect(formatDuration(90000)).toBe('1m 30s');
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
		// Discord style `t` = ShortTime ("14:30"); `T` = LongTime. The helper uses ShortTime.
		expect(shortTimestamp(1000000)).toBe('<t:1000:t>');
	});
});
