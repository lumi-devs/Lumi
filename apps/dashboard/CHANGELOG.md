# @lumi/dashboard

## 3.3.0

### Minor Changes

- 3436080: **Enterprise & Mega-Fleet Scaling (100k-1M+ Guilds, 50-500+ Shards)**:
  - Added Discord REST proxy support (`nirn-proxy`) with path normalization, infinite local request rate limit delegation, configurable request timeouts, and retry controls.
  - Added Redis Cluster multi-master support with replica read scaling (`REDIS_CLUSTER_SCALE_READS`), dynamic slot refresh timeouts, and retry strategies.
  - Added PostgreSQL read-replica connection pool aliases (`DATABASE_READ_URL`, `POSTGRES_REPLICA_URL`) and `application_name` tagging.
  - Added environment-tunable cache limits and sweeper interval controls for high shard density.
  - Added production multi-stage Next.js Dockerfile (`Dockerfile.dashboard`) and multi-target GitHub Actions container publishing to GHCR.
  - Added Kubernetes deployment manifests for the dashboard and updated production statefulset configurations.
- e99dc73: **Brand & Theme System**:
  - Established the single-source-of-truth "Midnight Sapphire" brand system in `BrandColors` and `BrandTokens` (`#4C6EF5` primary sapphire accent, with emerald `#12B886` success, amber `#F59F00` warning, rose `#FA5252` error).
  - Aligned bot card utilities (`makeInfoCard`, `makeSuccessCard`, etc.) and `apps/dashboard/src/app/globals.css` dark and light mode tokens with the Midnight Sapphire system.
  - Added `ctx.brandColor()` helper to `CommandContext` for resolving per-guild theme colors.
  
  **GDPR & Security**:
  - Implemented `data-retention-sweep` daily scheduled task in core module for automated retention cleanup of stale audit ledger records and expired moderation cases.
  - Enforced mandatory `end_user_data_statement` on addon manifests (`info.json`) with clear validator diagnostics.
  - Upgraded dashboard rate limiting to `RateLimiterRedis` with graceful in-memory fallback for horizontal replica coordination.
  - Added client-side GDPR cookie consent banner on the dashboard.
  
  **Next.js 16 Documentation Site**:
  - Migrated `apps/docs` from Astro to Next.js 16 (App Router) + React 19 + Tailwind CSS v4 + Motion (`motion/react`).
  - Features animated landing hero, 4-quadrant feature Bento Grid, live Discord Card Preview simulator, macOS traffic-light code blocks, sticky table-of-contents scrollspy, command palette modal, and static export build support for GitHub Pages / CDN deployments.
- 8531ee3: Migrate `@tanstack/react-table` to v9 and `marked` to v18; fix CodeQL stored-xss and multi-character sanitization alerts.

### Patch Changes

- 64a07d1: **Bug Fixes**: Fixed anti-nuke vanity-URL audit attribution to correlate the audit-log entry to the actual `vanity_url_code` change instead of accepting any recent GuildUpdate entry (B-BUG-1). Fixed guild restore to map recreated category ids so child channels keep their parent, and to restore role/channel `position` (B-BUG-2, B-BUG-3). Isolated per-case errors in the warn-decay sweep so one failing case can't starve the rest of the run (D-BUG-1). Fixed dashboard auth to stop clobbering `isBotOwner` right after it was correctly re-confirmed by the whoami RPC (A-BUG-1). Made the audit-log flush fall back to per-row inserts on batch failure instead of stalling forever behind one bad entry (C-BUG-1). Redis lock renewal failures are now tracked and logged instead of silently swallowed (C-BUG-2). Entity cache now clears optional fields on transition to empty instead of leaving stale data cached for 24h (C-BUG-3).
- 7f53af7: Hardened GitHub Actions CI/CD workflows and container build pipeline:
  - Add safe build-time environment variable fallbacks in `@lumi/dashboard` for Next.js static page collection.
  - Optimized multi-stage `Dockerfile` and `Dockerfile.dashboard` for lightweight Alpine container execution.
  - Added comprehensive Turborepo build verification job to `ci.yml`.
  - Standardized PR, Push, and Merge Queue (`merge_group`) triggers across all workflows.
