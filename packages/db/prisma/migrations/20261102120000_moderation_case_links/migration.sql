-- AlterTable
ALTER TABLE "moderation_cases" ADD COLUMN "message_id" TEXT,
ADD COLUMN "channel_id" TEXT;

-- CreateIndex
CREATE INDEX "moderation_cases_guild_id_channel_id_idx" ON "moderation_cases"("guild_id", "channel_id");
