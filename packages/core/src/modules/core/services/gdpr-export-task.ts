import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { container } from "@sapphire/framework";
import { Time } from "@sapphire/time-utilities";
import { getGdprExportDir, resolveGdprExportTtlHours } from "#lib/env.js";
import { executeGdprExport } from "#lib/gdpr.js";

export interface GdprExportFirePayload {
  jobId: string;
}

/**
 * Runs one async GDPR export job end to end: builds the export with the same
 * `executeGdprExport()` the synchronous `/mydata getmydata` command uses,
 * gzips it, and writes it under `GDPR_EXPORT_DIR`. A missing job row (deleted
 * or already cleaned up before the fire landed) is logged and skipped rather
 * than treated as a retryable failure.
 */
export async function handleGdprExportFire(
  payload: GdprExportFirePayload,
): Promise<void> {
  const { jobId } = payload;
  const job = await container.db.gdprExportJobs.findById(jobId);
  if (!job) {
    container.logger.warn(
      `[GdprExport] Job ${jobId} fired with no matching row; skipping.`,
    );
    return;
  }

  await container.db.gdprExportJobs.markRunning(jobId);

  try {
    const data = await executeGdprExport(job.userId);
    const compressed = gzipSync(Buffer.from(JSON.stringify(data), "utf-8"));

    const dir = getGdprExportDir();
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${jobId}.json.gz`);
    await writeFile(filePath, compressed);

    const expiresAt = new Date(
      Date.now() + resolveGdprExportTtlHours() * Time.Hour,
    );
    await container.db.gdprExportJobs.markDone(jobId, {
      filePath,
      sizeBytes: compressed.byteLength,
      expiresAt,
    });
  } catch (err) {
    container.logger.error(`[GdprExport] Job ${jobId} failed:`, err);
    await container.db.gdprExportJobs.markFailed(
      jobId,
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Hourly sweep: deletes expired export files and their job rows. A file
 * missing on disk (already cleaned up, or a `filePath` from a job that never
 * finished) doesn't stop the row from being purged.
 */
export async function handleGdprExportCleanupFire(): Promise<void> {
  const expired = await container.db.gdprExportJobs.findExpired();
  if (expired.length === 0) return;

  for (const job of expired) {
    if (!job.filePath) continue;
    try {
      await rm(job.filePath, { force: true });
    } catch (err) {
      container.logger.warn(
        `[GdprExport] Failed to remove expired export file ${job.filePath}:`,
        err,
      );
    }
  }

  const deleted = await container.db.gdprExportJobs.deleteByIds(
    expired.map((job) => job.id),
  );
  container.logger.info(
    `[GdprExport] Cleaned up ${deleted} expired export job(s).`,
  );
}
