-- Keyset (cursor) pagination on guild.audit.list, guild.appeals.list and
-- guild.history.list orders by (created_at, id) desc, breaking ties on id
-- for rows sharing a created_at (e.g. a batched audit-log flush). The
-- existing (guild_id, created_at) indexes don't cover that tie-break.
CREATE INDEX IF NOT EXISTS "audit_ledger_guild_id_created_at_id_idx"
  ON "audit_ledger" ("guild_id", "created_at", "id");

CREATE INDEX IF NOT EXISTS "appeals_guild_id_created_at_id_idx"
  ON "appeals" ("guild_id", "created_at", "id");

CREATE INDEX IF NOT EXISTS "module_config_history_guild_id_created_at_id_idx"
  ON "module_config_history" ("guild_id", "created_at", "id");
