import { type PrismaClient, Prisma } from "@prisma/client";
import type Redis from "ioredis";
import {
  evaluateNodeMatch,
  evaluatePermit,
  evaluatePermitWithChain,
  isPermitValid,
  matchesConditions,
} from "./evaluator.js";
import type { 
  Permit, 
  PermitAssignment, 
  PermitChainResult,
  PermitTargetType,
  Polarity,
  EvaluatePermitOptions,
  EvaluatedPermit,
  PermitConditions
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

function isPermitNumberConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== "P2002") return false;
  const target = candidate.meta?.target;
  if (Array.isArray(target)) return target.includes("number");
  return typeof target === "string" && target.includes("number");
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
    nodes: string[];
    polarity: Polarity;
    position: number;
    number?: number;
    builtin?: boolean;
    expiresAt?: Date | null;
    schedule?: Prisma.InputJsonValue | null;
    timezone?: string | null;
    conditions?: Prisma.InputJsonValue | null;
  }): Promise<Permit> {
    const nodes = Array.from(
      new Set(data.nodes.map((node) => node.trim()).filter(Boolean)),
    );
    if (nodes.length === 0) {
      throw new Error("A permit needs at least one node.");
    }
    const payload = {
      guildId: data.guildId,
      name: data.name,
      nodes,
      polarity: data.polarity,
      position: data.position,
      builtin: data.builtin ?? false,
      expiresAt: data.expiresAt ?? null,
      schedule: data.schedule ?? Prisma.DbNull,
      timezone: data.timezone ?? null,
      conditions: data.conditions ?? Prisma.DbNull,
    };
    if (data.number !== undefined) {
      return this.prisma.permit.create({
        data: { ...payload, number: data.number },
        include: { assignments: true },
      });
    }
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const number = await this.nextPermitNumber(data.guildId);
      try {
        return await this.prisma.permit.create({
          data: { ...payload, number },
          include: { assignments: true },
        });
      } catch (error) {
        if (!isPermitNumberConflict(error)) throw error;
      }
    }
    throw new Error("Could not allocate a permit number.");
  }

  private async nextPermitNumber(guildId: string): Promise<number> {
    const permits = await this.prisma.permit.findMany({
      where: { guildId },
      select: { number: true },
      orderBy: { number: "asc" },
    });
    let number = 1;
    for (const permit of permits) {
      if (permit.number === number) number += 1;
      else if (permit.number > number) break;
    }
    return number;
  }

  async updatePermit(permitId: number, data: Prisma.PermitUpdateInput): Promise<Permit | null> {
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
    if (!permit || permit.builtin) return false;

    const adjacent = await this.prisma.permit.findFirst({
      where: {
        guildId,
        builtin: false,
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
    const permit = await this.prisma.permit.findUnique({
      where: { id: permitId },
      select: { guildId: true },
    });
    if (!permit) throw new Error("Permit not found");
    return this.prisma.permitAssignment.create({
      data: {
        permitId,
        guildId: permit.guildId,
        targetType,
        targetId,
        grantedBy,
        expiresAt: expiresAt ?? null,
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

    const at = new Date();
    let channelId: string | undefined;
    for (const target of chain) {
      if (target.targetType === "CHANNEL") channelId = target.targetId;
    }
    const roleIds = chain
      .filter((target) => target.targetType === "ROLE")
      .map((target) => target.targetId);
    const conditionContext: EvaluatePermitOptions = {
      guildId,
      userId,
      roleIds,
      channelId,
      permitNode: "",
      at,
    };
    const validPermits = permits.filter((permit) => {
      if (!isPermitValid(permit, at)) return false;
      if (permit.conditions === null) return true;
      return matchesConditions(
        permit.conditions as PermitConditions,
        conditionContext,
      );
    });

    const tiers = chain.map(({ targetType, targetId }) => {
      const grant: string[] = [];
      const deny: string[] = [];
      for (const permit of validPermits) {
        const assigned = permit.assignments.some(
          (assignment) =>
            assignment.targetType === targetType &&
            assignment.targetId === targetId &&
            (assignment.expiresAt === null || assignment.expiresAt >= at),
        );
        if (!assigned) continue;
        if (permit.polarity === "Grant") {
          grant.push(...permit.nodes);
        } else {
          deny.push(...permit.nodes);
        }
      }
      return { custom: { grant, deny } };
    });

    return { tiers, isQuarantined };
  }

  async hasGrantNode(options: EvaluatePermitOptions): Promise<boolean> {
    const chain: Array<{ targetType: PermitTargetType; targetId: string }> = [
      { targetType: "USER", targetId: options.userId },
      ...(options.channelId
        ? [{ targetType: "CHANNEL" as const, targetId: options.channelId }]
        : []),
      ...(options.roleIds ?? []).map((roleId) => ({
        targetType: "ROLE" as const,
        targetId: roleId,
      })),
    ];
    const chainResult = await this.getPermitChain(
      options.guildId,
      options.userId,
      chain,
    );
    if (chainResult.isQuarantined) return false;
    for (const tier of chainResult.tiers) {
      if (
        tier.custom.deny.some((node) =>
          evaluateNodeMatch(node, options.permitNode),
        )
      ) {
        return false;
      }
      if (
        tier.custom.grant.some((node) =>
          evaluateNodeMatch(node, options.permitNode),
        )
      ) {
        return true;
      }
    }
    return false;
  }

  async explainPermit(
    options: EvaluatePermitOptions,
    client: any,
  ): Promise<EvaluatedPermit> {
    const container = {
      db: {
        permits: {
          getPermitChain: this.getPermitChain.bind(this),
        },
      },
      client,
    };
    return evaluatePermit(options, container);
  }

  async explainPermitNodes(
    options: Omit<EvaluatePermitOptions, "permitNode">,
    nodes: string[],
    client: any,
  ): Promise<Map<string, EvaluatedPermit>> {
    const results = new Map<string, EvaluatedPermit>();
    if (nodes.length === 0) return results;

    const chain: Array<{ targetType: PermitTargetType; targetId: string }> = [
      { targetType: "USER", targetId: options.userId },
      ...(options.channelId
        ? [{ targetType: "CHANNEL" as const, targetId: options.channelId }]
        : []),
      ...(options.roleIds ?? []).map((roleId) => ({
        targetType: "ROLE" as const,
        targetId: roleId,
      })),
    ];

    const chainResult = await this.getPermitChain(
      options.guildId,
      options.userId,
      chain,
    );

    for (const node of nodes) {
      results.set(
        node,
        evaluatePermitWithChain(
          { ...options, permitNode: node },
          chainResult,
          client,
        ),
      );
    }

    return results;
  }

  async seedBuiltinPermits(guildId: string): Promise<void> {
    const builtins = [
      { name: "Extra Owner", nodes: ["*"], position: 0 },
      { name: "Trusted Admin", nodes: ["admin.*"], position: 1 },
    ];

    for (const builtin of builtins) {
      const existing = await this.prisma.permit.findUnique({
        where: { guildId_name: { guildId, name: builtin.name } },
        select: { id: true },
      });
      if (existing) continue;
      await this.createPermit({
        guildId,
        name: builtin.name,
        nodes: builtin.nodes,
        polarity: "Grant",
        position: builtin.position,
        builtin: true,
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

    // Reject unsupported export versions
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
            number:
              typeof permitData.number === "number"
                ? permitData.number
                : await this.nextPermitNumber(guildId),
            nodes: permitData.nodes,
            polarity: permitData.polarity,
            position: permitData.position,
            builtin: permitData.builtin,
            expiresAt: permitData.expiresAt ? new Date(permitData.expiresAt) : null,
            schedule: permitData.schedule ?? Prisma.DbNull,
            timezone: permitData.timezone,
            conditions: permitData.conditions ?? Prisma.DbNull,
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
              guildId,
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
          changes: { name: permit.name, nodes: permit.nodes, polarity: permit.polarity },
        });

        result.imported++;
      } catch (error: any) {
        result.errors.push(`Failed to import permit ${permitData.name}: ${error.message}`);
      }
    }

    return result;
  }
}