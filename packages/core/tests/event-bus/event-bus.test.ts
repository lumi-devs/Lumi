import { describe, it, expect } from 'vitest';
import { createEventBus } from '@lumi/event-bus';

describe('RedisStreamsBus & createEventBus Tests', () => {
  it('createEventBus initializes RedisStreamsBus', () => {
    const owned = createEventBus({
      redis: { host: 'localhost', port: 6379, lazyConnect: true },
    });
    expect(owned.publisher).not.toBeNull();
    expect(typeof owned.close).toBe('function');
  });

  it('createEventBus throws error when redis config is missing', () => {
    expect(() => createEventBus()).toThrow(/`redis` options required/);
  });
});
