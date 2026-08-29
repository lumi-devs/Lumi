---
title: "Observability & Metrics"
description: "Prometheus metrics, OpenTelemetry distributed tracing, Grafana dashboards, and health probes."
category: "Core Architecture"
---

# Observability & Metrics

Lumi includes production-ready telemetry via the `@lumi/observability` package, providing OpenTelemetry tracing, Prometheus metrics export, and Kubernetes health probes.

## Prometheus Metrics

The primary shard exposes a Prometheus metrics endpoint on port `9090` (`http://localhost:9090/metrics`):

| Metric Name | Type | Description |
| :--- | :--- | :--- |
| `lumi_commands_total` | Counter | Total command invocations partitioned by module, command name, and status. |
| `lumi_gateway_ping_ms` | Gauge | Discord WebSocket gateway latency in milliseconds. |
| `lumi_event_stream_lag` | Gauge | Consumer group message lag on the Redis Streams event bus. |
| `lumi_db_pool_active` | Gauge | Active connections checked out of the database connection pool. |

---

## Health & Liveness Probes

The worker HTTP service exposes standard Kubernetes-compatible endpoints:

- `GET /healthz`: Basic process liveness probe.
- `GET /readyz`: Readiness probe verifying PostgreSQL, Redis, and Discord gateway connections.

---

## OpenTelemetry Tracing

Distributed tracing can be enabled via `.env`:

```bash
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_TRACES_SAMPLE_RATIO=1.0
```

Every command execution, RPC call, and database transaction includes contextual OpenTelemetry span tags.
