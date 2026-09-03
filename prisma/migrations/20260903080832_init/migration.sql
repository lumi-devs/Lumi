-- CreateTable
CREATE TABLE "global_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "bot_name" VARCHAR(64) NOT NULL DEFAULT 'Lumi',
    "default_prefix" VARCHAR(5) NOT NULL DEFAULT ',',
    "maintenance_mode" BOOLEAN NOT NULL DEFAULT false,
    "maintenance_message" VARCHAR(500),
    "invite_url" VARCHAR(200),
    "support_guild_id" VARCHAR(20),
    "extra" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "global_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global_module_state" (
    "module_name" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "reason" VARCHAR(200),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "global_module_state_pkey" PRIMARY KEY ("module_name")
);

-- CreateTable
CREATE TABLE "guilds" (
    "guild_id" VARCHAR(20) NOT NULL,
    "prefix" VARCHAR(5),
    "mute_role_id" VARCHAR(20),
    "locale" VARCHAR(10) NOT NULL DEFAULT 'en-US',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guilds_pkey" PRIMARY KEY ("guild_id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" VARCHAR(20) NOT NULL,
    "moderation_dm" BOOLEAN NOT NULL DEFAULT true,
    "locale" VARCHAR(10),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_module_state" (
    "guild_id" VARCHAR(20) NOT NULL,
    "module_name" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guild_module_state_pkey" PRIMARY KEY ("guild_id","module_name")
);

-- CreateTable
CREATE TABLE "guild_module_config" (
    "guild_id" VARCHAR(20) NOT NULL,
    "module_name" VARCHAR(64) NOT NULL,
    "config_key" VARCHAR(64) NOT NULL,
    "value_json" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guild_module_config_pkey" PRIMARY KEY ("guild_id","module_name","config_key")
);

-- CreateTable
CREATE TABLE "permits" (
    "id" SERIAL NOT NULL,
    "guild_id" VARCHAR(20) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "polarity" VARCHAR(8) NOT NULL DEFAULT 'grant',
    "nodes" TEXT[],
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permit_assignments" (
    "id" SERIAL NOT NULL,
    "permit_id" INTEGER NOT NULL,
    "guild_id" VARCHAR(20) NOT NULL,
    "target_type" VARCHAR(16) NOT NULL,
    "target_id" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permit_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_case_counter" (
    "guild_id" VARCHAR(20) NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "guild_case_counter_pkey" PRIMARY KEY ("guild_id")
);

-- CreateTable
CREATE TABLE "moderation_cases" (
    "id" SERIAL NOT NULL,
    "guild_id" VARCHAR(20) NOT NULL,
    "case_number" INTEGER NOT NULL,
    "user_id" VARCHAR(20) NOT NULL,
    "moderator_id" VARCHAR(20) NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "reason" VARCHAR(1000),
    "duration_seconds" INTEGER,
    "expires_at" TIMESTAMP(3),
    "message_id" VARCHAR(20),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appeals" (
    "id" SERIAL NOT NULL,
    "guild_id" VARCHAR(20) NOT NULL,
    "user_id" VARCHAR(20) NOT NULL,
    "case_id" INTEGER NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'pending',
    "message" VARCHAR(2000) NOT NULL,
    "reviewed_by" VARCHAR(20),
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mod_notes" (
    "id" SERIAL NOT NULL,
    "guild_id" VARCHAR(20) NOT NULL,
    "user_id" VARCHAR(20) NOT NULL,
    "author_id" VARCHAR(20) NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mod_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocklist" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR(20) NOT NULL,
    "guild_id" VARCHAR(20),
    "reason" VARCHAR(500),
    "blocked_by" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ignore_list" (
    "id" SERIAL NOT NULL,
    "guild_id" VARCHAR(20) NOT NULL,
    "channel_id" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ignore_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "afk_entries" (
    "user_id" VARCHAR(20) NOT NULL,
    "guild_id" VARCHAR(20) NOT NULL,
    "reason" VARCHAR(100) NOT NULL DEFAULT 'AFK',
    "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "afk_entries_pkey" PRIMARY KEY ("user_id","guild_id")
);

-- CreateTable
CREATE TABLE "downloader_repos" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "url" VARCHAR(200) NOT NULL,
    "branch" VARCHAR(64) NOT NULL DEFAULT 'master',
    "commit" VARCHAR(40),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "downloader_repos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "downloader_modules" (
    "repo_id" INTEGER NOT NULL,
    "module_name" VARCHAR(64) NOT NULL,
    "version" VARCHAR(32),
    "commit" VARCHAR(40),
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "installed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "downloader_modules_pkey" PRIMARY KEY ("repo_id","module_name")
);