- 026126f: Replaced the loose `getEnv(name, fallback="")` helper in `apps/dashboard/src/lib/env.ts` with strict `envStr` and `envInt` parsers that throw on missing required variables instead of silently returning empty strings. Added `resolveAuthSecret` to consolidate the `DASHBOARD_SESSION_SECRET`/`AUTH_SECRET` fallback chain. Semantics now match `packages/core`'s `envParseString`/`envParseInteger` — a misconfigured deployment fails fast at startup rather than at the first request.
- dfa98f6: Fix Next.js container builds in `Dockerfile.dashboard`:
  - Install `nodejs` in base Alpine container image for Next.js build runtime compatibility.
  - Ensure `NODE_ENV=production` is set for static page generation and optimization.
  - Include `.github/` directory in builder and runner stages for `/legal/privacy` and `/legal/terms` document rendering.
- 84cd7cc: Redesign documentation with Apple Cupertino aesthetic and unify single source of truth:
  - Refactor documentation styling in `apps/docs/src/styles/custom.css` with SF Pro / Inter typography, macOS window styled code blocks, frosted glass headers, and Apple pill controls.
  - Unify documentation structure into `apps/docs/src/content/docs/` with root symlink `docs -> apps/docs/src/content/docs` to eliminate redundant copies.
  - Synchronize documentation with active enterprise fleet configuration, Kubernetes deployment manifests, 27 Prisma models, and 66 RPC wire actions.
  - Add version switcher for v0.1 in the docs header (`apps/docs/src/components/SiteTitle.astro`).
  - Remove mentions of external Discord bots across docs and dashboard UI.
- 9959510: Optimize GitHub Actions CI/CD workflows and automated checks:
  - Implement granular paths filtering in `ci.yml` and `docker.yml` to smart-skip jobs on markdown/docs/unrelated changes.
  - Add `ci-status` aggregator job in `ci.yml` (`if: always()`) for robust GitHub branch protection evaluation without false failures on skipped matrix jobs.
  - Enable Turborepo and Bun local caching in GitHub Actions runners across all workflows.
  - Streamline `changeset-check.yml` by eliminating redundant Bun setup and dependency installations.
  - Set `NEXT_TELEMETRY_DISABLED=1` and `SKIP_ENV_VALIDATION=1` in CI environment.
- @lumi/contracts@3.3.0
  - @lumi/observability@3.3.0

## 3.2.0

### Minor Changes

- 406c0a7: Rework the dashboard UI around an "engineering blueprint / operator console"
  design direction, built on a semantic design-token system.

  - Committed aesthetic: hairline rules, wide uppercase micro-labels, condensed
    engineered chrome type over a subtle graph-paper field, and one saturated
    signal colour (blueprint cobalt) reserved for the primary action and the
    active route — amber/green/red stay reserved for machine status.
  - New type pairing: Saira Semi Condensed (chrome), IBM Plex Sans (body),
    JetBrains Mono (data), all self-hosted via `next/font`.
  - One orchestrated page-load reveal on the guild overview and system panel,
    disabled under `prefers-reduced-motion`.
  - Light and dark themes are both authored (previously dark-only with two
    unreachable novelty palettes); `system`/`light`/`dark` is selectable from the
    header and follows `prefers-color-scheme` by default.
  - Replaced emoji-as-icons throughout the app chrome with `lucide-react`. A
    module's own emoji is still shown, in a fixed glyph tile.
  - Denser data screens: the module list and global kill-switch grid are now
    tables/lists instead of card grids, and the control scale dropped from 40px
    to 32px.
  - Clear primary/secondary/destructive button hierarchy, designed empty states,
    route-level loading skeletons and an error boundary.
  - Dropped the glassmorphism, radial page glow and gradient wordmark.

### Patch Changes

