# @lumi/observability

## 0.9.0

### Minor Changes

- [`9c0b1a1`](https://github.com/lumi-devs/Lumi/commit/9c0b1a1a5d5188164993f450c05dae91ce5eeca4) - Owner-based RPC registry: module unload prunes that owner's handlers and load restores them, plus `registerDynamicRpc`/`unregisterDynamicRpc` for runtime owners. Optional Sentry error reporting behind `SENTRY_DSN` with flush on shutdown. Repository L1 cache now attaches in the shared container root so the api and scheduler processes get invalidation too.

### Patch Changes

- [#186](https://github.com/lumi-devs/Lumi/pull/186) [`879ddaf`](https://github.com/lumi-devs/Lumi/commit/879ddaf93c2a63e641e6ac3896560bd4e59dcb5a) Thanks [@rebizzz](https://github.com/rebizzz)! - Remove dead observability/infra surface: unused `lumi_utilities_*` and `lumi_bus_events_*` metrics, stale `gateway:9090` Prometheus target, and the `@lumi/infrastructure/services` export pointing at a nonexistent `src/services/` directory.
