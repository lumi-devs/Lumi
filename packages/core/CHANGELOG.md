# @lumi/core

## 3.3.0

### Minor Changes

- 26b7418: **Module System & Release Versioning**: Built-in modules now dynamically inherit the bot release version (`CoreVersion` from `packages/core/package.json`), matching standard modular bot architecture. Removed manual static module version strings in favor of automated manifest synchronization during Changesets releases via `bun run version:sync`.
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
- 624ed17: **Addon SDK**: `acquireRedisLock` now returns `{ release, token }` instead of the release
  function directly - `token` is a fencing token addons can pass to the new `verifyRedisLock`
  to detect a stale lock holder before a guarded write. Update any addon calling
  `acquireRedisLock` from `const release = await acquireRedisLock(...)` to
  `const { release } = await acquireRedisLock(...)`.
- 624ed17: **Addon SDK & Core Permissions**: Removed legacy `PermissionLevel` enum and `resolvePermissionLevel`.
  Authorization in Lumi is fully unified around granular permit nodes (`hasRequiredPermit(target, permitNode)`, `PermitResolver`, and `RequirePermitPrecondition`), respecting dynamic role positions, channel overrides, polarities, and anti-nuke quarantine.
- ab7db3e: **Security**: Added an Advertising Account join-gate filter that flags members whose display name is itself a link or invite (`filter_advertising_enabled`/`filter_advertising_action`), closing a gap identified against Wick's Join Gate.
  
  **Addon SDK**: Added `ConfigRepository.mutateModuleConfig` and `GuildKVRepository.mutateModuleData` - Redis-lock-guarded atomic read-modify-write for one config/KV row, so addon and module code doing get-then-set on a list no longer races a concurrent writer.
  
  **Permits**: Added `/permit export` and `/permit import` for bulk backup/copy of custom permits and their role assignments as JSON.
  
  **Docs**: Documented the previously-undocumented backup/restore ("imaging") system in `docs/modules.md`, the new Join Gate filter, and the deliberate decision to keep the dashboard RPC-split so the bot runs standalone without it.
  
  Also removed two stale worktrees left over from a prior session - their uncommitted diff would have reintroduced three bugs already fixed on `main` (panic-mode serialization/re-show guard, verification-timeout role check, backup restore position tracking).

### Patch Changes

- 64a07d1: **Bug Fixes**: Fixed anti-nuke vanity-URL audit attribution to correlate the audit-log entry to the actual `vanity_url_code` change instead of accepting any recent GuildUpdate entry (B-BUG-1). Fixed guild restore to map recreated category ids so child channels keep their parent, and to restore role/channel `position` (B-BUG-2, B-BUG-3). Isolated per-case errors in the warn-decay sweep so one failing case can't starve the rest of the run (D-BUG-1). Fixed dashboard auth to stop clobbering `isBotOwner` right after it was correctly re-confirmed by the whoami RPC (A-BUG-1). Made the audit-log flush fall back to per-row inserts on batch failure instead of stalling forever behind one bad entry (C-BUG-1). Redis lock renewal failures are now tracked and logged instead of silently swallowed (C-BUG-2). Entity cache now clears optional fields on transition to empty instead of leaving stale data cached for 24h (C-BUG-3).
- 7f53af7: Hardened GitHub Actions CI/CD workflows and container build pipeline:
  - Add safe build-time environment variable fallbacks in `@lumi/dashboard` for Next.js static page collection.
  - Optimized multi-stage `Dockerfile` and `Dockerfile.dashboard` for lightweight Alpine container execution.
  - Added comprehensive Turborepo build verification job to `ci.yml`.
  - Standardized PR, Push, and Merge Queue (`merge_group`) triggers across all workflows.
