-- Permits: Wick-style whitelist scopes
ALTER TABLE "permits" ADD COLUMN "whitelist_scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Custom commands
CREATE TABLE "custom_command_groups" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_command_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "custom_commands" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "group_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger_type" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "responses" JSONB NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cooldown_seconds" INTEGER NOT NULL DEFAULT 0,
    "permission_nodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_commands_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "custom_command_schedules" (
    "id" TEXT NOT NULL,
    "command_id" TEXT NOT NULL,
    "cron" TEXT,
    "interval_seconds" INTEGER,
    "timezone" TEXT,
    "next_run_at" TIMESTAMP(3) NOT NULL,
    "last_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_command_schedules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "custom_command_kv" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_command_kv_pkey" PRIMARY KEY ("id")
);

-- Tickets
CREATE TABLE "ticket_categories" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT,
    "description" TEXT,
    "staff_role_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "ping_role_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "questions" JSONB NOT NULL DEFAULT '[]',
    "naming_template" TEXT NOT NULL DEFAULT 'ticket-{user}',
    "default_priority" TEXT NOT NULL DEFAULT 'normal',
    "position" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ticket_panels" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "message_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_panels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "category_id" TEXT,
    "channel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "claimed_by" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "subject" TEXT,
    "close_reason" TEXT,
    "closed_by" TEXT,
    "closed_at" TIMESTAMP(3),
    "transcript_url" TEXT,
    "feedback" INTEGER,
    "feedback_comment" TEXT,
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ticket_messages" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "message_id" TEXT,
    "author_id" TEXT NOT NULL,
    "author_name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ticket_notes" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ticket_blacklist" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reason" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_blacklist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ticket_tags" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_tags_pkey" PRIMARY KEY ("id")
);

-- Role menus
CREATE TABLE "role_menu_groups" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'multiple',
    "require_one" BOOLEAN NOT NULL DEFAULT false,
    "auto_toggle" BOOLEAN NOT NULL DEFAULT true,
    "max_selections" INTEGER,
    "temp_duration_seconds" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_menu_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role_menu_options" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "emoji" TEXT,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "role_menu_options_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role_menu_messages" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "group_id" TEXT,
    "channel_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "style" TEXT NOT NULL DEFAULT 'buttons',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_menu_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role_menu_temp_roles" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_menu_temp_roles_pkey" PRIMARY KEY ("id")
);

-- Reminders
CREATE TABLE "reminders" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "channel_id" TEXT,
    "message" TEXT NOT NULL,
    "remind_at" TIMESTAMP(3) NOT NULL,
    "delivered_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "recurring_cron" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- Server stats
CREATE TABLE "stats_snapshots" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "member_count" INTEGER NOT NULL,
    "online_count" INTEGER NOT NULL DEFAULT 0,
    "idle_count" INTEGER NOT NULL DEFAULT 0,
    "dnd_count" INTEGER NOT NULL DEFAULT 0,
    "offline_count" INTEGER NOT NULL DEFAULT 0,
    "voice_count" INTEGER NOT NULL DEFAULT 0,
    "channel_count" INTEGER NOT NULL DEFAULT 0,
    "role_count" INTEGER NOT NULL DEFAULT 0,
    "boost_count" INTEGER NOT NULL DEFAULT 0,
    "boost_tier" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stats_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stats_message_buckets" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "bucket_start" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stats_message_buckets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stats_voice_buckets" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "bucket_start" TIMESTAMP(3) NOT NULL,
    "seconds" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stats_voice_buckets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stats_events" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "user_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stats_events_pkey" PRIMARY KEY ("id")
);

-- Role automation
CREATE TABLE "autorole_pending" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "assign_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "autorole_pending_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "voice_roles" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "category_id" TEXT,
    "role_id" TEXT NOT NULL,
    "grace_seconds" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voice_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "voice_role_sessions" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grace_until" TIMESTAMP(3),

    CONSTRAINT "voice_role_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bulk_role_jobs" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "filter" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bulk_role_jobs_pkey" PRIMARY KEY ("id")
);

