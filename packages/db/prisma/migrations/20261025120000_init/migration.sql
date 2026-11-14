-- CreateEnum
CREATE TYPE "Polarity" AS ENUM ('GRANT', 'DENY');

-- CreateEnum
CREATE TYPE "PermitTargetType" AS ENUM ('USER', 'ROLE', 'CHANNEL');

-- CreateTable
CREATE TABLE "guilds" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "icon" TEXT,
    "owner_id" TEXT NOT NULL DEFAULT '',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guilds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permits" (
    "id" SERIAL NOT NULL,
    "guild_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "node" TEXT NOT NULL,
    "polarity" "Polarity" NOT NULL,
    "position" INTEGER NOT NULL,
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3),
    "schedule" JSONB,
    "timezone" TEXT,
    "conditions" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permit_assignments" (
    "id" SERIAL NOT NULL,
    "permit_id" INTEGER NOT NULL,
    "guild_id" TEXT NOT NULL,
    "target_type" "PermitTargetType" NOT NULL,
    "target_id" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "permit_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_modules" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leveling_configs" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "xp_per_message" INTEGER NOT NULL DEFAULT 15,
    "xp_per_minute_vc" INTEGER NOT NULL DEFAULT 10,
    "cooldown_seconds" INTEGER NOT NULL DEFAULT 60,
    "xp_curve" JSONB NOT NULL DEFAULT '{}',
    "role_rewards" JSONB NOT NULL DEFAULT '[]',
    "multiplier_roles" JSONB NOT NULL DEFAULT '[]',
    "ignored_channels" JSONB NOT NULL DEFAULT '[]',
    "ignored_roles" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leveling_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leveling_users" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "xp" BIGINT NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 0,
    "total_xp" BIGINT NOT NULL DEFAULT 0,
    "last_xp_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leveling_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "economy_configs" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "currency_name" TEXT NOT NULL DEFAULT 'Credits',
    "currency_symbol" TEXT NOT NULL DEFAULT '💰',
    "starting_balance" INTEGER NOT NULL DEFAULT 0,
    "daily_amount" INTEGER NOT NULL DEFAULT 100,
    "weekly_amount" INTEGER NOT NULL DEFAULT 500,
    "monthly_amount" INTEGER NOT NULL DEFAULT 2000,
    "interest_rate" DOUBLE PRECISION NOT NULL DEFAULT 0.01,
    "tax_rate" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "work_cooldown" INTEGER NOT NULL DEFAULT 3600,
    "work_min_pay" INTEGER NOT NULL DEFAULT 50,
    "work_max_pay" INTEGER NOT NULL DEFAULT 200,
    "shop_items" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "economy_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "economy_users" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "bank_balance" BIGINT NOT NULL DEFAULT 0,
    "total_earned" BIGINT NOT NULL DEFAULT 0,
    "total_spent" BIGINT NOT NULL DEFAULT 0,
    "last_daily_at" TIMESTAMP(3),
    "last_weekly_at" TIMESTAMP(3),
    "last_monthly_at" TIMESTAMP(3),
    "last_work_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "economy_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "economy_transactions" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "from_user_id" TEXT,
    "to_user_id" TEXT,
    "amount" BIGINT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "economy_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "economy_inventory" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "economy_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tempvc_configs" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "category_id" TEXT,
    "template_name" TEXT NOT NULL DEFAULT '➕ {user}''s Channel',
    "default_bitrate" INTEGER NOT NULL DEFAULT 64000,
    "default_user_limit" INTEGER NOT NULL DEFAULT 0,
    "max_channels" INTEGER NOT NULL DEFAULT 50,
    "max_per_user" INTEGER NOT NULL DEFAULT 1,
    "empty_timeout_ms" INTEGER NOT NULL DEFAULT 300000,
    "owner_leave_delete" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tempvc_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tempvc_channels" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "tempvc_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_configs" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "verification_mode" TEXT NOT NULL DEFAULT 'none',
    "verification_role" TEXT,
    "verification_channel" TEXT,
    "captcha_provider" TEXT,
    "captcha_secret" TEXT,
    "antinuke_enabled" BOOLEAN NOT NULL DEFAULT true,
    "antinuke_thresholds" JSONB NOT NULL DEFAULT '{}',
    "antinuke_punishment" TEXT NOT NULL DEFAULT 'ban',
    "join_gate_enabled" BOOLEAN NOT NULL DEFAULT false,
    "join_gate_heuristics" JSONB NOT NULL DEFAULT '{}',
    "panic_enabled" BOOLEAN NOT NULL DEFAULT false,
    "panic_previous_perms" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "security_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_pending" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_pending_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheets" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rows" JSONB NOT NULL DEFAULT '[]',
    "triggers" JSONB NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installed_addons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "source_url" TEXT,
    "installed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "manifest" JSONB NOT NULL,

    CONSTRAINT "installed_addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_id" TEXT,
    "target_type" TEXT,
    "changes" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "permits_guild_id_idx" ON "permits"("guild_id");

