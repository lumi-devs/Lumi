import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import type { ILogger } from "#src/shared/Index.ts";

export const RetentionBatchSize = 1000;

export interface RetentionPurgeOptions {

  archiveDir?: string | null;

  batchSize?: number;
}

export async function writeRetentionArchive(
  archiveDir: string,
  table: string,
  rows: readonly unknown[],
): Promise<void> {
  if (rows.length === 0) return;

  const dir = path.join(archiveDir, table);
  await mkdir(dir, { recursive: true });

  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const filename = `${day}-${now.getTime()}-${process.pid}.jsonl.gz`;
  const jsonl = `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;

  await writeFile(path.join(dir, filename), gzipSync(jsonl));
}

export interface PurgeBatchRunnerOptions<TRow extends { id: number }> {

  table: string;
  archiveDir?: string | null;
  batchSize?: number;
  logger: ILogger;

  findBatch: (afterId: number | null, batchSize: number) => Promise<TRow[]>;

  deleteByIds: (ids: number[]) => Promise<number>;
}

export async function purgeInBatchesWithArchive<TRow extends { id: number }>(
  options: PurgeBatchRunnerOptions<TRow>,
): Promise<number> {
  const batchSize = options.batchSize ?? RetentionBatchSize;
  const archiveDir = options.archiveDir ?? null;
  let cursor: number | null = null;
  let totalDeleted = 0;

  for (;;) {
    const batch = await options.findBatch(cursor, batchSize);
    if (batch.length === 0) break;

    if (archiveDir) {
      try {
        await writeRetentionArchive(archiveDir, options.table, batch);
      } catch (err) {
        options.logger.error(
          `[Retention] Failed to archive a batch of ${batch.length} ${options.table} row(s) before deletion - leaving them in place and stopping this sweep:`,
          err,
        );
        break;
      }
    }

    const ids = batch.map((row) => row.id);
    totalDeleted += await options.deleteByIds(ids);

    if (batch.length < batchSize) break;
    cursor = ids[ids.length - 1]!;
  }

  return totalDeleted;
}