-- Verification
CREATE TABLE "verification_tokens" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);

-- Indexes and constraints
CREATE UNIQUE INDEX "custom_command_groups_guild_id_name_key" ON "custom_command_groups"("guild_id", "name");
CREATE INDEX "custom_command_groups_guild_id_idx" ON "custom_command_groups"("guild_id");
CREATE UNIQUE INDEX "custom_commands_guild_id_name_key" ON "custom_commands"("guild_id", "name");
CREATE INDEX "custom_commands_guild_id_idx" ON "custom_commands"("guild_id");
CREATE INDEX "custom_commands_guild_id_trigger_type_idx" ON "custom_commands"("guild_id", "trigger_type");
CREATE UNIQUE INDEX "custom_command_schedules_command_id_key" ON "custom_command_schedules"("command_id");
CREATE INDEX "custom_command_schedules_next_run_at_idx" ON "custom_command_schedules"("next_run_at");
CREATE UNIQUE INDEX "custom_command_kv_guild_id_user_id_key_key" ON "custom_command_kv"("guild_id", "user_id", "key");
CREATE INDEX "custom_command_kv_guild_id_expires_at_idx" ON "custom_command_kv"("guild_id", "expires_at");
CREATE UNIQUE INDEX "ticket_categories_guild_id_name_key" ON "ticket_categories"("guild_id", "name");
CREATE INDEX "ticket_categories_guild_id_idx" ON "ticket_categories"("guild_id");
CREATE UNIQUE INDEX "ticket_panels_message_id_key" ON "ticket_panels"("message_id");
CREATE INDEX "ticket_panels_guild_id_idx" ON "ticket_panels"("guild_id");
CREATE UNIQUE INDEX "tickets_channel_id_key" ON "tickets"("channel_id");
CREATE INDEX "tickets_guild_id_status_idx" ON "tickets"("guild_id", "status");
CREATE INDEX "tickets_guild_id_user_id_idx" ON "tickets"("guild_id", "user_id");
CREATE INDEX "tickets_guild_id_last_activity_at_idx" ON "tickets"("guild_id", "last_activity_at");
CREATE INDEX "ticket_messages_ticket_id_created_at_idx" ON "ticket_messages"("ticket_id", "created_at");
CREATE INDEX "ticket_notes_ticket_id_created_at_idx" ON "ticket_notes"("ticket_id", "created_at");
CREATE UNIQUE INDEX "ticket_blacklist_guild_id_user_id_key" ON "ticket_blacklist"("guild_id", "user_id");
CREATE INDEX "ticket_blacklist_guild_id_idx" ON "ticket_blacklist"("guild_id");
CREATE UNIQUE INDEX "ticket_tags_guild_id_name_key" ON "ticket_tags"("guild_id", "name");
CREATE INDEX "ticket_tags_guild_id_idx" ON "ticket_tags"("guild_id");
CREATE UNIQUE INDEX "role_menu_groups_guild_id_name_key" ON "role_menu_groups"("guild_id", "name");
CREATE INDEX "role_menu_groups_guild_id_idx" ON "role_menu_groups"("guild_id");
CREATE UNIQUE INDEX "role_menu_options_group_id_role_id_key" ON "role_menu_options"("group_id", "role_id");
CREATE INDEX "role_menu_options_group_id_idx" ON "role_menu_options"("group_id");
CREATE UNIQUE INDEX "role_menu_messages_message_id_key" ON "role_menu_messages"("message_id");
CREATE INDEX "role_menu_messages_guild_id_idx" ON "role_menu_messages"("guild_id");
CREATE INDEX "role_menu_messages_message_id_idx" ON "role_menu_messages"("message_id");
CREATE UNIQUE INDEX "role_menu_temp_roles_guild_id_user_id_role_id_key" ON "role_menu_temp_roles"("guild_id", "user_id", "role_id");
CREATE INDEX "role_menu_temp_roles_expires_at_idx" ON "role_menu_temp_roles"("expires_at");
CREATE INDEX "reminders_remind_at_status_idx" ON "reminders"("remind_at", "status");
CREATE INDEX "reminders_guild_id_user_id_idx" ON "reminders"("guild_id", "user_id");
CREATE UNIQUE INDEX "stats_snapshots_guild_id_captured_at_key" ON "stats_snapshots"("guild_id", "captured_at");
CREATE INDEX "stats_snapshots_guild_id_captured_at_idx" ON "stats_snapshots"("guild_id", "captured_at");
CREATE UNIQUE INDEX "stats_message_buckets_guild_id_channel_id_user_id_bucket_start_key" ON "stats_message_buckets"("guild_id", "channel_id", "user_id", "bucket_start");
CREATE INDEX "stats_message_buckets_guild_id_bucket_start_idx" ON "stats_message_buckets"("guild_id", "bucket_start");
CREATE INDEX "stats_message_buckets_guild_id_user_id_bucket_start_idx" ON "stats_message_buckets"("guild_id", "user_id", "bucket_start");
CREATE INDEX "stats_message_buckets_guild_id_channel_id_bucket_start_idx" ON "stats_message_buckets"("guild_id", "channel_id", "bucket_start");
CREATE UNIQUE INDEX "stats_voice_buckets_guild_id_channel_id_user_id_bucket_start_key" ON "stats_voice_buckets"("guild_id", "channel_id", "user_id", "bucket_start");
CREATE INDEX "stats_voice_buckets_guild_id_bucket_start_idx" ON "stats_voice_buckets"("guild_id", "bucket_start");
CREATE INDEX "stats_voice_buckets_guild_id_user_id_bucket_start_idx" ON "stats_voice_buckets"("guild_id", "user_id", "bucket_start");
CREATE INDEX "stats_voice_buckets_guild_id_channel_id_bucket_start_idx" ON "stats_voice_buckets"("guild_id", "channel_id", "bucket_start");
CREATE INDEX "stats_events_guild_id_type_created_at_idx" ON "stats_events"("guild_id", "type", "created_at");
CREATE INDEX "stats_events_guild_id_created_at_idx" ON "stats_events"("guild_id", "created_at");
CREATE UNIQUE INDEX "autorole_pending_guild_id_user_id_key" ON "autorole_pending"("guild_id", "user_id");
CREATE INDEX "autorole_pending_assign_at_idx" ON "autorole_pending"("assign_at");
CREATE UNIQUE INDEX "voice_roles_guild_id_channel_id_key" ON "voice_roles"("guild_id", "channel_id");
CREATE INDEX "voice_roles_guild_id_idx" ON "voice_roles"("guild_id");
CREATE UNIQUE INDEX "voice_role_sessions_guild_id_user_id_channel_id_role_id_key" ON "voice_role_sessions"("guild_id", "user_id", "channel_id", "role_id");
CREATE INDEX "voice_role_sessions_grace_until_idx" ON "voice_role_sessions"("grace_until");
CREATE INDEX "bulk_role_jobs_guild_id_status_idx" ON "bulk_role_jobs"("guild_id", "status");
CREATE UNIQUE INDEX "verification_tokens_token_hash_key" ON "verification_tokens"("token_hash");
CREATE INDEX "verification_tokens_guild_id_user_id_idx" ON "verification_tokens"("guild_id", "user_id");
CREATE INDEX "verification_tokens_expires_at_idx" ON "verification_tokens"("expires_at");

ALTER TABLE "custom_commands" ADD CONSTRAINT "custom_commands_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "custom_command_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "custom_command_schedules" ADD CONSTRAINT "custom_command_schedules_command_id_fkey" FOREIGN KEY ("command_id") REFERENCES "custom_commands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "ticket_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_notes" ADD CONSTRAINT "ticket_notes_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_menu_options" ADD CONSTRAINT "role_menu_options_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "role_menu_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_menu_messages" ADD CONSTRAINT "role_menu_messages_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "role_menu_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
