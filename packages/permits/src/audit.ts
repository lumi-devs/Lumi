import { Prisma, type PrismaClient } from "@prisma/client";

export interface PermitAuditLogEntry {
  id: string;
  guildId: string;
  userId: string;
  action: string;
  targetId: string | null;
  targetType: string | null;
  changes: Prisma.JsonValue | null;
  createdAt: Date;
}

export interface PermitAuditLogInput {
  guildId: string;
  userId: string;
  action: string;
  targetId?: string | null;
  targetType?: string | null;
  changes?: Prisma.InputJsonValue | null;
}

export interface PermitAuditLogQuery {
  userId?: string;
  action?: string;
  limit?: number;
  offset?: number;
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