-- CreateTable
CREATE TABLE "audit_ledger" (
    "id" SERIAL NOT NULL,
    "guild_id" VARCHAR(20) NOT NULL,
    "user_id" VARCHAR(20) NOT NULL,
    "action" VARCHAR(128) NOT NULL,
    "platform" VARCHAR(32) NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_dynamic_data" (
    "guild_id" VARCHAR(20) NOT NULL,
    "module_name" VARCHAR(64) NOT NULL,
    "target_id" VARCHAR(191) NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "module_dynamic_data_pkey" PRIMARY KEY ("guild_id","module_name","target_id","key")
);

-- CreateTable
CREATE TABLE "module_config_history" (
    "id" TEXT NOT NULL,
    "guild_id" VARCHAR(20) NOT NULL,
    "module_name" VARCHAR(64) NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB NOT NULL,
    "actor_id" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "module_config_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_config_overrides" (
    "id" TEXT NOT NULL,
    "guild_id" VARCHAR(20) NOT NULL,
    "module_name" VARCHAR(64) NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "model_type" VARCHAR(16) NOT NULL,
    "model_id" VARCHAR(20) NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "module_config_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warn_thresholds" (
    "guild_id" VARCHAR(20) NOT NULL,
    "warn_count" INTEGER NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "duration" VARCHAR(32),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warn_thresholds_pkey" PRIMARY KEY ("guild_id","warn_count")
);

-- CreateTable
CREATE TABLE "panic_states" (
    "guild_id" VARCHAR(20) NOT NULL,
    "actor_id" VARCHAR(20) NOT NULL,
    "invites_paused" BOOLEAN NOT NULL DEFAULT false,
    "locked_channels" JSONB NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "panic_states_pkey" PRIMARY KEY ("guild_id")
);

-- CreateTable
CREATE TABLE "verification_panels" (
    "guild_id" VARCHAR(20) NOT NULL,
    "channel_id" VARCHAR(20) NOT NULL,
    "message_id" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_panels_pkey" PRIMARY KEY ("guild_id")
);

-- CreateTable
CREATE TABLE "guild_backups" (
    "id" SERIAL NOT NULL,
    "guild_id" VARCHAR(20) NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guild_backups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tempvc_generators" (
    "guild_id" VARCHAR(20) NOT NULL,
    "channel_id" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "limit" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tempvc_generators_pkey" PRIMARY KEY ("guild_id","channel_id")
);

-- CreateTable
CREATE TABLE "tempvc_records" (
    "guild_id" VARCHAR(20) NOT NULL,
    "channel_id" VARCHAR(20) NOT NULL,
    "owner_id" VARCHAR(20) NOT NULL,
    "generator_id" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "number" INTEGER NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tempvc_records_pkey" PRIMARY KEY ("guild_id","channel_id")
);

-- CreateIndex
CREATE INDEX "guild_module_state_module_name_idx" ON "guild_module_state"("module_name");

-- CreateIndex
CREATE INDEX "permits_guild_id_kind_idx" ON "permits"("guild_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "permits_guild_id_name_key" ON "permits"("guild_id", "name");

-- CreateIndex
CREATE INDEX "permit_assignments_guild_id_target_type_target_id_idx" ON "permit_assignments"("guild_id", "target_type", "target_id");

-- CreateIndex
CREATE INDEX "permit_assignments_target_type_target_id_idx" ON "permit_assignments"("target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "permit_assignments_permit_id_target_type_target_id_key" ON "permit_assignments"("permit_id", "target_type", "target_id");

-- CreateIndex
CREATE INDEX "moderation_cases_guild_id_user_id_idx" ON "moderation_cases"("guild_id", "user_id");

-- CreateIndex
CREATE INDEX "moderation_cases_guild_id_created_at_idx" ON "moderation_cases"("guild_id", "created_at");

-- CreateIndex
CREATE INDEX "moderation_cases_guild_id_moderator_id_idx" ON "moderation_cases"("guild_id", "moderator_id");

-- CreateIndex
CREATE INDEX "moderation_cases_guild_id_action_idx" ON "moderation_cases"("guild_id", "action");

-- CreateIndex
CREATE INDEX "moderation_cases_user_id_idx" ON "moderation_cases"("user_id");

-- CreateIndex
CREATE INDEX "moderation_cases_moderator_id_idx" ON "moderation_cases"("moderator_id");

-- CreateIndex
CREATE INDEX "moderation_cases_guild_id_active_expires_at_idx" ON "moderation_cases"("guild_id", "active", "expires_at");

-- CreateIndex
CREATE INDEX "moderation_cases_active_id_idx" ON "moderation_cases"("active", "id");

-- CreateIndex
CREATE INDEX "moderation_cases_action_active_id_idx" ON "moderation_cases"("action", "active", "id");

-- CreateIndex
CREATE UNIQUE INDEX "moderation_cases_guild_id_case_number_key" ON "moderation_cases"("guild_id", "case_number");

-- CreateIndex
CREATE UNIQUE INDEX "appeals_case_id_key" ON "appeals"("case_id");

-- CreateIndex
CREATE INDEX "appeals_guild_id_status_created_at_idx" ON "appeals"("guild_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "appeals_guild_id_created_at_idx" ON "appeals"("guild_id", "created_at");

-- CreateIndex
CREATE INDEX "appeals_guild_id_status_idx" ON "appeals"("guild_id", "status");

-- CreateIndex
CREATE INDEX "appeals_user_id_idx" ON "appeals"("user_id");

-- CreateIndex
CREATE INDEX "appeals_reviewed_by_idx" ON "appeals"("reviewed_by");

-- CreateIndex
CREATE INDEX "mod_notes_guild_id_user_id_created_at_idx" ON "mod_notes"("guild_id", "user_id", "created_at");

-- CreateIndex
CREATE INDEX "mod_notes_guild_id_user_id_idx" ON "mod_notes"("guild_id", "user_id");

-- CreateIndex
CREATE INDEX "mod_notes_user_id_idx" ON "mod_notes"("user_id");

-- CreateIndex
CREATE INDEX "mod_notes_author_id_idx" ON "mod_notes"("author_id");

-- CreateIndex
CREATE INDEX "blocklist_guild_id_created_at_idx" ON "blocklist"("guild_id", "created_at");

-- CreateIndex
CREATE INDEX "blocklist_guild_id_idx" ON "blocklist"("guild_id");

-- CreateIndex
CREATE INDEX "blocklist_blocked_by_idx" ON "blocklist"("blocked_by");

-- CreateIndex
CREATE UNIQUE INDEX "blocklist_user_id_guild_id_key" ON "blocklist"("user_id", "guild_id");

-- CreateIndex
CREATE INDEX "ignore_list_guild_id_idx" ON "ignore_list"("guild_id");

-- CreateIndex
CREATE UNIQUE INDEX "ignore_list_guild_id_channel_id_key" ON "ignore_list"("guild_id", "channel_id");

-- CreateIndex
CREATE INDEX "afk_entries_guild_id_idx" ON "afk_entries"("guild_id");

-- CreateIndex
CREATE UNIQUE INDEX "downloader_repos_name_key" ON "downloader_repos"("name");

-- CreateIndex
CREATE INDEX "downloader_modules_module_name_idx" ON "downloader_modules"("module_name");

-- CreateIndex
CREATE INDEX "audit_ledger_guild_id_created_at_idx" ON "audit_ledger"("guild_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_ledger_guild_id_user_id_idx" ON "audit_ledger"("guild_id", "user_id");

-- CreateIndex
CREATE INDEX "audit_ledger_created_at_idx" ON "audit_ledger"("created_at");

-- CreateIndex
CREATE INDEX "audit_ledger_user_id_idx" ON "audit_ledger"("user_id");

-- CreateIndex
CREATE INDEX "module_dynamic_data_module_name_key_idx" ON "module_dynamic_data"("module_name", "key");

-- CreateIndex
CREATE INDEX "module_dynamic_data_target_id_idx" ON "module_dynamic_data"("target_id");

-- CreateIndex
CREATE INDEX "module_config_history_guild_id_module_name_idx" ON "module_config_history"("guild_id", "module_name");

-- CreateIndex
CREATE INDEX "module_config_history_guild_id_created_at_idx" ON "module_config_history"("guild_id", "created_at");

-- CreateIndex
CREATE INDEX "module_config_history_guild_id_module_name_created_at_idx" ON "module_config_history"("guild_id", "module_name", "created_at");

-- CreateIndex
CREATE INDEX "module_config_history_actor_id_idx" ON "module_config_history"("actor_id");

-- CreateIndex
CREATE INDEX "module_config_overrides_guild_id_module_name_idx" ON "module_config_overrides"("guild_id", "module_name");

-- CreateIndex
CREATE INDEX "module_config_overrides_model_id_idx" ON "module_config_overrides"("model_id");

-- CreateIndex
CREATE UNIQUE INDEX "module_config_overrides_guild_id_module_name_key_model_type_key" ON "module_config_overrides"("guild_id", "module_name", "key", "model_type", "model_id");

-- CreateIndex
CREATE INDEX "panic_states_actor_id_idx" ON "panic_states"("actor_id");

-- CreateIndex
CREATE INDEX "guild_backups_guild_id_created_at_idx" ON "guild_backups"("guild_id", "created_at");

-- CreateIndex
CREATE INDEX "tempvc_records_owner_id_idx" ON "tempvc_records"("owner_id");

-- AddForeignKey
ALTER TABLE "guild_module_state" ADD CONSTRAINT "guild_module_state_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_module_config" ADD CONSTRAINT "guild_module_config_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permits" ADD CONSTRAINT "permits_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permit_assignments" ADD CONSTRAINT "permit_assignments_permit_id_fkey" FOREIGN KEY ("permit_id") REFERENCES "permits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permit_assignments" ADD CONSTRAINT "permit_assignments_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_case_counter" ADD CONSTRAINT "guild_case_counter_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "moderation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mod_notes" ADD CONSTRAINT "mod_notes_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocklist" ADD CONSTRAINT "blocklist_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ignore_list" ADD CONSTRAINT "ignore_list_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "afk_entries" ADD CONSTRAINT "afk_entries_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downloader_modules" ADD CONSTRAINT "downloader_modules_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "downloader_repos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_ledger" ADD CONSTRAINT "audit_ledger_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_config_history" ADD CONSTRAINT "module_config_history_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_config_overrides" ADD CONSTRAINT "module_config_overrides_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warn_thresholds" ADD CONSTRAINT "warn_thresholds_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "panic_states" ADD CONSTRAINT "panic_states_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_panels" ADD CONSTRAINT "verification_panels_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_backups" ADD CONSTRAINT "guild_backups_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tempvc_generators" ADD CONSTRAINT "tempvc_generators_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tempvc_records" ADD CONSTRAINT "tempvc_records_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;
