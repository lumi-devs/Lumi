# 0012: Feature-flag rollout buckets a stable hash, not a stored assignment

Status: Accepted

## Context

Shipping an experimental code path (a new UI, a changed moderation heuristic) behind a kill
switch is a recurring need, and ad-hoc versions of it already existed: `GlobalModuleState`
disables a whole module fleet-wide with a `reason`, and `Global.serverLockGuildIds` hardcodes a
specific guild list for one narrow feature. Neither generalizes to "enable this for 25% of
guilds, forced on for guild X regardless of the percentage" without adding a bespoke table and
bespoke evaluation code per feature.

A percentage rollout needs some way to answer "is this guild in the rolled-out set" that stays
*stable* as the rollout percentage changes over time (a guild that's in at 10% should still be in
at 20%, not reshuffled), without a write on every evaluation and without per-guild state to
backfill when a new guild joins mid-rollout.

## Decision

`FeatureFlag` (`key`, `enabled`, `rolloutPercent`, `description`, `updatedAt`, `updatedBy`) and
`FeatureFlagOverride` (`flagKey`, `guildId`, `enabled`, unique on the pair) are two small tables
owned by `FeatureFlagRepository` (`packages/core/src/lib/prisma/repositories/
FeatureFlagRepository.ts`), registered on `DatabaseService` as `container.db.featureFlags`
alongside every other repository.

`isFlagEnabled(key, guildId?)` (`packages/core/src/lib/feature-flags/index.ts`) is the one
evaluation entry point: an override for `(key, guildId)` wins outright; otherwise the flag must
be `enabled` and `fnv1aHash(`${key}:${guildId ?? "global"}`) % 100` must fall under
`rolloutPercent`. FNV-1a (`#lib/feature-flags/hash.ts`) is a stable, non-cryptographic hash - no
stored per-guild assignment, no migration/backfill when a flag's percentage changes or a new
guild appears, and every process computes the same bucket from the same two inputs without
coordination. Both the flag row and any override are cached per-key through the same
`getOrSet`/`container.invalidation` cache-aside pattern as every other repository (ADR 0006), not
a bespoke cache.

This buys determinism at the cost of true independence between flags that happen to pick nearby
hash buckets for the same guild - two flags are not guaranteed to split a guild population the
same way "randomly" would, only consistently for each flag. That trade-off is acceptable here:
nothing in this codebase correlates one flag's rollout with another's, and the alternative
(storing a random per-guild assignment at flag-creation time) would need a write for every guild
on every new flag and a migration path for every guild that joins afterward.

Management is bot-owner-only RPC (`system.flags.list` / `.set` / `.override.set` /
`.override.delete`, `packages/contracts/src/rpc/system.ts` +
`packages/core/src/lib/rpc/system-rpc.ts`) - there is no bot command, matching the permit
system's dashboard-only precedent (ADR 0011's call-site table applies the same `botOwner` auth
path). `updatedBy` on the flag row is the audit trail, the same convention `GlobalModuleState.
reason` already uses for a global (not per-guild) mutation that has no natural home in
`AuditLedger`, whose `guildId` column is required.

## Consequences

A future experimental path is gated with one `isFlagEnabled()` call and two RPC calls to manage
it, instead of a bespoke table + bespoke dashboard wiring per feature. The hash is deliberately
not cryptographic and not secret - a sufficiently motivated guild could in principle predict its
own bucket for a known flag key, which is an acceptable trade-off for a rollout mechanism, not a
security boundary. If a future need calls for guild populations that are independent across
flags (e.g. two simultaneous A/B tests that must not correlate), that would need a per-flag salt
or a stored assignment - deliberately deferred until something actually needs it, since no caller
does yet.
