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
    "mod_role_id" VARCHAR(20),
    "admin_role_id" VARCHAR(20),
    "mod_log_channel_id" VARCHAR(20),
    "mute_role_id" VARCHAR(20),
    "locale" VARCHAR(10) NOT NULL DEFAULT 'en-US',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "no_mention_spam_window_ms" INTEGER,
    "no_mention_spam_limit" INTEGER,
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
CREATE TABLE "permission_overrides" (
    "guild_id" VARCHAR(20) NOT NULL,
    "command_path" VARCHAR(128) NOT NULL,
    "model_type" VARCHAR(16) NOT NULL,
    "model_id" VARCHAR(20) NOT NULL,
    "allow" BOOLEAN NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_overrides_pkey" PRIMARY KEY ("guild_id","command_path","model_type","model_id")
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
    "installed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "downloader_modules_pkey" PRIMARY KEY ("repo_id","module_name")
);

-- CreateTable
CREATE TABLE "raid_lockdowns" (
    "guild_id" VARCHAR(20) NOT NULL,
    "original_level" INTEGER NOT NULL,
    "unlocks_at" TIMESTAMP(3) NOT NULL,
    "triggered_by" VARCHAR(20) NOT NULL DEFAULT '0',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raid_lockdowns_pkey" PRIMARY KEY ("guild_id")
);

-- CreateTable
CREATE TABLE "role_mappings" (
    "guild_id" VARCHAR(20) NOT NULL,
    "discord_role_id" VARCHAR(20) NOT NULL,
    "permission_level" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_mappings_pkey" PRIMARY KEY ("guild_id","discord_role_id")
);

-- CreateTable
CREATE TABLE "tab_permissions" (
    "guild_id" VARCHAR(20) NOT NULL,
    "role_id" VARCHAR(20) NOT NULL,
    "tab_id" VARCHAR(64) NOT NULL,
    "allow" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tab_permissions_pkey" PRIMARY KEY ("guild_id","role_id","tab_id")
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

-- CreateIndex
CREATE INDEX "guild_module_state_module_name_idx" ON "guild_module_state"("module_name");

-- CreateIndex
CREATE INDEX "guild_module_config_guild_id_module_name_idx" ON "guild_module_config"("guild_id", "module_name");

-- CreateIndex
CREATE INDEX "permission_overrides_guild_id_command_path_idx" ON "permission_overrides"("guild_id", "command_path");

-- CreateIndex
CREATE INDEX "moderation_cases_guild_id_user_id_idx" ON "moderation_cases"("guild_id", "user_id");

-- CreateIndex
CREATE INDEX "moderation_cases_guild_id_created_at_idx" ON "moderation_cases"("guild_id", "created_at");

-- CreateIndex
CREATE INDEX "moderation_cases_user_id_idx" ON "moderation_cases"("user_id");

-- CreateIndex
CREATE INDEX "moderation_cases_guild_id_active_expires_at_idx" ON "moderation_cases"("guild_id", "active", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "moderation_cases_guild_id_case_number_key" ON "moderation_cases"("guild_id", "case_number");

-- CreateIndex
CREATE INDEX "blocklist_user_id_idx" ON "blocklist"("user_id");

-- CreateIndex
CREATE INDEX "blocklist_guild_id_idx" ON "blocklist"("guild_id");

-- CreateIndex
CREATE UNIQUE INDEX "blocklist_user_id_guild_id_key" ON "blocklist"("user_id", "guild_id");

-- CreateIndex
CREATE INDEX "ignore_list_guild_id_idx" ON "ignore_list"("guild_id");

-- CreateIndex
CREATE UNIQUE INDEX "ignore_list_guild_id_channel_id_key" ON "ignore_list"("guild_id", "channel_id");

-- CreateIndex
CREATE INDEX "afk_entries_user_id_idx" ON "afk_entries"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "downloader_repos_name_key" ON "downloader_repos"("name");

-- CreateIndex
CREATE INDEX "raid_lockdowns_unlocks_at_idx" ON "raid_lockdowns"("unlocks_at");

-- CreateIndex
CREATE INDEX "tab_permissions_guild_id_role_id_idx" ON "tab_permissions"("guild_id", "role_id");

-- CreateIndex
CREATE INDEX "audit_ledger_guild_id_created_at_idx" ON "audit_ledger"("guild_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_ledger_guild_id_user_id_idx" ON "audit_ledger"("guild_id", "user_id");

-- CreateIndex
CREATE INDEX "module_config_history_guild_id_module_name_idx" ON "module_config_history"("guild_id", "module_name");

-- CreateIndex
CREATE INDEX "module_config_overrides_guild_id_module_name_idx" ON "module_config_overrides"("guild_id", "module_name");

-- CreateIndex
CREATE UNIQUE INDEX "module_config_overrides_guild_id_module_name_key_model_type_key" ON "module_config_overrides"("guild_id", "module_name", "key", "model_type", "model_id");

-- AddForeignKey
ALTER TABLE "guild_module_state" ADD CONSTRAINT "guild_module_state_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_module_config" ADD CONSTRAINT "guild_module_config_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_overrides" ADD CONSTRAINT "permission_overrides_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_case_counter" ADD CONSTRAINT "guild_case_counter_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ignore_list" ADD CONSTRAINT "ignore_list_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "afk_entries" ADD CONSTRAINT "afk_entries_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downloader_modules" ADD CONSTRAINT "downloader_modules_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "downloader_repos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raid_lockdowns" ADD CONSTRAINT "raid_lockdowns_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_mappings" ADD CONSTRAINT "role_mappings_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tab_permissions" ADD CONSTRAINT "tab_permissions_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_ledger" ADD CONSTRAINT "audit_ledger_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;
