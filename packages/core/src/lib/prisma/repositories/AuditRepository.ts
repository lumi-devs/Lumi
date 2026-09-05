import type { AuditLedger, Prisma } from "@prisma/client";
import { hostname } from "node:os";
import { mapWithConcurrency } from "#lib/utilities/concurrency.js";
import { RedisKeys } from "#lib/database/redis.js";
import { Repository } from "#lib/prisma/repositories/Repository.js";
import { getWriteBucket } from "#lib/env.js";

import { tryParseJSON } from "@sapphire/utilities";

/**
 * Per-process, so two overlapping workers cannot both read the other's pending
 * entries and insert the same audit rows twice.
 */
const AuditConsumer = `${hostname()}:${process.pid}`;

/** How long a delivered-but-unacked entry must sit before another run reclaims it. */
const StalePendingMs = 60_000;

/**
 * Approximate cap on the buffer stream. If the flush task stops - a crash loop,
 * a Postgres outage - the stream would otherwise grow without bound and take
 * the cache tier down with it. At ~200 bytes an entry this is roughly 100 MB of
 * headroom, far more than a healthy flush ever accumulates, so trimming only
 * ever discards the oldest entries of an already-broken backlog.
 */
const AuditStreamMaxlen = 500_000;

/**
 * Number of stream buckets the fleet spreads audit writes across. Fixed rather
 * than derived from shard count so the consumer knows the full key space
 * without coordination, and so changing shard count never strands a bucket.
 */
const AuditStreamBuckets = 16;

/**
 * This process always writes to the same bucket, which keeps each stream's
 * entries roughly time-ordered and avoids scattering one process's writes.
 */
const WriteBucket = getWriteBucket(AuditStreamBuckets);

export interface AuditLogPayload {
  guildId: string;
  userId: string;
  action: string;
  platform: string;
  details?: unknown;
}

export interface AuditLedgerFilter {
  guildId?: string;
  userId?: string;
  action?: string;
  platform?: string;
  skip?: number;
  take?: number;
}

/**
 * Buffered audit log - writes land in a Redis Stream (`auditLogsQueue`) and are
 * drained to the `AuditLedger` Postgres table in batches via a consumer group.
 */
export class AuditRepository extends Repository {
  public async queueAuditLog(payload: AuditLogPayload) {
    await this.redis.xadd(
      RedisKeys.auditLogsQueue(WriteBucket),
      "MAXLEN",
      "~",
      AuditStreamMaxlen,
      "*",
      "payload",
      JSON.stringify(payload),
    );
  }

  public async queueAuditLogsBatch(payloads: AuditLogPayload[]) {
    if (!payloads.length) return;
    const pipeline = this.redis.pipeline();
    const key = RedisKeys.auditLogsQueue(WriteBucket);
    for (const payload of payloads) {
      pipeline.xadd(
        key,
        "MAXLEN",
        "~",
        AuditStreamMaxlen,
        "*",
        "payload",
        JSON.stringify(payload),
      );
    }
    await pipeline.exec();
  }

  /**
   * Drains every bucket, not just this process's own: the flush task is unicast,
   * so whichever process handles a fire is responsible for the whole key space.
   */
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
    const key = RedisKeys.auditLogsQueue(bucket);
    await this.#ensureGroup(key);

    type XReadGroupReply = [string, [string, string[]][]][] | null;
    type XAutoClaimReply = [string, [string, string[]][], string[]?] | null;

    // Reclaim entries a previous run delivered but never acked - a crash, or an
    // overlapping deploy - before taking anything new. XAUTOCLAIM is used
    // rather than a pending read against our own name because the consumer name
    // is per-process, so the stranded entries belong to a name we no longer use.
    const claimed = (await this.redis.xautoclaim(
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
      const results = (await this.redis.xreadgroup(
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
      await this.redis.xack(key, "audit_workers", ...persistedIds);
      await this.redis.xdel(key, ...persistedIds);
    }

    return persistedEntryCount;
  }

  // Omitting `guildId` reads across every guild — bot-owner scoped callers only.
  public async listAuditLogs(
    filter: AuditLedgerFilter = {},
  ): Promise<{ entries: AuditLedger[]; total: number }> {
    const where = {
      ...(filter.guildId ? { guildId: filter.guildId } : {}),
      ...(filter.userId ? { userId: filter.userId } : {}),
      ...(filter.action ? { action: { contains: filter.action } } : {}),
      ...(filter.platform ? { platform: filter.platform } : {}),
    };

    const [entries, total] = await this.prisma.$transaction([
      this.prisma.auditLedger.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: filter.skip ?? 0,
        take: filter.take ?? 25,
      }),
      this.prisma.auditLedger.count({ where }),
    ]);

    return { entries, total };
  }

  async #ensureGroup(key: string) {
    try {
      await this.redis.xgroup("CREATE", key, "audit_workers", "0", "MKSTREAM");
    } catch (err: unknown) {
      if (!(err instanceof Error) || !err.message.includes("BUSYGROUP"))
        throw err;
    }
  }

  public async purgeOldEntries(date: Date): Promise<number> {
    const { count } = await this.prisma.auditLedger.deleteMany({
      where: { createdAt: { lt: date } },
    });
    return count;
  }
}
