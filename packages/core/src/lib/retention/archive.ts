import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import type { ILogger } from "@lumi/shared";

/** Default page size for batched retention deletes - bounds how long any single delete holds row locks. */
export const RetentionBatchSize = 1000;

export interface RetentionPurgeOptions {
  /** Root archive directory - unset skips archiving and just deletes. */
  archiveDir?: string | null;
  /** Rows per delete batch. Defaults to {@linkcode RetentionBatchSize}. */
  batchSize?: number;
}

/**
 * Writes `rows` as gzip-compressed JSONL to
 * `<archiveDir>/<table>/<date>-<timestamp>-<pid>.jsonl.gz`. One file per
 * call, never appended to - a run walking several batches produces several
 * files, so a crash mid-write can never corrupt a file an earlier batch
 * already finished.
 */
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
  /** Archive subdirectory name for this table, e.g. `"audit_ledger"`. */
  table: string;
  archiveDir?: string | null;
  batchSize?: number;
  logger: ILogger;
  /** Fetches up to `batchSize` eligible rows with `id > afterId`, ordered by `id` ascending. */
  findBatch: (afterId: number | null, batchSize: number) => Promise<TRow[]>;
  /** Deletes exactly the given ids, returning how many rows were actually removed. */
  deleteByIds: (ids: number[]) => Promise<number>;
}

/**
 * Deletes matching rows in bounded, id-ordered batches so no single delete
 * holds row locks for longer than `batchSize` rows. When `archiveDir` is
 * set, each batch is archived (see {@linkcode writeRetentionArchive}) before
 * it's deleted; if the archive write fails, that batch is left in place and
 * the sweep stops for this call rather than deleting unarchived data - the
 * next scheduled run retries from the same starting point, since nothing
 * before it was deleted either.
 */
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
