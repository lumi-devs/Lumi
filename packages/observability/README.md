# `@lumi/observability`

Prometheus metrics export, OpenTelemetry distributed tracing, and graceful process drain sequence management for Lumi.

## Features

- Prometheus metrics registry exposed on `:9090`
- OpenTelemetry tracing SDK setup & shutdown wrappers
- Graceful drain sequence runner (`runDrainSequence`) for clean shutdown
