# Changelog

All notable changes to Lumi are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.1.1] — 2026-07-12 — *Elysian* (First Public Release)

### Added
- Full monorepo workspace layout: `@lumi/core`, `@lumi/event-bus`, `@lumi/observability`, `@lumi/sharding`, `@lumi/contracts`, `@lumi/sdk`.
- Four runtime roles: `monolith`, `gateway`, `worker`, `scheduler` (selected via `LUMI_ROLE`).
- Three pluggable event-bus transports: `inproc` (default), Redis Streams, NATS JetStream.
- Per-guild module enable/disable system (`ModuleStore` + `@DefineModule`).
- Dynamic third-party addon loading and unloading at runtime (`Downloader` + `validate-addon` script).
- Built-in modules: **Core**, **Moderation**, **Auto-Filter**, **Utility** (serverinfo, whois, afk), **Logging**, **Dashboard**.
- Web dashboard (`@lumi/dashboard`) — Discord OAuth2 login, auto-generated config forms, RabbitMQ RPC bridge.
- Kubernetes deployment manifests (`deploy/k8s/`) with KEDA autoscaling for the worker tier.
- Redis Sentinel support for high-availability cache/task backends.
- BullMQ scheduler with optional Redis leader-lock election.
- Shard cluster coordinator (Redis-backed range assignment + session resumption).
- OpenTelemetry tracing, Prometheus metrics, optional Grafana/Sentry integration.
- GDPR user-data deletion path (`gdpr.ts`).
- Resilience & fault-tolerance CI suite covering Redis Streams DLQ and NATS JetStream transport legs.
- Full i18n for `en-US`, `de`, `es-ES`, `fr`.

### Changed
- Migrated from Zod to `@sapphire/shapeshift` for config validation.
- Consolidated all Prisma migrations into a single clean initial migration.
- Replaced phisherman integration with the standalone filter rule engine.

### Security
- AGPL-3.0 license applied to all packages.
- Addon sandboxing clearly documented: addons run with full bot-process privileges — install only from trusted sources.

---

*Older development history is internal; this is the first tagged public release.*
