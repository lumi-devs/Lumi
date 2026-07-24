import type { Prisma } from "@prisma/client";
import { RedisKeys } from "#lib/database/redis.js";
import { Repository } from "#lib/prisma/repositories/Repository.js";

import { tryParseJSON } from "@sapphire/utilities";

export interface AuditLogPayload {
  guildId: string;
  userId: string;
  action: string;
  platform: string;
  details?: unknown;
}

/**
 * Buffered audit log — writes land in a Redis Stream (`auditLogsQueue`) and are
 * drained to the `AuditLedger` Postgres table in batches via a consumer group.
 */
export class AuditRepository extends Repository {
  public async queueAuditLog(payload: AuditLogPayload) {
    await this.redis.xadd(
      RedisKeys.auditLogsQueue(),
      "*",
      "payload",
      JSON.stringify(payload),
    );
  }

  public async queueAuditLogsBatch(payloads: AuditLogPayload[]) {
    if (!payloads.length) return;
    const pipeline = this.redis.pipeline();
    const key = RedisKeys.auditLogsQueue();
    for (const payload of payloads) {
      pipeline.xadd(key, "*", "payload", JSON.stringify(payload));
    }
    await pipeline.exec();
  }

  public async flushAuditLogsToPostgres(batchSize = 500) {
    const key = RedisKeys.auditLogsQueue();
    await this.#ensureGroup(key);

    type XReadGroupReply = [string, [string, string[]][]][] | null;

    let results = (await this.redis.xreadgroup(
      "GROUP",
      "audit_workers",
      "worker_1",
      "COUNT",
      batchSize,
      "STREAMS",
      key,
      "0",
    )) as XReadGroupReply;
    if (!results?.[0]?.[1]?.length) {
      results = (await this.redis.xreadgroup(
        "GROUP",
        "audit_workers",
        "worker_1",
        "COUNT",
        batchSize,
        "STREAMS",
        key,
        ">",
      )) as XReadGroupReply;
    }

    const messages = results?.[0]?.[1] ?? [];
    if (!messages.length) return 0;

    const payloads: AuditLogPayload[] = [];
    const ids: string[] = [];

    for (const [id, fields] of messages) {
      ids.push(id);
      try {
        const idx = fields.indexOf("payload");
        const raw = idx === -1 ? undefined : fields[idx + 1];
        if (raw === undefined) {
          this.logger.warn(
            `[AuditRepository] Entry ${id} is missing the "payload" field — skipping.`,
          );
        } else {
          const parsed = tryParseJSON(raw);
          if (parsed) payloads.push(parsed as AuditLogPayload);
        }
      } catch (err: unknown) {
        this.logger.error(
          "[AuditRepository] Malformed audit log entry:",
          id,
          err,
        );
      }
    }

    if (payloads.length) {
      try {
        await this.prisma.auditLedger.createMany({
          data: payloads.map((p) => ({
            guildId: p.guildId,
            userId: p.userId,
            action: p.action,
            platform: p.platform,
            details: p.details as Prisma.InputJsonValue,
          })),
        });
      } catch (err) {
        this.logger.error("[AuditRepository] Postgres flush failed:", err);
        throw err;
      }
    }

    await this.redis.xack(key, "audit_workers", ...ids);
    await this.redis.xdel(key, ...ids);

    return payloads.length;
  }

  async #ensureGroup(key: string) {
    try {
      await this.redis.xgroup("CREATE", key, "audit_workers", "0", "MKSTREAM");
    } catch (err: unknown) {
      if (!(err instanceof Error) || !err.message.includes("BUSYGROUP"))
        throw err;
    }
  }
}
