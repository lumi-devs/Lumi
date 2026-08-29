-- DropIndex
DROP INDEX "moderation_cases_action_active_idx";

-- DropIndex
DROP INDEX "moderation_cases_active_expires_at_idx";

-- CreateIndex
CREATE INDEX "moderation_cases_active_id_idx" ON "moderation_cases"("active", "id");

-- CreateIndex
CREATE INDEX "moderation_cases_action_active_id_idx" ON "moderation_cases"("action", "active", "id");
