import { describe, it, expect } from 'vitest';
import { InProcBus, createEventBus } from '@lumi/event-bus';

describe('InProcBus & createEventBus Tests', () => {
  it('InProcBus publishes and consumes events in memory', async () => {
    const bus = new InProcBus();
    const received: Record<string, unknown>[] = [];

    const stop = await bus.consume(['stream-1'], { group: 'g1', consumer: 'c1' }, async (event) => {
      received.push(event.body);
    });

    await bus.publish('stream-1', { msg: 'hello' });
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ msg: 'hello' });

    await stop();
    await bus.close();
  });

  it('createEventBus defaults to inproc transport when unspecified', () => {
    const owned = createEventBus({ transport: 'inproc' });
    expect(owned.transport).toBe('inproc');
    expect(owned.publisher).toBeNull();
    expect(typeof owned.close).toBe('function');
  });

  it('createEventBus throws error when streams transport lacks redis config', () => {
    expect(() => createEventBus({ transport: 'streams' })).toThrow(/`redis` options required/);
  });
});
