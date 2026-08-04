# @lumi/dashboard

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
