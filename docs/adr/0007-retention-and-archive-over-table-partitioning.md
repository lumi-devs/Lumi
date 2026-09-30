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
  scheduled task and purges audit entries, moderation cases, config history,
  and economy transactions past their own env-configured window
  (`AUDIT_RETENTION_DAYS`, `CASE_RETENTION_DAYS`,
  `CONFIG_HISTORY_RETENTION_DAYS`, `ECONOMY_TRANSACTION_RETENTION_DAYS`),
  plus departed-guild data past `GUILD_DATA_RETENTION_DAYS` once the whole
  shard fleet confirms the departure.
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
