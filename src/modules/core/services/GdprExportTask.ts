import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { type Container } from "#src/lib/Services.js";
import { Time } from "#src/shared/Index.ts";
import { getGdprExportDir, resolveGdprExportTtlHours } from "#src/lib/Env.js";
import { executeGdprExport } from "#src/lib/gdpr/Requests.js";
import { loadOrMintKeyFile, dataFile, sealBytes } from "#src/lib/crypto/Seal.js";

export interface GdprExportFirePayload {
  jobId: string;
}

export async function handleGdprExportFire(
  services: Container,
  payload: GdprExportFirePayload,
): Promise<void> {
  const { jobId } = payload;
  const job = await services.db.gdprExportJobs.findById(jobId);
  if (!job) {
    services.logger.warn(
      `[GdprExport] Job ${jobId} fired with no matching row; skipping.`,
    );
    return;
  }

  await services.db.gdprExportJobs.markRunning(jobId);

  try {
    const data = await executeGdprExport(services, job.userId);
    const compressed = Buffer.from(Bun.gzipSync(Buffer.from(JSON.stringify(data), "utf-8")));
    const key = loadOrMintKeyFile(dataFile("secrets", "gdpr-export.key"));
    const sealed = Buffer.from(sealBytes(key, compressed), "utf8");

    const dir = getGdprExportDir();
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${crypto.randomUUID()}.json.gz.enc`);
    await Bun.write(filePath, sealed);

    const expiresAt = new Date(
      Date.now() + resolveGdprExportTtlHours() * Time.Hour,
    );
    await services.db.gdprExportJobs.markDone(jobId, {
      filePath,
      sizeBytes: sealed.byteLength,
      expiresAt,
    });
  } catch (err) {
    services.logger.error(`[GdprExport] Job ${jobId} failed:`, err);
    await services.db.gdprExportJobs.markFailed(
      jobId,
      err instanceof Error ? err.message : String(err),
    );
  }
}

export async function handleGdprExportCleanupFire(services: Container): Promise<void> {
  const expired = await services.db.gdprExportJobs.findExpired();
  if (expired.length === 0) return;

  for (const job of expired) {
    if (!job.filePath) continue;
    try {
      await rm(job.filePath, { force: true });
    } catch (err) {
      services.logger.warn(
        `[GdprExport] Failed to remove expired export file ${job.filePath}:`,
        err,
      );
    }
  }

  const deleted = await services.db.gdprExportJobs.deleteByIds(
    expired.map((job) => job.id),
  );
  services.logger.info(
    `[GdprExport] Cleaned up ${deleted} expired export job(s).`,
  );
}
