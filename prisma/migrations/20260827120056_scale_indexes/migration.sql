-- DropIndex
DROP INDEX "afk_entries_user_id_idx";

-- DropIndex
DROP INDEX "blocklist_user_id_idx";

-- DropIndex
DROP INDEX "guild_module_config_guild_id_module_name_idx";

-- CreateIndex
CREATE INDEX "afk_entries_guild_id_idx" ON "afk_entries"("guild_id");

-- CreateIndex
CREATE INDEX "audit_ledger_user_id_idx" ON "audit_ledger"("user_id");

-- CreateIndex
CREATE INDEX "moderation_cases_active_expires_at_idx" ON "moderation_cases"("active", "expires_at");

-- CreateIndex
CREATE INDEX "moderation_cases_action_active_idx" ON "moderation_cases"("action", "active");
