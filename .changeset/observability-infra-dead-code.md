---
"@lumi/observability": patch
"@lumi/infrastructure": patch
---

Remove dead observability/infra surface: unused `lumi_utilities_*` and `lumi_bus_events_*` metrics, stale `gateway:9090` Prometheus target, and the `@lumi/infrastructure/services` export pointing at a nonexistent `src/services/` directory.
