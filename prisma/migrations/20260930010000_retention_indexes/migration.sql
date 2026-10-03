-- Indexes for the configurable data-retention sweep (ADR 0007): each purge
-- walks its table in bounded, id-ordered batches, filtered by the retention
-- cutoff (and, for moderation cases/appeals, by "not active/pending").

-- Cross-guild config-history sweep, filtered by `created_at` - mirrors
-- audit_ledger's existing plain `created_at` index.
CREATE INDEX IF NOT EXISTS "module_config_history_created_at_idx"
  ON "module_config_history" ("created_at");

-- Cross-guild moderation-case sweep: lifted cases (active = false) older
-- than the configured window, paginated by id.
CREATE INDEX IF NOT EXISTS "moderation_cases_active_created_at_id_idx"
  ON "moderation_cases" ("active", "created_at", "id");

-- Cross-guild appeal sweep: resolved appeals (status != pending) older than
-- the configured window, paginated by id.
CREATE INDEX IF NOT EXISTS "appeals_status_created_at_id_idx"
  ON "appeals" ("status", "created_at", "id");
