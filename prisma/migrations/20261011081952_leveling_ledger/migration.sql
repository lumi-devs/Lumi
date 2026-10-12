-- CreateTable
CREATE TABLE "level_xp_gains" (
    "id" SERIAL NOT NULL,
    "guild_id" VARCHAR(20) NOT NULL,
    "user_id" VARCHAR(20) NOT NULL,
    "amount" INTEGER NOT NULL,
    "source" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "level_xp_gains_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "level_xp_gains_guild_id_created_at_idx" ON "level_xp_gains"("guild_id", "created_at");

-- CreateIndex
CREATE INDEX "level_xp_gains_guild_id_user_id_created_at_idx" ON "level_xp_gains"("guild_id", "user_id", "created_at");

-- AddForeignKey
ALTER TABLE "level_xp_gains" ADD CONSTRAINT "level_xp_gains_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;