- 5f4b651: Unified audit logging in `ConfigRepository.setModuleConfig` and `setModuleConfigsMany` by accepting optional `actorId`. When provided, changes are automatically recorded in `db.configHistory.logConfigChange`, and `ConfigUtility` now delegates audit logging directly to the repository layer.
- 026126f: Deduplicated guild config validation and cache-invalidation logic. Added `validateModuleConfigValue` to the module config-schema helpers and switched `ConfigUtility.setConfig` to use it instead of an inline duplicate of the same `schema.shape[key].parse()` check. Extracted the repeated per-module Redis invalidation key pair out of `ConfigRepository`'s four mutating methods into a single private helper. No behavior changes.
- 6434687: Fixed pre-existing test infrastructure debt: moderation and AFK test suites never mocked `container.invalidation` (or asserted the removed `container.redis.del` fallback), left over from the phase 3 & 3.5 module restructuring that made `container.invalidation.invalidate()` the sole cache-invalidation path. No production behavior changes.
- 1ad2046: Added `defineEnv` and `envField` parser builders (`string`, `integer`, `boolean`) to `packages/core/src/lib/env.ts`. This aggregates all missing and invalid environment variable errors into a single combined startup validation error, ensuring misconfigured deployments fail fast at bootstrap rather than failing mid-request.
- 14d5067: Export `@lumi/core/env` subpath for lightweight runtime bootstrap and replace direct `process.env` bypasses across core and worker with unified env accessors.
- 9959510: Optimize GitHub Actions CI/CD workflows and automated checks:
  - Implement granular paths filtering in `ci.yml` and `docker.yml` to smart-skip jobs on markdown/docs/unrelated changes.
  - Add `ci-status` aggregator job in `ci.yml` (`if: always()`) for robust GitHub branch protection evaluation without false failures on skipped matrix jobs.
  - Enable Turborepo and Bun local caching in GitHub Actions runners across all workflows.
  - Streamline `changeset-check.yml` by eliminating redundant Bun setup and dependency installations.
  - Set `NEXT_TELEMETRY_DISABLED=1` and `SKIP_ENV_VALIDATION=1` in CI environment.
- 98ac5b3: Add Phase 5 chaos fault injection test suite for high-availability verification.
- @lumi/contracts@3.3.0
  - @lumi/event-bus@3.3.0
  - @lumi/observability@3.3.0
  - @lumi/sharding@3.3.0

## 3.2.0

### Patch Changes

