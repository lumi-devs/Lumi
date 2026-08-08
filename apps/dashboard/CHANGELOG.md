# @lumi/dashboard

## 3.3.0

### Minor Changes

- ef84827: Wick-bot feature parity across the `security` and `filter` modules:

  - **Heat System v2** (`filter`): new heat factors (attachments, emoji, links, a webhook multiplier), an escalating timeout multiplier for repeat offenders, heat panic mode (instant timeout for flagged raiders during an active panic window), and auto-lockdown on guild-wide mention flooding with a durable scheduled auto-unlock.
  - **Anti-Nuke hardening** (`security`): quarantine hold (reverts unauthorized role changes on a quarantined member), vanity URL change protection, automatic revert of any dangerous permission granted to `@everyone`, and an option to lock moderation commands while panic mode is active.
  - **Backup/Restore** (`security`): a new `GuildBackup` model, an hourly snapshot sweep of role/channel structure for guilds with Anti-Nuke on, a `/restore` command, and auto-restore on panic revert.
  - **Verification modes** (`security`): `none` (press-to-enter) and `web` (dashboard-hosted challenge) modes alongside the existing emoji captcha, plus suspicious-account-only targeting.
  - **Join Gate filter expansion** (`security`): independent no-avatar / min-age / unverified-bot / username-pattern filters, each with its own action.
  - **Join Raid algorithmic flags** (`security`): suspicious-account-scoped raid response, username-similarity and account-creation-clustering heuristics.
  - **Guided Setup wizard** (dashboard): one-click bootstrap that creates the quarantine role and log channels and enables Anti-Nuke/Join Gate with sane defaults.

### Patch Changes

- 8858636: Restyles the dropdown menu component to use the dashboard's own design tokens instead of generic shadcn defaults, and fixes the temp-VC generator form: the name-pattern placeholder legend moves into an info tooltip with a live preview chip (fixing a row-alignment bug caused by long wrapping hint text), and the "Creates" column no longer shows two identical preview names when the pattern has no numbering placeholder.
- Updated dependencies [19dedd9]
- Updated dependencies [ef84827]
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
