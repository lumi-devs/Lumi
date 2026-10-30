import { Prisma, type PrismaClient } from "@prisma/client";

export interface PermitAuditLogEntry {
  readonly id: string;
  readonly guildId: string;
  readonly userId: string;
  readonly action: string;
  readonly targetId: string | null;
  readonly targetType: string | null;
  readonly changes: Prisma.JsonValue | null;
  readonly createdAt: Date;
}

export interface PermitAuditLogInput {
  readonly guildId: string;
  readonly userId: string;
  readonly action: string;
  readonly targetId?: string | null;
  readonly targetType?: string | null;
  readonly changes?: Prisma.InputJsonValue | null;
}

export interface PermitAuditLogQuery {
  readonly userId?: string;
  readonly action?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export type AuditLogSource = Pick<PrismaClient, "auditLog">;

export async function createAuditLog(
  db: AuditLogSource,
  data: PermitAuditLogInput,
): Promise<PermitAuditLogEntry> {
  return db.auditLog.create({
    data: {
      guildId: data.guildId,
      userId: data.userId,
      action: data.action,
      targetId: data.targetId ?? null,
      targetType: data.targetType ?? null,
      changes: data.changes ?? Prisma.DbNull,
    },
  });
}

export async function getAuditLogs(
  db: AuditLogSource,
  guildId: string,
  options: PermitAuditLogQuery = {},
): Promise<PermitAuditLogEntry[]> {
  return db.auditLog.findMany({
    where: {
      guildId,
      ...(options.userId ? { userId: options.userId } : {}),
      ...(options.action ? { action: options.action } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: options.limit ?? 50,
    skip: options.offset ?? 0,
  });
}
