/*
  Warnings:

  - You are about to drop the column `admin_role_id` on the `guilds` table. All the data in the column will be lost.
  - You are about to drop the column `mod_log_channel_id` on the `guilds` table. All the data in the column will be lost.
  - You are about to drop the column `mod_role_id` on the `guilds` table. All the data in the column will be lost.
  - You are about to drop the column `no_mention_spam_limit` on the `guilds` table. All the data in the column will be lost.
  - You are about to drop the column `no_mention_spam_window_ms` on the `guilds` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "guilds" DROP COLUMN "admin_role_id",
DROP COLUMN "mod_log_channel_id",
DROP COLUMN "mod_role_id",
DROP COLUMN "no_mention_spam_limit",
DROP COLUMN "no_mention_spam_window_ms";
