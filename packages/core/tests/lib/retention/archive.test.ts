import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import {
  purgeInBatchesWithArchive,
  writeRetentionArchive,
} from "#lib/retention/archive.js";

function mockLogger(): import("@lumi/shared").ILogger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as import("@lumi/shared").ILogger;
}

describe("writeRetentionArchive", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "lumi-retention-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes rows as gzip-compressed JSONL under <dir>/<table>/", async () => {
    const rows = [{ id: 1, foo: "a" }, { id: 2, foo: "b" }];
    await writeRetentionArchive(dir, "audit_ledger", rows);

    const files = await readdir(path.join(dir, "audit_ledger"));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}-\d+-\d+\.jsonl\.gz$/);

    const raw = await readFile(path.join(dir, "audit_ledger", files[0]!));
    const jsonl = gunzipSync(raw).toString("utf8");
    const lines = jsonl.trim().split("\n").map((line) => JSON.parse(line));
    expect(lines).toEqual(rows);
  });

  it("does nothing for an empty batch", async () => {
    await writeRetentionArchive(dir, "audit_ledger", []);
    await expect(readdir(path.join(dir, "audit_ledger"))).rejects.toThrow();
  });
});

describe("purgeInBatchesWithArchive", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "lumi-retention-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("deletes in bounded, id-ordered batches", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: i + 1 }));
    const findBatch = vi.fn(async (afterId: number | null, batchSize: number) =>
      rows.filter((r) => (afterId === null ? true : r.id > afterId)).slice(0, batchSize),
    );
    const deleteByIds = vi.fn(async (ids: number[]) => ids.length);

    const total = await purgeInBatchesWithArchive({
      table: "t",
      batchSize: 2,
      logger: mockLogger(),
      findBatch,
      deleteByIds,
    });

    expect(total).toBe(5);
    // ceil(5/2) = 3 batches, the last one short (1 row) ends the loop.
    expect(deleteByIds.mock.calls).toEqual([[[1, 2]], [[3, 4]], [[5]]]);
    expect(findBatch.mock.calls.map((c) => c[0])).toEqual([null, 2, 4]);
  });

  it("archives a batch before deleting it", async () => {
    const order: string[] = [];
    const rows = [{ id: 1 }, { id: 2 }];
    const findBatch = vi.fn(async (_afterId: number | null, _batchSize: number) => rows);
    const deleteByIds = vi.fn(async (ids: number[]) => {
      order.push("delete");
      return ids.length;
    });

    const total = await purgeInBatchesWithArchive({
      table: "t",
      archiveDir: dir,
      batchSize: 10,
      logger: mockLogger(),
      findBatch: async (afterId, batchSize) => {
        if (afterId !== null) return [];
        order.push("find");
        return findBatch(afterId, batchSize);
      },
      deleteByIds,
    });

    expect(total).toBe(2);
    const files = await readdir(path.join(dir, "t"));
    expect(files).toHaveLength(1);
    const raw = await readFile(path.join(dir, "t", files[0]!));
    const archived = gunzipSync(raw).toString("utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(archived).toEqual(rows);
    expect(order).toEqual(["find", "delete"]);
  });

  it("leaves the batch undeleted and stops the sweep when archiving fails", async () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const findBatch = vi.fn(async (afterId: number | null) => (afterId === null ? rows : []));
    const deleteByIds = vi.fn(async (ids: number[]) => ids.length);
    const logger = mockLogger();

    const total = await purgeInBatchesWithArchive({
      table: "t",
      archiveDir: path.join(dir, "does", "not", "exist", "\0bad"),
      batchSize: 10,
      logger,
      findBatch,
      deleteByIds,
    });

    expect(total).toBe(0);
    expect(deleteByIds).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect((logger.error as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toContain("Failed to archive");
  });
});
