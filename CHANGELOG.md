# Changelog

All notable changes to Lumi are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Enabled GitHub Discussions (`/discussions`) for community Q&A, feature ideas, and support.
- Modernized GitHub Issue Forms in `.github/ISSUE_TEMPLATE/` (`bug_report.yml`, `feature_request.yml`, `module_proposal.yml`, `config.yml`).
- Path-based PR Auto-Labeler workflow (`.github/workflows/labeler.yml` and `.github/labeler.yml`).
- Automated Stale issue and PR lifecycle management workflow (`.github/workflows/stale.yml`).
- Expanded Black-Box E2E test suite in `tests/e2e/dashboard.test.ts`.
- Manifest definitions for core module (`packages/core/src/modules/core/manifest.json`) and scheduler telemetry (`apps/scheduler/src/telemetry.ts`).

### Changed
- Upgraded Bun runtime support to Bun 1.3+ and Turborepo build system to 2.10+.
- Updated GitHub Actions setup-bun workflow steps to `oven-sh/setup-bun@v2`.
- Updated container default image tags in `docker-compose.yml` (`redis:7-alpine`).
- Standardized imports across `@lumi/core` with strict path aliases (`#lib/*`, `#modules/*`, `#root/*`) and `.js` specifiers.
- Consolidated duplicate duration helpers (`parseDuration`/`formatDuration`) into `#lib/utilities/time.js`.
- Migrated module cache invalidation from direct `redis.del` calls to `container.invalidation.invalidate(...)`.

---

## [2.1.1] — 2026-07-12 — *Elysian* (First Public Release)

### Added
- Full monorepo workspace layout: `@lumi/core`, `@lumi/event-bus`, `@lumi/observability`, `@lumi/sharding`, `@lumi/contracts`, `@lumi/sdk`.
- Four runtime roles: `monolith`, `gateway`, `worker`, `scheduler` (selected via `LUMI_ROLE`).
- Redis Streams event bus for cross-process messaging.
- Per-guild module enable/disable system (`ModuleStore` + `@DefineModule`).
- Dynamic third-party addon loading and unloading at runtime (`Downloader` + `validate-addon` script).
- Built-in modules: **Core**, **Moderation**, **Auto-Filter**, **Utility** (serverinfo, whois, afk), **Logging**, **Dashboard**.
- Web dashboard (`@lumi/dashboard`) — Discord OAuth2 login, auto-generated config forms, RabbitMQ RPC bridge.
- Kubernetes deployment manifests (`deploy/k8s/`) with KEDA autoscaling for the worker tier.
- Redis Sentinel support for high-availability cache/task backends.
- BullMQ scheduler with optional Redis leader-lock election.
- Shard cluster coordinator (Redis-backed range assignment + session resumption).
- OpenTelemetry tracing, Prometheus metrics, Grafana dashboards.
- Resilience & fault-tolerance CI suite covering Redis Streams event bus.
- Full i18n with 30 Discord locales (Crowdin-managed).

### Changed
- Migrated from Zod to `@sapphire/shapeshift` for config validation.
- Consolidated all Prisma migrations into a single clean initial migration.
- Replaced phisherman integration with the standalone filter rule engine.

### Security
- AGPL-3.0 license applied to all packages.
- Addon sandboxing clearly documented: addons run with full bot-process privileges — install only from trusted sources.

---

*Older development history is internal; this is the first tagged public release.*
