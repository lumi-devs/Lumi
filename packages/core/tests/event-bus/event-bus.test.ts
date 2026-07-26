import { describe, it, expect } from 'vitest';
import { InProcBus, NatsJetStreamBus, createEventBus } from '@lumi/event-bus';

describe('InProcBus & createEventBus Tests', () => {
  it('InProcBus publishes and consumes events in memory', async () => {
    const bus = new InProcBus();
    const received: Record<string, unknown>[] = [];

    const stop = await bus.consume(['stream-1'], { group: 'g1', consumer: 'c1' }, async (event) => {
      received.push(event.body as Record<string, unknown>);
    });

    await bus.publish('stream-1', { msg: 'hello' });
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ msg: 'hello' });

    await stop();
    await bus.close();
  });

  it('InProcBus isolates message consumption across distinct consumer groups', async () => {
    const bus = new InProcBus();
    const group1Received: Record<string, unknown>[] = [];
    const group2Received: Record<string, unknown>[] = [];

    const stop1 = await bus.consume(['broadcast-stream'], { group: 'group-1', consumer: 'c1' }, async (event) => {
      group1Received.push(event.body as Record<string, unknown>);
    });
    const stop2 = await bus.consume(['broadcast-stream'], { group: 'group-2', consumer: 'c2' }, async (event) => {
      group2Received.push(event.body as Record<string, unknown>);
    });

    await bus.publish('broadcast-stream', { payload: 'broadcast-test' });

    expect(group1Received).toHaveLength(1);
    expect(group2Received).toHaveLength(1);
    expect(group1Received[0]).toEqual({ payload: 'broadcast-test' });
    expect(group2Received[0]).toEqual({ payload: 'broadcast-test' });

    await stop1();
    await stop2();
    await bus.close();
  });

  it('InProcBus handles subscriber handler errors gracefully without stopping event loop', async () => {
    const bus = new InProcBus();
    const successfulPayloads: unknown[] = [];

    let callCount = 0;
    const stop = await bus.consume(['resilience-stream'], { group: 'g1', consumer: 'c1' }, async (event) => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Simulated subscriber error');
      }
      successfulPayloads.push(event.body);
    });

    await bus.publish('resilience-stream', { attempt: 1 });
    await bus.publish('resilience-stream', { attempt: 2 });

    expect(successfulPayloads).toHaveLength(1);
    expect(successfulPayloads[0]).toEqual({ attempt: 2 });

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

  it('createEventBus throws error when nats transport lacks natsServers', () => {
    expect(() => createEventBus({ transport: 'nats' })).toThrow(/`natsServers` \(or NATS_URL\) required/);
  });

  it('NatsJetStreamBus respects custom streamSubjects or default fallback', () => {
    const defaultBus = new NatsJetStreamBus({ connection: {} as any });
    expect((defaultBus as any).streamSubjects).toEqual(['lumi.>', 'verify.>']);

    const customBus = new NatsJetStreamBus({
      connection: {} as any,
      streamSubjects: ['custom.stream.>'],
    });
    expect((customBus as any).streamSubjects).toEqual(['custom.stream.>']);
  });
});
