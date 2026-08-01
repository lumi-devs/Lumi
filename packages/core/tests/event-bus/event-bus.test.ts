import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEventBus } from '@lumi/event-bus';

const mockQuit = vi.fn().mockResolvedValue('OK');
const mockInstances: any[] = [];

vi.mock('ioredis', () => {
  class MockRedis {
    opts: any;
    xadd = vi.fn().mockResolvedValue('1-0');
    xack = vi.fn().mockResolvedValue(1);
    xlen = vi.fn().mockResolvedValue(0);
    xgroup = vi.fn().mockResolvedValue('OK');
    xreadgroup = vi.fn().mockResolvedValue(null);
    xautoclaim = vi.fn().mockResolvedValue(null);
    xpending = vi.fn().mockResolvedValue([]);
    quit = mockQuit;
    constructor(opts: any) {
      this.opts = opts;
      mockInstances.push(this);
    }
  }
  return { Redis: MockRedis, default: MockRedis };
});

describe('RedisStreamsBus & createEventBus Tests', () => {
  beforeEach(() => {
    mockInstances.length = 0;
    mockQuit.mockClear();
  });

  it('createEventBus initializes RedisStreamsBus with dedicated publisher/subscriber connections', () => {
    const owned = createEventBus({
      redis: { host: 'localhost', port: 6379, lazyConnect: true },
    });
    expect(owned.publisher).not.toBeNull();
    expect(typeof owned.close).toBe('function');
    expect(mockInstances).toHaveLength(2);
    expect(mockInstances[0]).toBe(owned.publisher);
  });

  it('createEventBus throws error when redis config is missing', () => {
    expect(() => createEventBus()).toThrow(/`redis` options required/);
  });

  it('close() quits both the publisher and subscriber Redis clients', async () => {
    const owned = createEventBus({
      redis: { host: 'localhost', port: 6379, lazyConnect: true },
    });

    const busCloseSpy = vi.spyOn(owned.bus, 'close');

    await owned.close();

    expect(busCloseSpy).toHaveBeenCalledTimes(1);
    expect(mockQuit).toHaveBeenCalledTimes(2);
  });
});
