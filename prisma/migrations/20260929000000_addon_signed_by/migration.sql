-- AlterTable
ALTER TABLE "downloader_repos" ADD COLUMN "signed_by" VARCHAR(255);

-- AlterTable
ALTER TABLE "downloader_modules" ADD COLUMN "signed_by" VARCHAR(255);
