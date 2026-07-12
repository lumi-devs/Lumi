import { describe, it, expect } from 'vitest';
import { TimeUtility } from '#lib/utility-store/TimeUtility.js';

describe('TimeUtility', () => {
	const timeUtil = new TimeUtility({ name: 'time', store: {} as any }, { name: 'time' });

	it('humanizeDelta', () => {
		expect(timeUtil.humanizeDelta(50)).toBe('50s');
		expect(timeUtil.humanizeDelta(90)).toBe('1m 30s');
	});

	it('formatDuration', () => {
		expect(timeUtil.formatDuration(90000)).toBe('1m 30s');
	});

	it('parseDuration', () => {
		expect(timeUtil.parseDuration('1m')).toBe(60);
		expect(timeUtil.parseDuration('2h30m')).toBe(9000);
		expect(timeUtil.parseDuration('invalid')).toBe(null);
	});


});
