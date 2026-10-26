-- CreateTable
CREATE TABLE "afk_entries" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "afk_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "afk_entries_guild_id_idx" ON "afk_entries"("guild_id");

-- CreateIndex
CREATE UNIQUE INDEX "afk_entries_guild_id_user_id_key" ON "afk_entries"("guild_id", "user_id");
