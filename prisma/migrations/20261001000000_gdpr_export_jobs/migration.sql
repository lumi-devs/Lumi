-- Async GDPR export jobs (W5c): large exports run on the scheduled-tasks
-- queue instead of the request path, writing a gzipped JSON file tracked by
-- this table.

-- CreateEnum
CREATE TYPE "GdprExportJobStatus" AS ENUM ('pending', 'running', 'done', 'failed');

-- CreateTable
CREATE TABLE "gdpr_export_jobs" (
    "id" TEXT NOT NULL,
    "user_id" VARCHAR(20) NOT NULL,
    "requested_by" VARCHAR(20) NOT NULL,
    "status" "GdprExportJobStatus" NOT NULL DEFAULT 'pending',
    "error" VARCHAR(1000),
    "file_path" VARCHAR(500),
    "size_bytes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "gdpr_export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gdpr_export_jobs_user_id_created_at_idx" ON "gdpr_export_jobs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "gdpr_export_jobs_expires_at_idx" ON "gdpr_export_jobs"("expires_at");
