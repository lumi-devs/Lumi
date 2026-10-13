-- Hot-path lookup indexes.
CREATE INDEX "reactionrole_menus_channel_id_idx" ON "reactionrole_menus"("channel_id");
CREATE INDEX "tempvc_records_generator_id_idx" ON "tempvc_records"("generator_id");
CREATE INDEX "gdpr_export_jobs_status_created_at_idx" ON "gdpr_export_jobs"("status", "created_at");

-- Drop strict-prefix redundants (longest covering index kept).
DROP INDEX "appeals_guild_id_created_at_idx";
DROP INDEX "audit_ledger_guild_id_created_at_idx";
DROP INDEX "module_config_history_guild_id_created_at_idx";