-- CreateIndex
CREATE UNIQUE INDEX "permits_guild_id_name_key" ON "permits"("guild_id", "name");

-- CreateIndex
CREATE INDEX "permit_assignments_permit_id_idx" ON "permit_assignments"("permit_id");

-- CreateIndex
CREATE INDEX "permit_assignments_target_type_target_id_idx" ON "permit_assignments"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "permit_assignments_guild_id_idx" ON "permit_assignments"("guild_id");

-- CreateIndex
CREATE UNIQUE INDEX "permit_assignments_permit_id_target_type_target_id_key" ON "permit_assignments"("permit_id", "target_type", "target_id");

-- CreateIndex
CREATE INDEX "guild_modules_guild_id_idx" ON "guild_modules"("guild_id");

-- CreateIndex
CREATE UNIQUE INDEX "guild_modules_guild_id_module_key" ON "guild_modules"("guild_id", "module");

-- CreateIndex
CREATE UNIQUE INDEX "leveling_configs_guild_id_key" ON "leveling_configs"("guild_id");

-- CreateIndex
CREATE INDEX "leveling_users_guild_id_level_idx" ON "leveling_users"("guild_id", "level");

-- CreateIndex
CREATE INDEX "leveling_users_guild_id_xp_idx" ON "leveling_users"("guild_id", "xp");

-- CreateIndex
CREATE UNIQUE INDEX "leveling_users_guild_id_user_id_key" ON "leveling_users"("guild_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "economy_configs_guild_id_key" ON "economy_configs"("guild_id");

-- CreateIndex
CREATE INDEX "economy_users_guild_id_balance_idx" ON "economy_users"("guild_id", "balance");

-- CreateIndex
CREATE UNIQUE INDEX "economy_users_guild_id_user_id_key" ON "economy_users"("guild_id", "user_id");

-- CreateIndex
CREATE INDEX "economy_transactions_guild_id_idx" ON "economy_transactions"("guild_id");

-- CreateIndex
CREATE INDEX "economy_transactions_guild_id_from_user_id_idx" ON "economy_transactions"("guild_id", "from_user_id");

-- CreateIndex
CREATE INDEX "economy_transactions_guild_id_to_user_id_idx" ON "economy_transactions"("guild_id", "to_user_id");

-- CreateIndex
CREATE INDEX "economy_transactions_created_at_idx" ON "economy_transactions"("created_at");

-- CreateIndex
CREATE INDEX "economy_inventory_guild_id_user_id_idx" ON "economy_inventory"("guild_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "economy_inventory_guild_id_user_id_item_id_key" ON "economy_inventory"("guild_id", "user_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "tempvc_configs_guild_id_key" ON "tempvc_configs"("guild_id");

-- CreateIndex
CREATE UNIQUE INDEX "tempvc_channels_channel_id_key" ON "tempvc_channels"("channel_id");

-- CreateIndex
CREATE INDEX "tempvc_channels_guild_id_idx" ON "tempvc_channels"("guild_id");

-- CreateIndex
CREATE INDEX "tempvc_channels_guild_id_owner_id_idx" ON "tempvc_channels"("guild_id", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "security_configs_guild_id_key" ON "security_configs"("guild_id");

-- CreateIndex
CREATE INDEX "verification_pending_guild_id_user_id_idx" ON "verification_pending"("guild_id", "user_id");

-- CreateIndex
CREATE INDEX "sheets_guild_id_idx" ON "sheets"("guild_id");

-- CreateIndex
CREATE UNIQUE INDEX "installed_addons_name_version_key" ON "installed_addons"("name", "version");

-- CreateIndex
CREATE INDEX "audit_logs_guild_id_idx" ON "audit_logs"("guild_id");

-- CreateIndex
CREATE INDEX "audit_logs_guild_id_user_id_idx" ON "audit_logs"("guild_id", "user_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "permits" ADD CONSTRAINT "permits_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permit_assignments" ADD CONSTRAINT "permit_assignments_permit_id_fkey" FOREIGN KEY ("permit_id") REFERENCES "permits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permit_assignments" ADD CONSTRAINT "permit_assignments_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_modules" ADD CONSTRAINT "guild_modules_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leveling_configs" ADD CONSTRAINT "leveling_configs_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "economy_configs" ADD CONSTRAINT "economy_configs_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tempvc_configs" ADD CONSTRAINT "tempvc_configs_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_configs" ADD CONSTRAINT "security_configs_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheets" ADD CONSTRAINT "sheets_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

