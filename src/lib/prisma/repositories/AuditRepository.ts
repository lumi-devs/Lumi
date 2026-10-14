import type { Prisma, AuditLedger } from "@prisma/client";
import { Repository } from "#src/lib/prisma/repositories/Repository.js";
import { paginateCreatedAtId, CreatedAtIdOrderBy } from "#src/lib/prisma/Cursor.js";

export interface AuditLogPayload {
  guildId: string;
  userId: string;
  action: string;
  platform: string;
  details: unknown;
  timestamp?: number;
}

export interface AuditLedgerFilter {
  guildId?: string;
  userId?: string;
  action?: string;
  platform?: string;
  cursor?: string;
  take?: number;
}

const memoryBuffer: AuditLogPayload[] = [];

function escapeLikeWildcards(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export class AuditRepository extends Repository {
  public async queueAuditLog(payload: AuditLogPayload): Promise<void> {
    memoryBuffer.push(payload);
    if (memoryBuffer.length >= 100) {
      await this.flushAuditLogsToPostgres();
    }
  }

  public async flushAuditLogsToPostgres(): Promise<number> {
    if (memoryBuffer.length === 0) return 0;
    const batch = memoryBuffer.splice(0, memoryBuffer.length);
    let inserted = 0;

    for (const p of batch) {
      try {
        await this.prisma.auditLedger.create({
          data: {
            guildId: p.guildId,
            userId: p.userId,
            action: p.action,
            platform: p.platform as any,
            details: p.details as Prisma.InputJsonValue,
          },
        });
        inserted++;
      } catch (err) {
        this.logger.error("[AuditRepository] Failed to write audit row:", err);
      }
    }

    return inserted;
  }

  public async listAuditLogs(
    filter: AuditLedgerFilter = {},
  ): Promise<{ entries: AuditLedger[]; total?: number | undefined; nextCursor: string | null }> {
    const baseWhere = {
      ...(filter.guildId ? { guildId: filter.guildId } : {}),
      ...(filter.userId ? { userId: filter.userId } : {}),
      ...(filter.action ? { action: { contains: escapeLikeWildcards(filter.action) } } : {}),
      ...(filter.platform ? { platform: filter.platform } : {}),
    };
    const result = await paginateCreatedAtId(
      (where: any) =>
        this.prisma.auditLedger.findMany({
          where: where as Prisma.AuditLedgerWhereInput,
          orderBy: CreatedAtIdOrderBy,
          take: (filter.take ?? 25) + 1,
        }),
      (where: any) => this.prisma.auditLedger.count({ where: where as Prisma.AuditLedgerWhereInput }),
      baseWhere,
      filter,
    );
    return {
      entries: result.rows,
      total: result.total,
      nextCursor: result.nextCursor,
    };
  }
}
