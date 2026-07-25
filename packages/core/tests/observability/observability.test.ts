import { describe, it, expect } from 'vitest';
import {
  runWithContext,
  getRequestContext,
  activeTraceIds,
  injectTraceContext,
  extractTraceContext,
  registerReadinessProbe,
  runReadinessProbes,
  markDraining,
  isDraining
} from '@lumi/observability';

describe('Observability Context Tests', () => {
  it('runWithContext stores and retrieves request context via AsyncLocalStorage', () => {
    const mockCtx = { correlationId: 'req-100', source: 'command', guildId: 'g-1' };
    runWithContext(mockCtx, () => {
      const retrieved = getRequestContext();
      expect(retrieved).toEqual(mockCtx);
    });

    expect(getRequestContext()).toBeUndefined();
  });

  it('activeTraceIds and trace carriers return objects', () => {
    const traceIds = activeTraceIds();
    expect(traceIds).toBeDefined();

    const injected = injectTraceContext();
    expect(typeof injected).toBe('object');

    const extracted = extractTraceContext({ traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' });
    expect(extracted).toBeDefined();
  });
});

describe('Observability Readiness Probes Tests', () => {
  it('registers and executes readiness probes', async () => {
    registerReadinessProbe('db', () => ({ status: 'ok', detail: 'connected' }));
    registerReadinessProbe('redis', async () => ({ status: 'ok' }));

    const report = await runReadinessProbes();
    expect(report.ready).toBe(true);
    expect(report.checks.db?.status).toBe('ok');
    expect(report.checks.redis?.status).toBe('ok');
  });

  it('fails readiness when a probe fails', async () => {
    registerReadinessProbe('broken_service', () => ({ status: 'fail', detail: 'connection refused' }));

    const report = await runReadinessProbes();
    expect(report.ready).toBe(false);
    expect(report.checks.broken_service?.status).toBe('fail');
  });

  it('markDraining sets draining flag and fails readiness', async () => {
    expect(isDraining()).toBe(false);
    markDraining();
    expect(isDraining()).toBe(true);

    const report = await runReadinessProbes();
    expect(report.draining).toBe(true);
    expect(report.ready).toBe(false);
  });
});
