ALTER TABLE "leveling_users" ADD COLUMN "message_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "leveling_users" ADD COLUMN "voice_minutes" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "leveling_users_guild_id_voice_minutes_idx" ON "leveling_users"("guild_id", "voice_minutes");
