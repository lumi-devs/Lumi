import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  runWithContext,
  getRequestContext,
  activeTraceIds,
  injectTraceContext,
  extractTraceContext,
  registerReadinessProbe,
  runReadinessProbes,
  markDraining,
  isDraining,
  bootstrapTelemetry
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

describe('bootstrapTelemetry Tests', () => {
  const origService = process.env.SERVICE_NAME;
  const origMetrics = process.env.METRICS_ENABLED;

  beforeEach(() => {
    process.env.METRICS_ENABLED = 'false';
  });

  afterEach(() => {
    process.env.SERVICE_NAME = origService;
    process.env.METRICS_ENABLED = origMetrics;
  });

  it('sets process.env.SERVICE_NAME when explicit serviceName parameter is passed', () => {
    delete process.env.SERVICE_NAME;

    bootstrapTelemetry('custom-service');
    expect(process.env.SERVICE_NAME).toBe('custom-service');
  });

  it('defaults serviceName to "lumi" if serviceName and SERVICE_NAME are unset', () => {
    delete process.env.SERVICE_NAME;

    bootstrapTelemetry();
    expect(process.env.SERVICE_NAME).toBe('lumi');
  });
});

