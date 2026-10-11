import type { AuditLedger, AuditPlatform, Prisma } from "@prisma/client";
import { hostname } from "node:os";
import { mapWithConcurrency } from "#src/lib/utilities/Concurrency.js";
import { ValkeyKeys } from "#src/lib/valkey/Client.js";
import { Repository } from "#src/lib/prisma/repositories/Repository.js";
import { getWriteBucket } from "#src/lib/Env.js";
import {
  purgeInBatchesWithArchive,
  type RetentionPurgeOptions,
} from "#src/lib/Retention.js";
import {
  CreatedAtIdOrderBy,
  paginateCreatedAtId,
} from "#src/lib/prisma/Cursor.js";

import { tryParseJSON } from "#src/shared/Index.ts";
import { Time } from "#src/shared/Index.ts";

const AuditConsumer = `${hostname()}:${process.pid}`;

const StalePendingMs = Time.Minute;

const AuditStreamMaxlen = 500_000;

const AuditStreamBuckets = 16;

const WriteBucket = getWriteBucket(AuditStreamBuckets);

export interface AuditLogPayload {
  guildId: string;
  userId: string;
  action: string;
  platform: AuditPlatform;
  details?: unknown;
}

export interface AuditLedgerFilter {
  guildId?: string;
  userId?: string;
  action?: string;
  platform?: AuditPlatform;
  take?: number;

  cursor?: string;
}

export class AuditRepository extends Repository {
  public async queueAuditLog(payload: AuditLogPayload) {
    await this.valkey.xadd(
      ValkeyKeys.auditLogsQueue(WriteBucket),
      "MAXLEN",
      "~",
      AuditStreamMaxlen,
      "*",
      "payload",
      JSON.stringify(payload),
    );
  }

  public async flushAuditLogsToPostgres(batchSize = 500) {
    const perBucket = Math.max(1, Math.floor(batchSize / AuditStreamBuckets));
    let total = 0;

    await mapWithConcurrency(
      Array.from({ length: AuditStreamBuckets }, (_, i) => i),
      4,
      async (bucket) => {
        total += await this.#flushBucket(bucket, perBucket);
      },
    );

    return total;
  }

  async #flushBucket(bucket: number, batchSize: number) {
    const key = ValkeyKeys.auditLogsQueue(bucket);
    await this.#ensureGroup(key);

    type XReadGroupReply = [string, [string, string[]][]][] | null;
    type XAutoClaimReply = [string, [string, string[]][], string[]?] | null;

    const claimed = (await this.valkey.xautoclaim(
      key,
      "audit_workers",
      AuditConsumer,
      StalePendingMs,
      "0-0",
      "COUNT",
      batchSize,
    )) as XAutoClaimReply;

    let messages = claimed?.[1] ?? [];

    if (!messages.length) {
      const results = (await this.valkey.xreadgroup(
        "GROUP",
        "audit_workers",
        AuditConsumer,
        "COUNT",
        batchSize,
        "STREAMS",
        key,
        ">",
      )) as XReadGroupReply;
      messages = results?.[0]?.[1] ?? [];
    }

    if (!messages.length) return 0;

    const entries: { id: string; payload: AuditLogPayload }[] = [];
    const droppedIds: string[] = [];

    for (const [id, fields] of messages) {
      try {
        const idx = fields.indexOf("payload");
        const raw = idx === -1 ? undefined : fields[idx + 1];
        if (raw === undefined) {
          this.logger.warn(
            `[AuditRepository] Entry ${id} is missing the "payload" field - skipping.`,
          );
          droppedIds.push(id);
        } else {
          const parsed = tryParseJSON(raw);
          if (parsed) {
            entries.push({ id, payload: parsed as AuditLogPayload });
          } else {
            droppedIds.push(id);
          }
        }
      } catch (err: unknown) {
        this.logger.error(
          "[AuditRepository] Malformed audit log entry:",
          id,
          err,
        );
        droppedIds.push(id);
      }
    }

    const persistedIds: string[] = [...droppedIds];
    let persistedEntryCount = 0;

    if (entries.length) {
      const guildIds = new Set(entries.map(({ payload: p }) => p.guildId));
      await Promise.all(
        Array.from(guildIds, (guildId) => this.db.ensureGuild(guildId)),
      );

      try {
        await this.prisma.auditLedger.createMany({
          data: entries.map(({ payload: p }) => ({
            guildId: p.guildId,
            userId: p.userId,
            action: p.action,
            platform: p.platform,
            details: p.details as Prisma.InputJsonValue,
          })),
        });
        persistedIds.push(...entries.map((e) => e.id));
        persistedEntryCount = entries.length;
      } catch (err) {
        this.logger.error(
          "[AuditRepository] Postgres batch flush failed, falling back to per-row insert:",
          err,
        );
        for (const { id, payload: p } of entries) {
          try {
            await this.prisma.auditLedger.create({
              data: {
                guildId: p.guildId,
                userId: p.userId,
                action: p.action,
                platform: p.platform,
                details: p.details as Prisma.InputJsonValue,
              },
            });
            persistedIds.push(id);
            persistedEntryCount++;
          } catch (rowErr) {
            this.logger.error(
              `[AuditRepository] Dropping unpersistable audit log entry ${id}:`,
              rowErr,
            );
          }
        }
      }
    }

    if (persistedIds.length) {
      await this.valkey.xack(key, "audit_workers", ...persistedIds);
      await this.valkey.xdel(key, ...persistedIds);
    }

    return persistedEntryCount;
  }

  public async listAuditLogs(
    filter: AuditLedgerFilter = {},
  ): Promise<{ entries: AuditLedger[]; total?: number; nextCursor: string | null }> {
    const baseWhere = {
      ...(filter.guildId ? { guildId: filter.guildId } : {}),
      ...(filter.userId ? { userId: filter.userId } : {}),
      ...(filter.action ? { action: { contains: filter.action } } : {}),
      ...(filter.platform ? { platform: filter.platform } : {}),
    };
    const result = await paginateCreatedAtId(
      (where) =>
        this.prisma.auditLedger.findMany({
          where: where as Prisma.AuditLedgerWhereInput,
          orderBy: CreatedAtIdOrderBy,
          take: (filter.take ?? 25) + 1,
        }),
      (where) => this.prisma.auditLedger.count({ where: where as Prisma.AuditLedgerWhereInput }),
      baseWhere,
      filter,
    );
    return {
      entries: result.rows,
      total: result.total,
      nextCursor: result.nextCursor,
    };
  }

  async #ensureGroup(key: string) {
    try {
      await this.valkey.xgroup("CREATE", key, "audit_workers", "0", "MKSTREAM");
    } catch (err: unknown) {
      if (!(err instanceof Error) || !err.message.includes("BUSYGROUP"))
        throw err;
    }
  }

  public async purgeOldEntries(
    date: Date,
    options: RetentionPurgeOptions = {},
  ): Promise<number> {
    return purgeInBatchesWithArchive({
      table: "audit_ledger",
      archiveDir: options.archiveDir,
      batchSize: options.batchSize,
      logger: this.logger,
      findBatch: (afterId, batchSize) =>
        this.prisma.auditLedger.findMany({
          where: {
            createdAt: { lt: date },
            ...(afterId === null ? {} : { id: { gt: afterId } }),
          },
          orderBy: { id: "asc" },
          take: batchSize,
        }),
      deleteByIds: async (ids) => {
        const { count } = await this.prisma.auditLedger.deleteMany({
          where: { id: { in: ids } },
        });
        return count;
      },
    });
  }
}
