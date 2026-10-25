import { PrismaClient, Prisma } from "@prisma/client";
import Redis from "ioredis";
import { evaluatePermit } from "./evaluator.js";
import type { 
  Permit, 
  PermitAssignment, 
  PermitChainResult,
  PermitTargetType,
  EvaluatePermitOptions,
  PermitTierExplanation,
  EvaluatedPermit
} from "./types.js";

export interface PermitAuditLogEntry {
  id: string;
  guildId: string;
  userId: string;
  action: string;
  targetId: string | null;
  targetType: string | null;
  changes: any;
  createdAt: Date;
}

export interface PermitExportData {
  permits: any[];
  assignments: any[];
  version: number;
  exportedAt: string;
  guildId: string;
}

export class PermitRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {}

  async listPermits(guildId: string): Promise<Permit[]> {
    return this.prisma.permit.findMany({
      where: { guildId },
      orderBy: { position: "asc" },
      include: { assignments: true },
    });
  }

  async getPermit(guildId: string, permitId: number): Promise<Permit | null> {
    return this.prisma.permit.findFirst({
      where: { id: permitId, guildId },
      include: { assignments: true },
    });
  }

  async createPermit(data: {
    guildId: string;
    name: string;
    node: string;
    polarity: "GRANT" | "DENY";
    position: number;
    builtin?: boolean;
    expiresAt?: Date | null;
    schedule?: string | null;
    timezone?: string | null;
    conditions?: any | null;
  }): Promise<Permit> {
    return this.prisma.permit.create({
      data: {
        ...data,
      },
      include: { assignments: true },
    });
  }

  async updatePermit(permitId: number, data: Partial<Permit>): Promise<Permit | null> {
    return this.prisma.permit.update({
      where: { id: permitId },
      data,
      include: { assignments: true },
    });
  }

  async deletePermit(permitId: number): Promise<boolean> {
    const result = await this.prisma.permit.delete({
      where: { id: permitId },
    });
    return !!result;
  }

  async movePermit(guildId: string, permitId: number, direction: "up" | "down"): Promise<boolean> {
    const permit = await this.prisma.permit.findFirst({
      where: { id: permitId, guildId },
    });
    if (!permit) return false;

    const adjacent = await this.prisma.permit.findFirst({
      where: {
        guildId,
        position: direction === "up" ? { lt: permit.position } : { gt: permit.position },
      },
      orderBy: { position: direction === "up" ? "desc" : "asc" },
    });

    if (!adjacent) return false;

    await this.prisma.$transaction(async (tx) => {
      await tx.permit.update({
        where: { id: permitId },
        data: { position: adjacent.position },
      });
      await tx.permit.update({
        where: { id: adjacent.id },
        data: { position: permit.position },
      });
    });

    return true;
  }

  async assignPermit(
    permitId: number,
    targetType: PermitTargetType,
    targetId: string,
    grantedBy: string,
    expiresAt?: Date | null
  ): Promise<PermitAssignment> {
    return this.prisma.permitAssignment.create({
      data: {
        permitId,
        targetType,
        targetId,
        grantedBy,
        expiresAt,
      },
    });
  }

  async unassignPermit(permitId: number, targetType: PermitTargetType, targetId: string): Promise<boolean> {
    const result = await this.prisma.permitAssignment.delete({
      where: {
        permitId_targetType_targetId: {
          permitId,
          targetType,
          targetId,
        },
      },
    });
    return !!result;
  }

  async getPermitChain(
    guildId: string,
    userId: string,
    chain: Array<{ targetType: PermitTargetType; targetId: string }>
  ): Promise<PermitChainResult> {
    const permits = await this.prisma.permit.findMany({
      where: { guildId },
      include: {
        assignments: {
          where: {
            OR: chain.map(({ targetType, targetId }) => ({
              targetType,
              targetId,
            })),
          },
        },
      },
      orderBy: { position: "asc" },
    });

    // Check quarantine in Redis: lumi:mod:{guildId}:quarantine:{userId}
    const quarantineKey = `lumi:mod:${guildId}:quarantine:${userId}`;
    const quarantineValue = await this.redis.get(quarantineKey);
    const isQuarantined = quarantineValue !== null && quarantineValue !== "0";

    const tiers = permits.map((permit: any) => {
      const grant: string[] = [];
      const deny: string[] = [];

      for (const assignment of permit.assignments) {
        if (permit.polarity === "GRANT") {
          grant.push(permit.node);
        } else {
          deny.push(permit.node);
        }
      }

      return { custom: { grant, deny } };
    });

    return { tiers, isQuarantined };
  }

  async getValidPermits(guildId: string, options: {
    userId: string;
    roleIds?: string[];
    channelId?: string;
    at: Date;
  }): Promise<Permit[]> {
    return this.prisma.permit.findMany({
      where: {
        guildId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gte: options.at } },
        ],
      },
      include: { assignments: true },
      orderBy: { position: "asc" },
    });
  }

  async explainPermit(options: EvaluatePermitOptions): Promise<EvaluatedPermit> {
    const { evaluatePermit } = await import("./evaluator.js");
    
    const permits = await this.getValidPermits(options.guildId, {
      userId: options.userId,
      roleIds: options.roleIds,
      channelId: options.channelId,
      at: options.at ?? new Date(),
    });

    const assignments = await this.prisma.permitAssignment.findMany({
      where: {
        permit: { guildId: options.guildId },
      },
    });

    // Get user's role IDs if not provided
    let roleIds = options.roleIds;
    if (!roleIds && options.guildId && options.userId) {
      // This would need guild member fetch - for now use provided roleIds
    }

    // Use evaluatePermit with a container that provides getPermitChain
    const container = {
      db: {
        permits: {
          getPermitChain: this.getPermitChain.bind(this),
        },
      },
      client: null,
    };

    return evaluatePermit(options, container);
  }

  async seedBuiltinPermits(guildId: string): Promise<void> {
    const builtins = [
      { name: "Extra Owner", node: "*", position: 0 },
      { name: "Trusted Admin", node: "admin.*", position: 1 },
    ];

    for (const builtin of builtins) {
      await this.prisma.permit.upsert({
        where: { guildId_name: { guildId, name: builtin.name } },
        update: {},
        create: {
          guildId,
          name: builtin.name,
          node: builtin.node,
          polarity: "GRANT",
          position: builtin.position,
          builtin: true,
        },
      });
    }
  }

  // Permit Audit Log
  async createAuditLog(data: {
    guildId: string;
    userId: string;
    action: string;
    targetId?: string | null;
    targetType?: string | null;
    changes?: any;
  }): Promise<PermitAuditLogEntry> {
    return this.prisma.auditLog.create({
      data: {
        guildId: data.guildId,
        userId: data.userId,
        action: data.action,
        targetId: data.targetId ?? null,
        targetType: data.targetType ?? null,
        changes: data.changes ?? null,
      },
    });
  }

  async getAuditLogs(guildId: string, options: {
    userId?: string;
    action?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<PermitAuditLogEntry[]> {
    return this.prisma.auditLog.findMany({
      where: {
        guildId,
        ...(options.userId && { userId: options.userId }),
        ...(options.action && { action: options.action }),
      },
      orderBy: { createdAt: "desc" },
      take: options.limit ?? 50,
      skip: options.offset ?? 0,
    });
  }

  // Permit Import/Export
  async exportPermits(guildId: string): Promise<PermitExportData> {
    const permits = await this.prisma.permit.findMany({
      where: { guildId },
      include: { assignments: true },
      orderBy: { position: "asc" },
    });

    const assignments = await this.prisma.permitAssignment.findMany({
      where: { permit: { guildId } },
    });

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      guildId,
      permits: permits.map((p: any) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        expiresAt: p.expiresAt?.toISOString() ?? null,
      })),
      assignments: assignments.map((a: any) => ({
        ...a,
        grantedAt: a.grantedAt.toISOString(),
        expiresAt: a.expiresAt?.toISOString() ?? null,
      })),
    };
  }

  async importPermits(guildId: string, data: PermitExportData, options: {
    overwrite?: boolean;
    skipBuiltin?: boolean;
    userId: string; // for audit log
  } = { overwrite: false, skipBuiltin: true, userId: "unknown" }): Promise<{
    imported: number;
    skipped: number;
    errors: string[];
  }> {
    const result = { imported: 0, skipped: 0, errors: [] as string[] };

    // Verify guild matches
    if (data.guildId !== guildId) {
      result.errors.push("Guild ID mismatch in import data");
      return result;
    }

    // Check version compatibility
    if (data.version > 1) {
      result.errors.push(`Unsupported export version: ${data.version}`);
      return result;
    }

    for (const permitData of data.permits) {
      try {
        // Skip builtin permits if option is set
        if (options.skipBuiltin && permitData.builtin) {
          result.skipped++;
          continue;
        }

        // Check if permit already exists
        const existing = await this.prisma.permit.findUnique({
          where: { guildId_name: { guildId, name: permitData.name } },
        });

        if (existing) {
          if (options.overwrite) {
            // Delete existing and its assignments
            await this.prisma.permit.delete({ where: { id: existing.id } });
          } else {
            result.skipped++;
            continue;
          }
        }

        // Create permit
        const permit = await this.prisma.permit.create({
          data: {
            guildId,
            name: permitData.name,
            node: permitData.node,
            polarity: permitData.polarity,
            position: permitData.position,
            builtin: permitData.builtin,
            expiresAt: permitData.expiresAt ? new Date(permitData.expiresAt) : null,
            schedule: permitData.schedule,
            timezone: permitData.timezone,
            conditions: permitData.conditions,
            createdAt: permitData.createdAt ? new Date(permitData.createdAt) : undefined,
            updatedAt: permitData.updatedAt ? new Date(permitData.updatedAt) : undefined,
          },
        });

        // Create assignments
        const permitAssignments = data.assignments.filter(a => a.permitId === permitData.id);
        for (const assignment of permitAssignments) {
          await this.prisma.permitAssignment.create({
            data: {
              permitId: permit.id,
              targetType: assignment.targetType,
              targetId: assignment.targetId,
              grantedBy: assignment.grantedBy,
              expiresAt: assignment.expiresAt ? new Date(assignment.expiresAt) : null,
              grantedAt: assignment.grantedAt ? new Date(assignment.grantedAt) : undefined,
            },
          });
        }

        // Audit log
        await this.createAuditLog({
          guildId,
          userId: options.userId,
          action: "PERMIT_IMPORT",
          targetId: permit.id.toString(),
          targetType: "PERMIT",
          changes: { name: permit.name, node: permit.node, polarity: permit.polarity },
        });

        result.imported++;
      } catch (error: any) {
        result.errors.push(`Failed to import permit ${permitData.name}: ${error.message}`);
      }
    }

    return result;
  }
}