CREATE TABLE "security_backups" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'scheduled',
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_backups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "security_backups_guild_id_created_at_idx" ON "security_backups"("guild_id", "created_at");
