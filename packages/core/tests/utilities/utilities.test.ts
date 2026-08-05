import { describe, it, expect, vi } from 'vitest';
import { errorFrom, errorCode, logError, swallow } from '#lib/utilities/errors.js';
import { resolveDuration, resolveDurationDate } from '#lib/utilities/resolvers/duration.js';
import { container } from '@sapphire/framework';

vi.mock('@sapphire/framework', async (importOriginal?: () => Promise<any>) => {
  if (typeof importOriginal === 'function') {
    const actual = await importOriginal();
    return {
      ...actual,
      container: {
        logger: {
          error: vi.fn(),
          debug: vi.fn()
        }
      }
    };
  }
  return {
    container: {
      logger: {
        error: vi.fn(),
        debug: vi.fn()
      }
    }
  };
});

describe('Error Utilities', () => {
  it('errorFrom converts strings, objects, and Error instances', () => {
    const err = new Error('original');
    expect(errorFrom(err)).toBe(err);

    const strErr = errorFrom('string error');
    expect(strErr.message).toBe('string error');

    const objErr = errorFrom({ message: 'object message' });
    expect(objErr.message).toBe('object message');

    const rawErr = errorFrom(12345);
    expect(rawErr.message).toBe('12345');
  });

  it('errorCode extracts code from object errors', () => {
    expect(errorCode({ code: 50013 })).toBe(50013);
    expect(errorCode({ code: 'INVALID_TOKEN' })).toBe('INVALID_TOKEN');
    expect(errorCode(new Error('no code'))).toBeUndefined();
    expect(errorCode(null)).toBeUndefined();
  });

  it('logError logs error to container.logger.error', () => {
    logError('testContext', 'failure');
    expect(container.logger.error).toHaveBeenCalled();
  });

  it('swallow returns function that logs debug message and returns null', () => {
    const handler = swallow('Operation failed');
    const res = handler(new Error('inner failure'));
    expect(res).toBeNull();
    expect(container.logger.debug).toHaveBeenCalledWith('[swallow] Operation failed:', 'inner failure');
  });
});

describe('Duration Resolver Utility', () => {
  it('resolveDuration resolves standard duration string into ms', () => {
    const res = resolveDuration('30m');
    expect(res.isOk()).toBe(true);
    expect(res.unwrap()).toBe(1800000);
  });

  it('resolveDuration returns err for invalid duration', () => {
    const res = resolveDuration('not a valid duration string xyz');
    expect(res.isErr()).toBe(true);
  });

  it('resolveDurationDate returns future Date object', () => {
    const res = resolveDurationDate('1h');
    expect(res.isOk()).toBe(true);
    const date = res.unwrap();
    expect(date.getTime()).toBeGreaterThan(Date.now());
  });
});