- 125dfa1: Dashboard bot-owner detection (`session.isBotOwner`) now comes from a new `auth.whoami` RPC that defers to the worker's `PermitResolver.isBotOwner`, instead of a separate `BOT_OWNERS` dashboard env var. This means the Discord application's actual owner is recognized automatically, the same way it already is for in-Discord commands — no manual env-var configuration needed, and one less place for bot-owner lists to drift out of sync.
- 5079ab2: Security fixes: addon/module management (`/repo`, `/download`, `/module`, and the hub panel's Add-ons and core-update actions) now requires a real Bot Owner instead of the `owner.*` permit node, which every guild owner satisfied; moderation commands now refuse targets that outrank the invoker; `/purge regex` screens user-supplied patterns for catastrophic backtracking before running them on the gateway loop; the dashboard's `guild.config.set` RPC now goes through `ConfigService` (schema validation, audit history, change hooks) instead of writing raw JSON; and the Discord OAuth2 access token is no longer placed on the NextAuth session (it was reachable from the browser via `/api/auth/session`).
- Updated dependencies [125dfa1]
  - @lumi/contracts@3.2.0
  - @lumi/observability@3.2.0

## 3.1.1

### Patch Changes

- 3a37474: No functional change - trims verbose explanatory comments down to what the code's names and structure already convey.
- Updated dependencies [3a37474]
  - @lumi/contracts@3.1.1
  - @lumi/observability@3.1.1

## 3.1.0

### Patch Changes

- 82137ab: Relicense the core bot library and infrastructure packages from AGPL-3.0-only to GPL-3.0-only; first-party addons in lumi-addons remain AGPL-3.0-only. GPLv3 §13 / AGPLv3 §13 explicitly permit combining GPL and AGPL-licensed works, so third-party addons can keep depending on and importing the core SDK surface across the license boundary.
- 2ecec84: `GeneralSettingsForm` now stays in sync across browser tabs: a successful save broadcasts the new settings to other open tabs for the same guild (via `BroadcastChannel`, with a gossip handshake so a tab opened after the save still catches up), updating untouched fields while preserving and flagging any field the user has locally edited but not yet saved.
- 30364b7: `GeneralSettingsForm` now sends only the fields the user actually changed instead of the full form state, so a stale/prefetched baseline can no longer silently revert unrelated settings on save. The save-bar's Cmd/Ctrl+S shortcut also now respects an in-flight save.
- Updated dependencies [82137ab]
- Updated dependencies [f9e6d62]
  - @lumi/contracts@3.1.0
  - @lumi/observability@3.1.0

## 3.0.0

### Patch Changes

- 455d5f8: Bug-fix batch: quarantine cases now record `quarantine`/`unquarantine` actions (fixing the dead rejoin re-enforcement DB fallback) and lift stale cases on apply/undo; repository `getOrSet` gains single-flight dedup and no longer caches `undefined`; GUILD_CREATE entity-cache writes are pipelined instead of sequential; RabbitMQ `publishEvent` catches and logs publish failures centrally; empty catch blocks now log at debug; the unused `TRANSPORT` env var and dead `RestrictAction`/`BaseAction` scaffolding are removed; the `INTERACTION_DEFER_AT_GATEWAY` env var is removed (interactions are deferred in-process).
- 5d96c1b: Bug-fix batch from an architecture review: symlink install no longer crashes on a dangling target; `ping`/`telemetryStats` clean up their intervals and REST listeners on unload; `InvalidationBus` now does a full resync when its Redis subscriber reconnects after a dropped connection, and `ModuleStore`/`TempVcRegistry` consume it; cache invalidation gets a delayed double-delete to close the stale-write race; sharding's `reconcileAssignment` re-reads the assignment after acquiring the leader lock to close a split-brain window; `ClusterReadyTracker` is now per-replica instead of a single global key; `RedisSessionStore.flush()` restores unflushed entries on a failed pipeline instead of losing them; `RedisIdentifyThrottler` no longer sleeps 250ms when a bucket lock is already free; dashboard RPC mutation handlers re-validate the actor's live Discord permissions instead of trusting the (up to 8h stale) session; the RabbitMQ RPC bridge nacks malformed messages and always replies on handler failure instead of leaving the dashboard caller to time out, and the dashboard RPC client no longer leaks its timer/listener on a synchronous send failure; `RedisStreamsBus` still acks a poison message if publishing it to the DLQ fails, instead of retrying it forever; `GuildWriteTransaction`'s `Symbol.dispose` logs release failures instead of swallowing them; `SecurityService`'s anti-nuke/raid rate limiters increment and set their TTL atomically, and `grantVerified` swaps roles in one call instead of leaving a member stuck with both roles if the second call fails.
- Updated dependencies [70337e8]
- Updated dependencies [27d4684]
- Updated dependencies [70337e8]
  - @lumi/observability@3.0.0
  - @lumi/contracts@3.0.0

## 1.0.1

### Patch Changes

- 40741cc: Add project hygiene, Changesets release automation, pre-commit hooks, and documentation fact-checking across workspace packages.
- Updated dependencies [40741cc]
  - @lumi/observability@1.0.1
  - @lumi/contracts@1.0.1
