# 0007: Data growth: retention + archive, not native table partitioning

Status: Accepted

## Context

Audit entries, moderation cases, config history, economy transactions, and
per-guild backups all grow unbounded with usage. Postgres native table
partitioning is the standard answer for unbounded append-heavy tables, but it
adds schema/migration complexity a self-hosted single-instance Postgres
doesn't need if volume is governed by simple retention instead.

## Decision

Growth is bounded by deleting old data on a schedule, not by partitioning:

- `handleDataRetentionFire()`
  (`packages/core/src/modules/core/services/data-retention.ts`) runs as a
  scheduled task and purges audit entries, moderation cases (and their
  resolved appeals), config history, and economy transactions past their own
  env-configured window (`AUDIT_RETENTION_DAYS`,
  `CONFIG_HISTORY_RETENTION_DAYS`, `MODERATION_RETENTION_DAYS`,
  `ECONOMY_TRANSACTION_RETENTION_DAYS`), plus departed-guild data past
  `GUILD_DATA_RETENTION_DAYS` once the whole shard fleet confirms the
  departure. `MODERATION_RETENTION_DAYS` defaults to `0` (keep forever) —
  moderation history has legal/audit value an operator opts out of, not into
  — and even with a window set, an active case or pending appeal is never
  eligible regardless of age. Each purge deletes in bounded batches (1000
  rows) rather than one unbounded `DELETE`, and when `AUDIT_ARCHIVE_DIR` is
  set, every batch is written as gzip-compressed JSONL under it before being
  deleted, so an operator can keep the data outside Postgres instead of
  losing it outright.
- `GuildBackup` rows (`prisma/schema.prisma`) stay capped per guild in
  Postgres, not moved to object storage:
  `SecurityRepository.pruneBackups(guildId, keep)` deletes everything past
  the most recent `keep` rows, so size per guild is bounded by a constant.
- `Json` columns (config values, audit details, case old/new values, backup
  data, message rich content, ...) stay plain `Json`, not normalized — none
  are queried by an inner path today, so normalizing would buy nothing.

## Consequences

The schema stays simple — no partition-aware migrations or per-partition
index maintenance — at the cost of a purge sweep doing real delete work on a
schedule instead of a cheap `DROP PARTITION`. Right trade-off at
self-hosted, single-cluster scale; revisit if retention windows and traffic
grow enough that sequential `DELETE ... WHERE` sweeps bottleneck, or a `Json`
column starts needing inner-path queries.
