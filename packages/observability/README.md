# `@lumi/observability`

<div align="center">
  <img src="https://img.shields.io/badge/Package-Observability-blue?style=for-the-badge" alt="Package">
  <img src="https://img.shields.io/badge/Telemetry-OpenTelemetry-purple?style=for-the-badge" alt="Telemetry">
  <img src="https://img.shields.io/badge/Metrics-Prometheus-red?style=for-the-badge" alt="Metrics">
</div>

> Cross-service telemetry primitives delivering OpenTelemetry tracing, Pino structured logging, Prometheus metrics, and graceful drain lifecycle management.

---

## 📦 Role & Overview

`@lumi/observability` provides unified observability across all Lumi applications (`gateway`, `worker`, `scheduler`, `dashboard`). It has zero `discord.js` dependencies, allowing it to be imported first in application entrypoints.

---

## 🔑 Key Exported APIs & Features

### 1. Tracing (`tracing.ts`)
- `startTracing(opts)`: Configures OpenTelemetry NodeSDK when `OTEL_ENABLED=true`. Auto-instruments HTTP, PostgreSQL (`pg`), Redis (`ioredis`), and RabbitMQ (`amqplib`).
- `getTracer()`, `withSpan()`, `shutdownTracing()`.

### 2. Logger (`logger.ts`)
- `createPinoLogger(opts)`: Instantiates a Pino logger with support for JSON or pretty output, correlation ID, trace context propagation, and custom log levels.

### 3. Metrics (`metrics.ts`)
- `initMetrics(service)`, `startMetricsServer(port)`: Exposes Prometheus metrics registry on `METRICS_PORT` (default `9090`).
- Includes standardized counters, histograms, and gauges for Gateway WS events, REST rate limits, consumer stream lag (`lumi_stream_consumer_lag_workers`), and database queries.

### 4. Lifecycle & Drain (`readiness.ts`, `shutdown.ts`, `boot.ts`)
- `registerReadinessProbe(name, checkFn)`: Registers health probe checks (`/healthz`, `/readyz`).
- `runDrainSequence(steps, opts)`: Executes ordered pre-shutdown drain steps with timeout enforcement.

---

## ⚙️ Environment Variables

| Variable | Description | Default | Notes |
|---|---|---|---|
| `OTEL_ENABLED` | Enable OpenTelemetry export | `"false"` | Tracing toggle |
| `SERVICE_NAME` | Service name in trace spans | App dependent | Spans label |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP collector endpoint | `http://localhost:4318` | OTLP gRPC/HTTP |
| `OTEL_TRACES_SAMPLE_RATIO` | Trace sampling ratio (0.0 - 1.0) | `1.0` | Sampling rate |
| `METRICS_PORT` | HTTP port serving `/metrics` | `9090` | Prometheus port |

---

## 💻 Usage Example

```typescript
import { startTracing, createPinoLogger, startMetricsServer } from "@lumi/observability";

startTracing({ serviceName: "lumi-worker" });
const logger = createPinoLogger({ service: "worker" });
startMetricsServer(9090);

logger.info("Service initialized with tracing and metrics.");
```
