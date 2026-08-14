# `@lumi/sharding`

Static shard assignment and per-shard health telemetry for Lumi Gateway nodes.

## Features

- Static shard assignment via `SHARD_LIST` environment variable (cluster-managed per replica)
- Per-shard health telemetry published to Redis (`ShardTelemetry`) — status, gateway latency, guild count, and replica ownership
- Session-start-limit guard to prevent identify budget exhaustion on restart
