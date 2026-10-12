-- CreateTable
CREATE TABLE "level_accounts" (
    "guild_id" VARCHAR(20) NOT NULL,
    "user_id" VARCHAR(20) NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "voice_minutes" INTEGER NOT NULL DEFAULT 0,
    "last_xp_at" TIMESTAMP(3),

    CONSTRAINT "level_accounts_pkey" PRIMARY KEY ("guild_id","user_id")
);

-- CreateIndex
CREATE INDEX "level_accounts_user_id_idx" ON "level_accounts"("user_id");

-- CreateIndex
CREATE INDEX "level_accounts_guild_id_level_xp_idx" ON "level_accounts"("guild_id", "level", "xp");

-- AddForeignKey
ALTER TABLE "level_accounts" ADD CONSTRAINT "level_accounts_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;