- 125dfa1: Dashboard bot-owner detection (`session.isBotOwner`) now comes from a new `auth.whoami` RPC that defers to the worker's `PermitResolver.isBotOwner`, instead of a separate `BOT_OWNERS` dashboard env var. This means the Discord application's actual owner is recognized automatically, the same way it already is for in-Discord commands — no manual env-var configuration needed, and one less place for bot-owner lists to drift out of sync.
- 5079ab2: Security fixes: addon/module management (`/repo`, `/download`, `/module`, and the hub panel's Add-ons and core-update actions) now requires a real Bot Owner instead of the `owner.*` permit node, which every guild owner satisfied; moderation commands now refuse targets that outrank the invoker; `/purge regex` screens user-supplied patterns for catastrophic backtracking before running them on the gateway loop; the dashboard's `guild.config.set` RPC now goes through `ConfigService` (schema validation, audit history, change hooks) instead of writing raw JSON; and the Discord OAuth2 access token is no longer placed on the NextAuth session (it was reachable from the browser via `/api/auth/session`).
- Updated dependencies [125dfa1]
  - @lumi/contracts@3.2.0
  - @lumi/event-bus@3.2.0
  - @lumi/sharding@3.2.0
  - @lumi/observability@3.2.0

## 3.1.1

### Patch Changes

- 3a37474: No functional change - trims verbose explanatory comments down to what the code's names and structure already convey.
- Updated dependencies [3a37474]
  - @lumi/event-bus@3.1.1
  - @lumi/sharding@3.1.1
  - @lumi/contracts@3.1.1
  - @lumi/observability@3.1.1

## 3.1.0

### Minor Changes

- 653797b: Export `sendReply`, `replySuccess`, `replyError`, `replyWarning`, `replyInfo`, `assertPermit`, and the `CommandReplyTarget` type from the public addon SDK (`lumi/commands`), giving third-party addons standalone reply/permission-assertion helpers that don't require reaching into internal (`#core`/`#lib`) modules.

### Patch Changes

- 82137ab: Relicense the core bot library and infrastructure packages from AGPL-3.0-only to GPL-3.0-only; first-party addons in lumi-addons remain AGPL-3.0-only. GPLv3 §13 / AGPLv3 §13 explicitly permit combining GPL and AGPL-licensed works, so third-party addons can keep depending on and importing the core SDK surface across the license boundary.
- 4fbd1e6: Serialize addon repo git operations per repo name so a manual "update repo" click can no longer race the scheduled auto-update task's own `git pull` on the same checkout directory.
- e1f5c3b: Re-run addon validation (the forbidden internal-alias check) against every already-installed module in a repo after a `git pull` updates it, instead of only validating on first install — an addon that passed validation once could otherwise pull in code crossing the internal `#core`/`#lib` boundary without ever being re-checked.
- 25e9905: Fix several concurrency and correctness issues found in an audit pass: RPC actor authorization on privileged core-rpc handlers (`repoAdd`, `repoList`, `repoModules`, `systemDashboardGet`), a mod-lift handler crash on `voice_mute` cases, and related regression coverage.
- 1157762: Route `guildSettingsSet`'s writes through the per-guild write transaction instead of calling the repository directly, and close a cache-aside race in `Repository.getOrSet` where a concurrent invalidation could be clobbered by a stale repopulation (via a per-key fence marker checked before and after the underlying fetch).
- 146c469: Fix broadcast consumer groups replaying the full stream backlog on every restart (groups now start from `$` for broadcast subscriptions instead of `0`), stop acking a message when its DLQ write fails (so a dead-letter failure no longer silently loses the message), and guard `runClaim`'s `pendingDeliveryCount` call with try/catch so a transient Redis error doesn't kill the claim loop.
- 0dcc859: `guildDashboardGet` RPC handler now re-checks the actor's live Discord permissions (owner or ManageGuild/Administrator) like the other dashboard RPC handlers, closing a gap that let any authenticated dashboard actor read any guild's settings and module configs by guild ID alone.
- 7562e46: Serialize `ModuleStore.setEnabled()` and `ModuleStore.reload()` per module name so overlapping calls (e.g. a rapid double-toggle from the dashboard) can no longer interleave and leave a module's enabled state or loaded instance inconsistent.
- 45b9864: `/untimeout` and `/vcunmute` now close out the case(s) they supersede and cancel that case's scheduled auto-lift job, instead of leaving the original case active so its lift job redundantly re-lifts an already-lifted mute later.
- 32d5e2c: RabbitMQ RPC shutdown now drains in-flight requests (bounded by a timeout) before closing the channel/connection instead of dropping them, and the process now has an `unhandledRejection` handler so a rejected promise is logged instead of crashing the process outright.
- b17febf: Serialize the verification captcha's read-modify-write challenge-state update per member so two concurrent submissions (a double-click, or a retried interaction) can no longer both read stale state and clobber each other's write — closing a race that could weaken the attempt limit or double-process a verification outcome.
- 357d9f1: Fix a crash in the scheduled mod-lift handler when a case's action is `voice_mute` — it now routes to `VoiceMuteAction.undoRaw` instead of falling through unhandled.
- Updated dependencies [82137ab]
- Updated dependencies [f9e6d62]
- Updated dependencies [146c469]
- Updated dependencies [626d6ee]
  - @lumi/contracts@3.1.0
  - @lumi/event-bus@3.1.0
  - @lumi/observability@3.1.0
  - @lumi/sharding@3.1.0

## 3.0.0

### Major Changes

- 70337e8: Remove the split gateway/worker topology; the worker now owns its own Discord
  Gateway connection.

  `apps/gateway` relayed raw Discord dispatch packets to workers over Redis
  Streams, and the worker replayed them into discord.js's internal
  `client.ws.handlePacket()`. That method assumes single-process invariants, which
  the relay could not satisfy: interaction pre-acknowledgement state was lost,
  `client.application` was unset when Sapphire registered slash commands, and two
  WebSocket sessions competed for one bot token.

  **Breaking changes:**

  - `apps/gateway` is deleted. Remove any `LUMI_ROLE=gateway` process from your
    deployment; the worker replaces it entirely.
  - `LUMI_ROLE` accepts only `worker` (default) and `scheduler`. The `monolith`
    and `gateway` roles are gone - `monolith` is now simply `worker`.
  - `RawGatewayPublisher`, `RawGatewayConsumer`, and the `RawGatewayEnvelope` /
    `rawGatewayStream` contracts are removed from `@lumi/event-bus` and
    `@lumi/contracts`.
  - `INTERACTION_DEFER_AT_GATEWAY` is removed; interactions are always deferred
    in-process.
  - Kubernetes: `gateway-statefulset.yaml` and `worker-scaledobject.yaml` are
    removed, and the worker deployment becomes a StatefulSet - it now holds real
    per-shard state, so replica count is a shard-assignment decision rather than a
    queue-lag autoscaler target.

  `@lumi/sharding` is now wired into the worker: with `CLUSTER_NAME` set, replicas
  divide the shard count from `GET /gateway/bot` between themselves, throttle
  IDENTIFY through Redis, and resume persisted sessions across restarts. Command
  registration against Discord's REST routes is gated behind a Redis leader lock
  so only one replica performs it per boot. Multi-replica deployments should set
  `DISCORD_PROXY_URL` to a shared `nirn-proxy` so REST rate-limit buckets stay
  coordinated. The task queue, scheduler RPC, and dashboard RabbitMQ RPC paths are
  unchanged.

### Minor Changes

- 342061d: Add a public addon SDK (`"lumi"`, `"lumi/commands"`, `"lumi/permissions"`, `"lumi/scheduling"`, `"lumi/ui"`, `"lumi/utils"`), modeled on Red-DiscordBot's `redbot.core`/`redbot.core.commands` namespacing, as a real Node/Bun package self-reference against the repo root. Third-party addon code should import from these instead of reaching into `#core/*`, `#lib/*`, `#utilities/*`, or `#database/*` directly - the Downloader's addon linter (`validateAddon`) now warns when it sees a direct internal-path import. Fixes a latent bug where addons declaring `requirements` in `info.json` got a synthetic local `package.json` that silently broke all internal-path resolution, `"lumi"` included, by creating a closer package boundary than the root.

  Also adds a one-time confirmation prompt before `,repo add` clones a third-party repository (warns that addon code runs inside the bot process with full container access), and `,module pin <name>` / `,module unpin <name>` (mirroring Red's `[p]cog pin`/`unpin`) to freeze an installed addon's version against `,module update`.

- 70337e8: Protect the event loop from guild-controlled work. Filter regex now runs in a `node:worker_threads` worker (`lib/regex-worker/`) with a hard per-evaluation timeout, restart-on-hang, and automatic disabling of the offending pattern; patterns are probed against adversarial inputs when saved, so catastrophic backtracking is rejected at config time rather than discovered on the message path. Fire-and-forget sends (mod-log entries, security alerts, logging cards) move onto the BullMQ `send-message` task with one in-flight send per channel, so a Discord outage or a rate-limited log channel delays them instead of losing them or blocking a handler; interaction replies stay inline. Adds `lumi_event_loop_delay_seconds` (p50/p99/max) and a `container.configValueValidators` hook for pre-write config validation.
- c1c11a6: Heat-based escalation for the `filter` module. Each member accrues a decaying
  "heat" score from spam signals (per message, per mention, repeated messages, and
  hard filter hits); as heat crosses configurable thresholds the member is warned,
  timed out, then quarantined. Heat decays linearly on read via a self-expiring
  Redis key (no cron), and per-guild heat config is cached in memory alongside the
  compiled rules so the hot message path adds no extra config reads.
- adfe8ac: `/purge` gains Red-DiscordBot-style filtered cleanup subcommands alongside
  the existing plain `messages` variant: `user` (a specific member's
  messages), `bots`, `links` (messages containing a URL), `regex` (custom
  pattern), and `duration` (messages newer than a given age, e.g. `10m`/`2h`).
  Each supports an optional `amount` cap (default 100) and reuses the existing
  rate-limit-aware bulk/individual delete machinery and >50-message
  confirmation prompt. `/purge` now also has full slash-command support
  (previously prefix-only).
- 4b2b884: New `security` module with a Wick-style anti-nuke detector: watches audit-log entries for mass bans, kicks, channel/role deletions, and webhook creation, counts per-executor actions in a sliding Redis window, and responds with automatic quarantine, ban, or a logged alert (guild owner, the bot, and configured trusted roles are exempt). Quarantine and mod-log helpers move to `#lib/moderation` for cross-module reuse. The worker ships the GuildModeration, GuildInvites, and GuildWebhooks intents so audit-log, ban, role, webhook, and invite dispatches reach the module.
- b98e33f: Adds `/panic` (admin-only server lockdown: pauses invites, mutes `@everyone`
  in text channels with a one-button Revert) and `/permit` (grant/revoke/list
  custom and enforced permit nodes on roles or members). The hub panel's
  Permissions tab now grants permits through a role/user picker followed by a
  node picker instead of the old free-text "Allow/Deny a Command" modal, which
  wrote grants in a scheme (`chatInputCommandPath`) that the actual permit
  precondition never checked — that dead code path
  (`PermissionOverridesPrecondition`) and its unused `PermissionService`
  methods are removed.
- 1503ca0: Join-gate raid detection and member verification for the `security` module. New members can be screened by account age and join-burst rate (kick, timeout, or quarantine during a raid), and an emoji-sequence captcha replaces DM-based verification: admins post a persistent Components V2 panel with `/verifypanel`, and clicking Verify runs the challenge entirely in an ephemeral, in-place interaction (no reliance on open DMs). Passing grants the verified role and strips the pending role; a periodic sweep evicts members who never verify when kick-on-timeout is enabled. Panel and panic state persist through a new `SecurityRepository` (proper Prisma models) rather than the generic module KV store.
- 27d4684: Group config fields into navigable subsections in the `/lumi` config panel.
  Modules with many settings (security, filter, logging) no longer render as a
  flat, multi-page scroll of every field; a `group` on each config field collects
  related settings into a section, and the detail view shows one section at a time
  with a "jump to section" select. Small modules are unchanged. Large ungrouped
  modules fall back to automatic paging so the component budget is never exceeded.
- 0d30456: Reimagined control panels on the Components V2 kit: `/lumi panel` gains a persistent five-tab bar, guild-icon thumbnail header, section rows with inline action buttons (permit revoke, addon browse/install/uninstall, prefix edit), and paginated permission lists. The module config panel now renders every field as a section row with an inline toggle/edit button and per-field edit subpanels, structurally eliminating the five-action-row overflow that silently dropped select menus. Adds a typed i18n key system (Skyra-style `T`/`FT` keys with compile-checked interpolation args), a new `panels` translation namespace localizing the entire admin surface, tempvc subview localization, and a 5s cache for ping panel data.
- 2aa3396: Migrate the `tempvc` module off the generic `ModuleData` KV store onto dedicated
  Prisma tables (`TempVcGenerator`, `TempVcRecord`) via a new `TempVcRepository`.
  Built-in modules now own real tables end to end; the KV store is reserved for
  third-party addons. The module's in-memory registry and InvalidationBus behaviour
  are unchanged. Note: existing tempvc generators stored under the old KV rows are
  not auto-migrated (temp channels are ephemeral); re-create generators after deploy.

### Patch Changes

- 496bd98: Removes dead code left behind by the panel-kit rebuild: unused `*Row` select-menu
  wrapper functions in `#utilities/panels.js` (`createUserSelectMenuRow`,
  `createRoleSelectMenuRow`, `createChannelSelectMenuRow`,
  `createMentionableSelectMenuRow`, `createStringSelectMenuRow`,
  `createMultiSelectMenuRow`), and unused layout helpers (`metric`,
  `metricsBlock`, `statBlock`, `createSection`, `smallSeparator`, `SB`) along
  with their now-unreferenced `Field`/`StatItem` types. No behavior changes -
  none of these had any callers.
- ee531ab: docs: update AGENTS.md with 3-step changeset release pipeline and GitHub Action bot automation capabilities.
- 455d5f8: Bug-fix batch: quarantine cases now record `quarantine`/`unquarantine` actions (fixing the dead rejoin re-enforcement DB fallback) and lift stale cases on apply/undo; repository `getOrSet` gains single-flight dedup and no longer caches `undefined`; GUILD_CREATE entity-cache writes are pipelined instead of sequential; RabbitMQ `publishEvent` catches and logs publish failures centrally; empty catch blocks now log at debug; the unused `TRANSPORT` env var and dead `RestrictAction`/`BaseAction` scaffolding are removed; the `INTERACTION_DEFER_AT_GATEWAY` env var is removed (interactions are deferred in-process).
- 5d96c1b: Bug-fix batch from an architecture review: symlink install no longer crashes on a dangling target; `ping`/`telemetryStats` clean up their intervals and REST listeners on unload; `InvalidationBus` now does a full resync when its Redis subscriber reconnects after a dropped connection, and `ModuleStore`/`TempVcRegistry` consume it; cache invalidation gets a delayed double-delete to close the stale-write race; sharding's `reconcileAssignment` re-reads the assignment after acquiring the leader lock to close a split-brain window; `ClusterReadyTracker` is now per-replica instead of a single global key; `RedisSessionStore.flush()` restores unflushed entries on a failed pipeline instead of losing them; `RedisIdentifyThrottler` no longer sleeps 250ms when a bucket lock is already free; dashboard RPC mutation handlers re-validate the actor's live Discord permissions instead of trusting the (up to 8h stale) session; the RabbitMQ RPC bridge nacks malformed messages and always replies on handler failure instead of leaving the dashboard caller to time out, and the dashboard RPC client no longer leaks its timer/listener on a synchronous send failure; `RedisStreamsBus` still acks a poison message if publishing it to the DLQ fails, instead of retrying it forever; `GuildWriteTransaction`'s `Symbol.dispose` logs release failures instead of swallowing them; `SecurityService`'s anti-nuke/raid rate limiters increment and set their TTL atomically, and `grantVerified` swaps roles in one call instead of leaving a member stuck with both roles if the second call fails.
- 69b8295: Add cutText truncation and max item limits to makeListCard in cards.ts to prevent Discord message payload length rejections.
- c12e5f6: Unified Components V2 panel kit: new `settingRow`/`thumbRow`/`tabRow`/`confirmRow`/`backRow` builders and an `updatePanel` re-render helper. Removes the dead, unwired session navigation framework (NavigationSession, menu/forms pages, session pagination). Cards now render real body content beside thumbnails instead of a placeholder, and the accent-color guard no longer relies on falsy zero.
- 70337e8: Readability pass over the core package: no behaviour change.

  Moderation commands now share a `ModerationCommand` / `ModerationSubcommand`
  base in `lib/moderation/`, which owns the defer → translate → resolve target →
  act → reply pipeline that eight commands each hand-rolled. Commands declare
  `resolveTarget`, `action` and `buildSuccessMessage`; the optional `preHandle`
  hook exists because `CommandContext` binds positional prefix arguments in
  getter-call order, so options sitting between target and reason (`timeout`'s
  duration, `ban add`'s `delete_days`) need a slot in the fixed call order.

  `BaseCommand` and `BaseSubcommand` no longer carry duplicate
  `reply*`/`checkPermit` wrappers - nothing called them. Command builder defaults
  are applied through a prototype-inheriting registry view rather than by
  temporarily overwriting `registerChatInputCommand` and restoring it in a
  `finally`, so the shared registry is never mutated.

  Oversized files are split along existing conventions: `lib/i18n/keys.ts` becomes
  a barrel over per-domain files under `i18n/keys/`; `LumiClient` composes
  `ReadinessProbes` and `CommandRegistrationLeaderElection` instead of
  implementing them; the hub and config panels move their view builders into
  `modules/core/ui/`; and every module now follows one-Piece-per-file for
  interaction handlers.

  `DownloaderService.syncApplicationCommands` reads an undocumented private field
  of Sapphire's `ApplicationCommandRegistry` to re-sync slash commands after a
  live addon install. That is now documented and guarded - if the field
  disappears in a future `@sapphire/framework`, the sync is skipped with a warning
  rather than throwing.

- Updated dependencies [70337e8]
- Updated dependencies [4b2b884]
- Updated dependencies [5d96c1b]
- Updated dependencies [a453146]
- Updated dependencies [27d4684]
- Updated dependencies [70337e8]
  - @lumi/observability@3.0.0
  - @lumi/event-bus@3.0.0
  - @lumi/sharding@3.0.0
  - @lumi/contracts@3.0.0

## 1.0.1

### Patch Changes

- 40741cc: Add project hygiene, Changesets release automation, pre-commit hooks, and documentation fact-checking across workspace packages.
- Updated dependencies [40741cc]
  - @lumi/event-bus@1.0.1
  - @lumi/sharding@1.0.1
  - @lumi/observability@1.0.1
  - @lumi/contracts@1.0.1
